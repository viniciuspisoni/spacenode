#include "SpaceNodePalette.hpp"

#include "ResourceIds.hpp"

#include "../core/Util.hpp"
#include "../platform/PlatformFactory.hpp"

using namespace spacenode;

static const GS::Guid paletteGuid ("{9C1B6D52-3F0E-4B7A-8D2E-5A71C0E4F3B8}");
static const char* kDefaultApiBase = "https://spacenode.app";

GS::Ref<SpaceNodePalette> SpaceNodePalette::instance;

static GS::UniString LoadHtmlFromResource ()
{
	GS::UniString html;
	GSHandle data = RSLoadResource ('DATA', ACAPI_GetOwnResModule (), ID_PANEL_HTML);
	if (data != nullptr) {
		const GSSize size = BMhGetSize (data);
		if (size > 0) html = GS::UniString (*data, static_cast<USize> (size), CC_UTF8);
		BMhKill (&data);
	}
	return html;
}

static std::string Utf8 (const GS::UniString& s)
{
	return std::string (s.ToCStr (CC_UTF8).Get ());
}

SpaceNodePalette::SpaceNodePalette () :
	DG::Palette (ACAPI_GetOwnResModule (), ID_PALETTE, ACAPI_GetOwnResModule (), paletteGuid),
	browser (GetReference (), BrowserId)
{
	Attach (*this);
	BeginEventProcessing ();

	shell_ = CreateShell ();
	capture_ = std::make_unique<ArchicadCapture> (*shell_);

	Controller::Services services;
	services.config.baseUrl = kDefaultApiBase;
	const std::string configured = ConfiguredApiBaseUrl (*shell_);
	if (!configured.empty ()) services.config.baseUrl = configured;
	services.http = CreateHttpClient ();
	services.store = CreateCredentialStore (services.config.baseUrl);
	services.shell = shell_;
	services.capture = capture_.get ();
	services.config.userAgent = std::string ("SpaceNode-Archicad/") + ADDON_VERSION;
	services.config.clientVersion = ADDON_VERSION;
	services.sink = [this] (const std::string& type, const Json& payload) { PostToPage (type, payload); };
	controller_ = Controller::Create (std::move (services));

	InitBrowser ();
	EnableIdleEvent (true);   // also while Archicad is inactive: pairing finishes in the web browser
}

SpaceNodePalette::~SpaceNodePalette ()
{
	if (controller_) controller_->Shutdown ();
	EndEventProcessing ();
	Detach (*this);
}

bool SpaceNodePalette::HasInstance () { return instance != nullptr; }
void SpaceNodePalette::CreateInstance () { DBASSERT (!HasInstance ()); instance = new SpaceNodePalette (); ACAPI_KeepInMemory (true); }
SpaceNodePalette& SpaceNodePalette::GetInstance () { DBASSERT (HasInstance ()); return *instance; }
void SpaceNodePalette::DestroyInstance () { instance = nullptr; }

void SpaceNodePalette::Show ()
{
	DG::Palette::Show ();
	SetMenuItemCheckedState (true);
}

void SpaceNodePalette::Hide ()
{
	DG::Palette::Hide ();
	SetMenuItemCheckedState (false);
}

void SpaceNodePalette::InitBrowser ()
{
	RegisterJavaScriptBridge ();
	browser.LoadHTML (LoadHtmlFromResource ());
}

// Page -> C++: SpaceNode.post('{"type":"generate","payload":{...}}'). The call
// only enqueues; the Controller runs from PanelIdle (a regular main-thread,
// API-safe context).
void SpaceNodePalette::RegisterJavaScriptBridge ()
{
	JS::Object* bridge = new JS::Object ("SpaceNode");
	bridge->AddItem (new JS::Function ("post", [this] (GS::Ref<JS::Base> param) {
		GS::Ref<JS::Value> value = GS::DynamicCast<JS::Value> (param);
		if (value != nullptr && value->GetType () == JS::Value::STRING) {
			const std::string text = Utf8 (value->GetString ());
			if (text.size () <= 64 * 1024) {
				const Json message = Json::Parse (text);
				const std::string type = message["type"].AsString ();
				if (!type.empty ()) {
					std::lock_guard<std::mutex> lock (queueMutex_);
					fromPage_.emplace_back (type, message["payload"]);
				}
			}
		}
		return GS::Ref<JS::Base> (new JS::Value (true));
	}));
	browser.RegisterAsynchJSObject (bridge);
}

void SpaceNodePalette::PostToPage (const std::string& type, const Json& payload)
{
	std::lock_guard<std::mutex> lock (queueMutex_);
	toPage_.emplace_back (type, payload);
}

void SpaceNodePalette::Pump ()
{
	std::deque<std::pair<std::string, Json>> commands, events;
	{
		std::lock_guard<std::mutex> lock (queueMutex_);
		commands.swap (fromPage_);
		events.swap (toPage_);
	}
	for (const auto& c : commands)
		controller_->Handle (c.first, c.second);
	for (const auto& e : events) {
		Json envelope = Json::MakeObject ();
		envelope.Set ("type", e.first);
		envelope.Set ("payload", e.second);
		const std::string js = "window.SpaceNodeUI && window.SpaceNodeUI.receive(" + envelope.Dump () + ");";
		browser.ExecuteJS (GS::UniString (js.c_str (), CC_UTF8));
	}
}

void SpaceNodePalette::PanelIdle (const DG::PanelIdleEvent&)
{
	Pump ();
}

void SpaceNodePalette::SetMenuItemCheckedState (bool isChecked)
{
	API_MenuItemRef itemRef = {};
	GSFlags itemFlags = {};
	itemRef.menuResID = ID_ADDON_MENU;
	itemRef.itemIndex = 1;
	ACAPI_MenuItem_GetMenuItemFlags (&itemRef, &itemFlags);
	if (isChecked) itemFlags |= API_MenuItemChecked;
	else itemFlags &= ~API_MenuItemChecked;
	ACAPI_MenuItem_SetMenuItemFlags (&itemRef, &itemFlags);
}

void SpaceNodePalette::PanelResized (const DG::PanelResizeEvent& ev)
{
	BeginMoveResizeItems ();
	browser.Resize (ev.GetHorizontalChange (), ev.GetVerticalChange ());
	EndMoveResizeItems ();
}

void SpaceNodePalette::PanelCloseRequested (const DG::PanelCloseRequestEvent&, bool* accepted)
{
	Hide ();
	*accepted = true;
}

GSErrCode SpaceNodePalette::PaletteControlCallBack (Int32, API_PaletteMessageID messageID, GS::IntPtr param)
{
	switch (messageID) {
		case APIPalMsg_OpenPalette:
			if (!HasInstance ()) CreateInstance ();
			GetInstance ().Show ();
			break;
		case APIPalMsg_ClosePalette:
			if (HasInstance ()) GetInstance ().Hide ();
			break;
		case APIPalMsg_HidePalette_Begin:
			if (HasInstance () && GetInstance ().IsVisible ()) GetInstance ().Hide ();
			break;
		case APIPalMsg_HidePalette_End:
			if (HasInstance () && !GetInstance ().IsVisible ()) GetInstance ().Show ();
			break;
		case APIPalMsg_DisableItems_Begin:
			if (HasInstance () && GetInstance ().IsVisible ()) GetInstance ().DisableItems ();
			break;
		case APIPalMsg_DisableItems_End:
			if (HasInstance () && GetInstance ().IsVisible ()) GetInstance ().EnableItems ();
			break;
		case APIPalMsg_IsPaletteVisible:
			*(reinterpret_cast<bool*> (param)) = HasInstance () && GetInstance ().IsVisible ();
			break;
		default:
			break;
	}
	return NoError;
}

GSErrCode SpaceNodePalette::RegisterPaletteControlCallBack ()
{
	return ACAPI_RegisterModelessWindow (
		GS::CalculateHashValue (paletteGuid),
		PaletteControlCallBack,
		API_PalEnabled_FloorPlan + API_PalEnabled_Section + API_PalEnabled_Elevation +
		API_PalEnabled_InteriorElevation + API_PalEnabled_3D + API_PalEnabled_Detail +
		API_PalEnabled_Worksheet + API_PalEnabled_Layout + API_PalEnabled_DocumentFrom3D,
		GSGuid2APIGuid (paletteGuid));
}
