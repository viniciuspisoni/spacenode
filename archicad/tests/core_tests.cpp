#include <thread>

#include "Fakes.hpp"
#include "TestKit.hpp"
#include "../core/Generation.hpp"
#include "../core/Util.hpp"

using namespace spacenode;
using namespace fakes;

static std::string MakePng (int w, int h)
{
	std::string s ("\x89PNG\r\n\x1a\n", 8);
	s += std::string ("\0\0\0\x0d", 4) + "IHDR";
	for (int v : {w, h}) {
		s.push_back (static_cast<char> ((v >> 24) & 255)); s.push_back (static_cast<char> ((v >> 16) & 255));
		s.push_back (static_cast<char> ((v >> 8) & 255)); s.push_back (static_cast<char> (v & 255));
	}
	s += std::string ("\x08\x06\0\0\0", 5);
	s += std::string (64, 'x');
	return s;
}

static const char* kUuid = "0b2d6f0e-1c3a-4e5b-8f7a-9c0d1e2f3a4b";

static const char* kCatalog = R"({
 "engines":[{"id":"vega","name":"Vega","resolutions":[{"id":"hd","label":"HD","nodes":10},{"id":"4k","label":"4K","nodes":40}]},
            {"id":"pulsar","name":"Pulsar","resolutions":[{"id":"hd","label":"HD","nodes":4}]}],
 "defaults":{"engine":"vega","resolution":"hd"},
 "projectTypes":[{"id":"interior","label":"Interior","backgrounds":["Preservar Original","Jardim"],"backgroundLabel":"Contexto",
   "segments":[{"name":"Residencial","environments":["Sala de estar","Quarto"],"lighting":["Luz natural"],"sceneElements":["Plantas","Tapete"]}]}],
 "i18n":{"en":{"presets":{"Sala de estar":"Living room"},"ui":{"projectTypes":{"interior":"Interior"}}}},
 "animar":{"huge":"ignored"}
})";

// ── Json ─────────────────────────────────────────────────────────────────────

TEST (json_roundtrip_and_escapes)
{
	std::string err;
	const Json j = Json::Parse (R"({"a":[1,2.5,-3e2,true,null,"x\u00e9\n\ud83d\ude00"],"b":{"c":"d"}})", &err);
	CHECK (err.empty ());
	CHECK_EQ (j["a"].Size (), static_cast<std::size_t> (6));
	CHECK_EQ (j["a"][1].AsNumber (), 2.5);
	CHECK_EQ (j["a"][2].AsNumber (), -300.0);
	CHECK_EQ (j["a"][5].AsString (), std::string ("x\xC3\xA9\n\xF0\x9F\x98\x80"));
	CHECK_EQ (j["b"]["c"].AsString (), std::string ("d"));
	CHECK (j["missing"]["deep"].IsNull ());
	const Json again = Json::Parse (j.Dump ());
	CHECK_EQ (again.Dump (), j.Dump ());
}

TEST (json_rejects_bad_input)
{
	for (const char* bad : {"", "{", "[1,]", "{\"a\":}", "\"\\ud800\"", "tru", "{\"a\":1} x", "\"a\nb\""}) {
		std::string err;
		const Json j = Json::Parse (bad, &err);
		CHECK (j.IsNull ());
		CHECK (!err.empty ());
	}
	std::string deep (200, '[');
	std::string err;
	Json::Parse (deep, &err);
	CHECK (!err.empty ());
}

TEST (json_dump_is_js_safe)
{
	const Json j (std::string ("a\xE2\x80\xA8" "b\xE2\x80\xA9" "c"));
	const std::string out = j.Dump ();
	CHECK (out.find ("\\u2028") != std::string::npos);
	CHECK (out.find ("\\u2029") != std::string::npos);
	CHECK (out.find ("\xE2\x80\xA8") == std::string::npos);
}

// ── Util ─────────────────────────────────────────────────────────────────────

TEST (util_base_url)
{
	std::string err;
	CHECK_EQ (NormalizeBaseUrl ("https://spacenode.app/", &err), std::string ("https://spacenode.app"));
	CHECK_EQ (NormalizeBaseUrl ("https://SpaceNode.app:443/x?y#z"), std::string ("https://spacenode.app"));
	CHECK_EQ (NormalizeBaseUrl ("http://localhost:3000"), std::string ("http://localhost:3000"));
	CHECK_EQ (NormalizeBaseUrl ("http://127.0.0.1:8080/"), std::string ("http://127.0.0.1:8080"));
	CHECK (NormalizeBaseUrl ("http://spacenode.app", &err).empty ());
	CHECK (NormalizeBaseUrl ("ftp://x", &err).empty ());
	CHECK (NormalizeBaseUrl ("https://user:pw@evil.com", &err).empty ());
	CHECK (NormalizeBaseUrl ("https://", &err).empty ());
	CHECK (NormalizeBaseUrl ("https://a.b:80x", &err).empty ());
}

TEST (util_safe_urls_and_host)
{
	CHECK (IsSafeUrl ("https://x.supabase.co/a?token=1"));
	CHECK (IsSafeUrl ("http://localhost:3000/a"));
	CHECK (!IsSafeUrl ("http://evil.com/a"));
	CHECK (!IsSafeUrl ("javascript:alert(1)"));
	CHECK (!IsSafeUrl ("file:///etc/passwd"));
	CHECK (SameHost ("https://spacenode.app/integrations/pair", "https://spacenode.app"));
	CHECK (!SameHost ("https://spacenode.app.evil.com/x", "https://spacenode.app"));
	CHECK (!SameHost ("http://localhost:3000/x", "http://localhost:3001"));
}

TEST (util_images_dates_misc)
{
	int w = 0, h = 0;
	CHECK (ImageDimensions (MakePng (1920, 1080), w, h));
	CHECK_EQ (w, 1920);
	CHECK_EQ (h, 1080);
	// JPEG: SOI, APP0 (len 16), SOF0 (1024x768)
	std::string jpg ("\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00", 20);
	jpg += std::string ("\xFF\xC0\x00\x11\x08\x03\x00\x04\x00\x03", 10) + std::string (20, '\0');
	CHECK (ImageDimensions (jpg, w, h));
	CHECK_EQ (w, 1024);
	CHECK_EQ (h, 768);
	CHECK (!ImageDimensions ("not an image at all, long enough........", w, h));
	CHECK_EQ (SniffImageExtension (MakePng (1, 1)), std::string ("png"));
	CHECK_EQ (SniffImageExtension (jpg), std::string ("jpg"));
	CHECK_EQ (SniffImageExtension ("<html>"), std::string (""));

	long long t = 0;
	CHECK (ParseIso8601 ("2026-10-06T12:34:56.789Z", t));
	CHECK_EQ (t, 1791290096LL);
	CHECK (ParseIso8601 ("2026-10-06T09:34:56-03:00", t));
	CHECK_EQ (t, 1791290096LL);
	CHECK (!ParseIso8601 ("yesterday", t));
	CHECK_EQ (FormatTimestampForFile (1791290096LL), std::string ("20261006-123456"));
	CHECK_EQ (SanitizeFileComponent ("a/b c..d"), std::string ("a-b-c-d"));
	CHECK (IsUuid (kUuid));
	CHECK (!IsUuid ("../../etc"));
	CHECK_EQ (UrlEncode ("a b&c"), std::string ("a%20b%26c"));
	const std::string red = RedactSecrets ("Authorization: Bearer abc.def.ghi\n{\"accessToken\":\"sekret\"} u?token=zzz&x=1");
	CHECK (red.find ("abc.def") == std::string::npos);
	CHECK (red.find ("sekret") == std::string::npos);
	CHECK (red.find ("zzz") == std::string::npos);
}

// ── Generation ───────────────────────────────────────────────────────────────

TEST (generation_validate_and_payload)
{
	const Json cat = Json::Parse (kCatalog);
	CHECK_EQ (CostNodes (cat, "vega", "4k"), 40);
	CHECK_EQ (CostNodes (cat, "vega", "8k"), -1);

	GenerateOptions o;
	o.engine = "vega"; o.resolution = "hd"; o.segment = "Residencial"; o.environment = "Sala de estar"; o.lighting = "Luz natural";
	o.sceneElements = {"Plantas"};
	CHECK (ValidateOptions (cat, o).ok);

	GenerateOptions bad = o; bad.engine = "nope";
	CHECK_EQ (ValidateOptions (cat, bad).field, std::string ("engine"));
	bad = o; bad.resolution = "4k"; bad.engine = "pulsar";
	CHECK_EQ (ValidateOptions (cat, bad).field, std::string ("resolution"));
	bad = o; bad.environment = "Garagem";
	CHECK_EQ (ValidateOptions (cat, bad).field, std::string ("environment"));
	bad = o; bad.sceneElements = {"Dragao"};
	CHECK_EQ (ValidateOptions (cat, bad).field, std::string ("sceneElements"));
	bad = o; bad.segment = "";
	CHECK_EQ (ValidateOptions (cat, bad).field, std::string ("segment"));

	Json facts = Json::MakeObject ();
	facts.Set ("camera", Json::Parse (R"({"fovDeg":50})"));
	o.prompt = "  madeira\nclara  ";
	const Json body = BuildGeneratePayload (o, "render/source/u/abc.png", facts);
	CHECK_EQ (body["sourceKey"].AsString (), std::string ("render/source/u/abc.png"));
	CHECK_EQ (body["fidelityLevel"].AsString (), std::string ("maximum"));
	CHECK_EQ (body["background"].AsString (), std::string ("Preservar Original"));
	CHECK_EQ (body["refinementText"].AsString (), std::string ("madeira clara"));
	CHECK_EQ (body["modelFacts"]["camera"]["fovDeg"].AsNumber (), 50.0);
	CHECK (!body.Has ("imageBase64"));
	CHECK_EQ (body["client"]["kind"].AsString (), std::string ("archicad"));
	CHECK (!body["client"].Has ("version"));
	CHECK (!BuildGeneratePayload (o, "k", Json ()).Has ("modelFacts"));
	CHECK_EQ (BuildGeneratePayload (o, "k", Json (), "1.0.0")["client"]["version"].AsString (), std::string ("1.0.0"));

	const Json slim = SlimCatalogForUi (cat);
	CHECK (!slim.Has ("animar"));
	CHECK_EQ (slim["engines"].Size (), static_cast<std::size_t> (2));
	CHECK_EQ (slim["i18n"]["presets"]["Sala de estar"].AsString (), std::string ("Living room"));

	CHECK_EQ (CleanPrompt (std::string (5000, 'a')).size (), kMaxPromptChars);
}

// ── Flow (controller + client over a scripted server) ───────────────────────

struct Rig {
	std::shared_ptr<FakeHttp> http = std::make_shared<FakeHttp> ();
	std::shared_ptr<MemoryCredentialStore> store = std::make_shared<MemoryCredentialStore> ();
	std::shared_ptr<FakeShell> shell = std::make_shared<FakeShell> ();
	FakeCapture capture;
	EventLog log;
	std::shared_ptr<Controller> controller;
	std::atomic<int> refreshCalls{0};
	std::atomic<int> claimCalls{0};
	std::atomic<int> generateCalls{0};
	std::atomic<int> sessionUnauthorizedOnce{0};

	Rig ()
	{
		capture.shell = shell.get ();
		capture.pngBytes = MakePng (1920, 1080);
		Controller::Services sv;
		sv.http = http; sv.store = store; sv.shell = shell; sv.capture = &capture;
		sv.config.baseUrl = "https://spacenode.test";
		sv.config.pollIntervalOverrideMs = 20;
		sv.sink = [this] (const std::string& t, const Json& p) { log.Add (t, p); };
		controller = Controller::Create (sv);

		http->On ("POST /api/integrations/pair/start", [] (const HttpRequest& r) {
			const Json body = Json::Parse (r.body);
			CHECK_EQ (body["platform"].AsString (), std::string ("archicad"));
			return FakeHttp::Json200 (std::string (R"({"deviceId":")") + kUuid + R"(","deviceSecret":"s3cr3t-device","userCode":"ABCD-1234","verificationUrl":"https://spacenode.test/integrations/pair","expiresIn":600,"pollInterval":1})");
		});
		http->On ("POST /api/integrations/pair/claim", [this] (const HttpRequest& r) {
			const Json body = Json::Parse (r.body);
			CHECK_EQ (body["deviceSecret"].AsString (), std::string ("s3cr3t-device"));
			if (++claimCalls < 2) return FakeHttp::Json200 (R"({"status":"pending"})");
			return FakeHttp::Json200 (R"({"status":"ready","accessToken":"tok-1","expiresAt":1790003600,"userEmail":"a@b.com"})");
		});
		http->On ("POST /api/integrations/pair/refresh", [this] (const HttpRequest&) {
			const int n = ++refreshCalls;
			return FakeHttp::Json200 (R"({"accessToken":"tok-)" + std::to_string (1 + n) + R"(","expiresAt":1790007200})");
		});
		http->On ("GET /api/integrations/session", [this] (const HttpRequest&) {
			if (sessionUnauthorizedOnce.fetch_sub (1) > 0) return FakeHttp::Json200 (R"({"error":"x"})", 401);
			return FakeHttp::Json200 (R"({"ok":true,"user":{"id":"u","email":"a@b.com"},"balance":{"totalBalance":100},"theme":"dark"})");
		});
		http->On ("GET /api/integrations/catalog", [] (const HttpRequest&) { return FakeHttp::Json200 (kCatalog); });
		http->On ("POST /api/uploads/sign", [] (const HttpRequest& r) {
			const Json b = Json::Parse (r.body);
			CHECK_EQ (b["area"].AsString (), std::string ("render-source"));
			CHECK_EQ (b["contentType"].AsString (), std::string ("image/png"));
			CHECK (b["sizeBytes"].AsNumber () > 0);
			return FakeHttp::Json200 (R"({"bucket":"space-mestres","key":"render/source/u/k.png","token":"t","uploadUrl":"https://storage.test/upload?token=zz"})");
		});
		http->On ("PUT /upload", [] (const HttpRequest& r) {
			CHECK_EQ (r.body.substr (1, 3), std::string ("PNG"));
			return FakeHttp::Json200 ("{}");
		});
		http->On ("POST /api/generate", [this] (const HttpRequest& r) {
			++generateCalls;
			const Json b = Json::Parse (r.body);
			CHECK_EQ (b["sourceKey"].AsString (), std::string ("render/source/u/k.png"));
			CHECK_EQ (b["engine"].AsString (), std::string ("vega"));
			return FakeHttp::Json200 (std::string (R"({"outputUrl":"https://cdn.test/out.png","renderId":")") + kUuid + R"(","previewUrl":"https://cdn.test/p.png","originalUrl":"https://cdn.test/in.png","nodesCharged":10,"totalBalance":90,"fidelityWarning":false,"seed":7})");
		});
		http->On ("GET /out.png", [] (const HttpRequest&) { return FakeHttp::Json200 (MakePng (2048, 1152)); });
	}

	~Rig () { controller->Shutdown (); }

	Json Options () const
	{
		return Json::Parse (R"({"engine":"vega","resolution":"hd","projectType":"interior","segment":"Residencial","environment":"Sala de estar","lighting":"Luz natural","background":"","sceneElements":["Plantas"],"prompt":"x"})");
	}

	void ConnectAndLoad ()
	{
		controller->Handle ("ready", Json ());
		controller->Handle ("connect", Json ());
		log.WaitMatch ("connection", [] (const Json& p) { return p["status"].AsString () == "connected"; });
		log.WaitFor ("catalog");
	}
};

static bool IsStatus (const Json& p, const char* s) { return p["status"].AsString () == s; }
static bool ScopeIs (const Json& p, const char* s) { return p["scope"].AsString () == s; }

TEST (flow_pairing_happy_path_keeps_secrets_out_of_events)
{
	Rig rig;
	rig.controller->Handle ("ready", Json ());
	CHECK_EQ (rig.log.WaitFor ("connection")["status"].AsString (), std::string ("disconnected"));
	rig.controller->Handle ("connect", Json ());
	const Json pairing = rig.log.WaitMatch ("connection", [] (const Json& p) { return IsStatus (p, "pairing") && p["pairing"].Has ("userCode") && !p["pairing"]["userCode"].AsString ().empty (); });
	CHECK_EQ (pairing["pairing"]["userCode"].AsString (), std::string ("ABCD-1234"));
	const Json connected = rig.log.WaitMatch ("connection", [] (const Json& p) { return IsStatus (p, "connected"); });
	CHECK_EQ (connected["email"].AsString (), std::string ("a@b.com"));
	CHECK (!rig.log.WaitFor ("catalog").IsNull ());
	CHECK_EQ (rig.log.WaitFor ("session")["balance"]["totalBalance"].AsNumber (), 100.0);

	const auto opened = rig.shell->Opened ();
	CHECK (!opened.empty () && opened[0] == "https://spacenode.test/integrations/pair");
	DeviceCredentials c;
	CHECK (rig.store->Load (c));
	CHECK_EQ (c.deviceSecret, std::string ("s3cr3t-device"));
	const std::string all = rig.log.DumpAll ();
	CHECK (all.find ("s3cr3t-device") == std::string::npos);
	CHECK (all.find ("tok-1") == std::string::npos);
	CHECK (all.find ("animar") == std::string::npos);

	for (const HttpRequest& r : rig.http->Requests ()) {
		const bool authed = r.url.find ("/session") != std::string::npos || r.url.find ("/catalog") != std::string::npos;
		bool hasBearer = false;
		for (auto& h : r.headers) if (h.first == "Authorization") hasBearer = h.second == "Bearer tok-1";
		if (authed) CHECK (hasBearer);
		if (r.url.find ("/pair/") != std::string::npos) CHECK (!hasBearer);
	}
}

TEST (flow_rejects_foreign_verification_url)
{
	Rig rig;
	rig.http->On ("POST /api/integrations/pair/start", [] (const HttpRequest&) {
		return FakeHttp::Json200 (std::string (R"({"deviceId":")") + kUuid + R"(","deviceSecret":"s","userCode":"X","verificationUrl":"https://evil.example/pair","expiresIn":600,"pollInterval":1})");
	});
	rig.controller->Handle ("connect", Json ());
	const Json err = rig.log.WaitFor ("error");
	CHECK_EQ (err["scope"].AsString (), std::string ("connect"));
	CHECK (rig.shell->Opened ().empty ());
	CHECK_EQ (rig.http->Count ("POST /api/integrations/pair/claim"), 0);
}

TEST (flow_pairing_http_failure_reports_status_without_secret)
{
	Rig rig;
	rig.http->On ("POST /api/integrations/pair/start", [] (const HttpRequest&) {
		return FakeHttp::Json200 (R"({"error":"server-secret"})", 404);
	});
	rig.controller->Handle ("connect", Json ());
	const Json err = rig.log.WaitFor ("error");
	CHECK_EQ (err["scope"].AsString (), std::string ("connect"));
	CHECK_EQ (err["code"].AsString (), std::string ("not_found"));
	CHECK_EQ (err["httpStatus"].AsNumber (), 404.0);
	CHECK (rig.shell->Opened ().empty ());
	CHECK_EQ (rig.http->Count ("POST /api/integrations/pair/claim"), 0);
}

TEST (flow_capture_diagnostic_works_without_pairing_or_upload)
{
	Rig rig;
	rig.controller->Handle ("testCapture", Json ());
	const Json cap = rig.log.WaitFor ("capture");
	CHECK (cap["diagnostic"].AsBool ());
	CHECK_EQ (cap["width"].AsNumber (), 1920.0);
	CHECK_EQ (rig.capture.captures.load (), 1);
	CHECK (rig.shell->files.count ("/tmp/capture.png") == 0);
	CHECK (rig.http->Requests ().empty ());
	rig.capture.fail = true;
	rig.controller->Handle ("testCapture", Json ());
	CHECK_EQ (rig.log.WaitFor ("error")["code"].AsString (), std::string ("no_3d_view"));
}

TEST (flow_cancel_pairing_stops_polling)
{
	Rig rig;
	rig.http->On ("POST /api/integrations/pair/claim", [] (const HttpRequest&) { return FakeHttp::Json200 (R"({"status":"pending"})"); });
	rig.controller->Handle ("connect", Json ());
	rig.log.WaitMatch ("connection", [] (const Json& p) { return IsStatus (p, "pairing") && p["pairing"].Has ("userCode") && !p["pairing"]["userCode"].AsString ().empty (); });
	rig.controller->Handle ("cancelConnect", Json ());
	CHECK (!rig.log.WaitMatch ("connection", [] (const Json& p) { return IsStatus (p, "disconnected"); }).IsNull ());
	std::this_thread::sleep_for (std::chrono::milliseconds (150));
	const int before = rig.http->Count ("POST /api/integrations/pair/claim");
	std::this_thread::sleep_for (std::chrono::milliseconds (400));
	CHECK_EQ (rig.http->Count ("POST /api/integrations/pair/claim"), before);
}

TEST (flow_expired_code_reports_and_resets)
{
	Rig rig;
	rig.http->On ("POST /api/integrations/pair/claim", [] (const HttpRequest&) { return FakeHttp::Json200 (R"({"status":"expired"})", 410); });
	rig.controller->Handle ("connect", Json ());
	CHECK_EQ (rig.log.WaitFor ("error")["code"].AsString (), std::string ("pair_expired"));
	CHECK (!rig.log.WaitMatch ("connection", [] (const Json& p) { return IsStatus (p, "disconnected"); }, 3000).IsNull ());
}

TEST (flow_401_refreshes_once_and_retries)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.sessionUnauthorizedOnce = 1;
	rig.controller->Handle ("refresh", Json ());
	rig.log.WaitFor ("session", 2);
	CHECK_EQ (rig.refreshCalls.load (), 1);
	bool sawNew = false;
	for (const HttpRequest& r : rig.http->Requests ())
		for (auto& h : r.headers) if (h.first == "Authorization" && h.second == "Bearer tok-2") sawNew = true;
	CHECK (sawNew);
}

TEST (flow_expired_token_refreshes_before_calling)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.shell->now = 1790003600;      // == expiresAt: inside the skew window
	rig.controller->Handle ("refresh", Json ());
	rig.log.WaitFor ("session", 2);
	CHECK_EQ (rig.refreshCalls.load (), 1);
}

TEST (flow_revoked_device_drops_credentials)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.http->On ("POST /api/integrations/pair/refresh", [] (const HttpRequest&) { return FakeHttp::Json200 (R"({"error":"Dispositivo desconectado."})", 401); });
	rig.shell->now = 1790009999;
	const int disconnectedBefore = rig.log.Count ("connection");
	rig.controller->Handle ("refresh", Json ());
	CHECK_EQ (rig.log.WaitFor ("error")["code"].AsString (), std::string ("unauthorized"));
	rig.log.WaitFor ("connection", disconnectedBefore + 1);
	DeviceCredentials c;
	CHECK (!rig.store->Load (c));
	CHECK_EQ (rig.log.WaitFor ("connection", disconnectedBefore + 1)["status"].AsString (), std::string ("disconnected"));
}

TEST (flow_generate_success_and_save)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.controller->Handle ("generate", rig.Options ());
	const Json cap = rig.log.WaitFor ("capture");
	CHECK_EQ (cap["width"].AsNumber (), 1920.0);
	CHECK (!cap["lowResolution"].AsBool ());
	const Json result = rig.log.WaitFor ("result");
	CHECK_EQ (result["outputUrl"].AsString (), std::string ("https://cdn.test/out.png"));
	CHECK_EQ (result["totalBalance"].AsNumber (), 90.0);
	CHECK_EQ (rig.generateCalls.load (), 1);
	rig.log.WaitMatch ("busy", [] (const Json& p) { return !p["busy"].AsBool (true); });
	{
		std::lock_guard<std::mutex> l (rig.shell->m_);
		CHECK (rig.shell->files.count ("/tmp/capture.png") == 0);   // temp capture removed
	}

	// order: sign -> put -> generate
	std::vector<std::string> order;
	for (const HttpRequest& r : rig.http->Requests ())
		if (r.url.find ("/api/uploads/sign") != std::string::npos || r.url.find ("/upload") != std::string::npos || r.url.find ("/api/generate") != std::string::npos)
			order.push_back (r.method);
	CHECK_EQ (order.size (), static_cast<std::size_t> (3));
	if (order.size () == 3) { CHECK_EQ (order[0], std::string ("POST")); CHECK_EQ (order[1], std::string ("PUT")); CHECK_EQ (order[2], std::string ("POST")); }

	rig.controller->Handle ("save", Json ());
	const Json saved = rig.log.WaitFor ("saved");
	const std::string path = saved["path"].AsString ();
	CHECK (path.rfind ("/pictures/SpaceNode/spacenode-archicad-20260921", 0) == 0);
	CHECK (path.size () > 4 && path.substr (path.size () - 4) == ".png");
	{
		std::lock_guard<std::mutex> l (rig.shell->m_);
		CHECK (rig.shell->files.count (path) == 1);
	}
	rig.controller->Handle ("reveal", Json ());
	CHECK_EQ (rig.shell->revealed.size (), static_cast<std::size_t> (1));
	rig.controller->Handle ("openResult", Json ());
	CHECK_EQ (rig.shell->Opened ().back (), std::string ("https://cdn.test/out.png"));
}

TEST (flow_generate_blocked_cases)
{
	Rig rig;
	rig.controller->Handle ("generate", rig.Options ());
	CHECK_EQ (rig.log.WaitFor ("error")["code"].AsString (), std::string ("not_connected"));

	rig.ConnectAndLoad ();
	Json bad = rig.Options ();
	bad.Set ("environment", "Garagem");
	rig.controller->Handle ("generate", bad);
	const Json e = rig.log.WaitMatch ("error", [] (const Json& p) { return p["code"].AsString () == "invalid_options"; });
	CHECK_EQ (e["field"].AsString (), std::string ("environment"));

	Json expensive = rig.Options ();
	expensive.Set ("resolution", "4k");
	rig.http->On ("GET /api/integrations/session", [] (const HttpRequest&) { return FakeHttp::Json200 (R"({"user":{"email":"a@b.com"},"balance":{"totalBalance":5}})"); });
	rig.controller->Handle ("refresh", Json ());
	rig.log.WaitFor ("session", 2);
	rig.controller->Handle ("generate", expensive);
	CHECK (!rig.log.WaitMatch ("error", [] (const Json& p) { return p["code"].AsString () == "insufficient_nodes"; }).IsNull ());
	CHECK_EQ (rig.capture.captures.load (), 0);   // never captured, never uploaded, never charged
	CHECK_EQ (rig.generateCalls.load (), 0);
}

TEST (flow_capture_failure_surfaces_and_releases_slot)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.capture.fail = true;
	rig.controller->Handle ("generate", rig.Options ());
	CHECK_EQ (rig.log.WaitMatch ("error", [] (const Json& p) { return ScopeIs (p, "capture"); })["code"].AsString (), std::string ("no_3d_view"));
	CHECK_EQ (rig.http->Count ("POST /api/uploads/sign"), 0);
	rig.capture.fail = false;
	rig.controller->Handle ("generate", rig.Options ());
	CHECK (!rig.log.WaitFor ("result").IsNull ());
}

TEST (flow_low_resolution_flagged)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.capture.width = 640; rig.capture.height = 480;
	rig.controller->Handle ("generate", rig.Options ());
	CHECK (rig.log.WaitFor ("capture")["lowResolution"].AsBool ());
}

TEST (flow_server_error_402_maps_to_insufficient_nodes)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.http->On ("POST /api/generate", [] (const HttpRequest&) { return FakeHttp::Json200 (R"({"error":"Saldo insuficiente"})", 402); });
	rig.controller->Handle ("generate", rig.Options ());
	const Json e = rig.log.WaitMatch ("error", [] (const Json& p) { return ScopeIs (p, "generate"); });
	CHECK_EQ (e["code"].AsString (), std::string ("insufficient_nodes"));
	CHECK_EQ (e["message"].AsString (), std::string ("Saldo insuficiente"));
}

TEST (flow_upload_failure_is_not_charged)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.http->On ("PUT /upload", [] (const HttpRequest&) { return FakeHttp::Json200 ("{}", 500); });
	rig.controller->Handle ("generate", rig.Options ());
	CHECK (!rig.log.WaitMatch ("error", [] (const Json& p) { return ScopeIs (p, "generate"); }).IsNull ());
	CHECK_EQ (rig.generateCalls.load (), 0);
}

TEST (flow_network_loss_recovers_paid_render)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.http->On ("POST /api/generate", [] (const HttpRequest&) { return FakeHttp::Down (); });
	rig.http->On ("GET /api/renders/list", [] (const HttpRequest&) {
		return FakeHttp::Json200 (std::string (R"({"renders":[
		 {"id":"11111111-1111-4111-8111-111111111111","created_at":"2020-01-01T00:00:00Z","output_url":"https://cdn.test/old.png","ambient":"render"},
		 {"id":")") + kUuid + R"(","created_at":"2026-09-21T14:13:25Z","output_url":"https://cdn.test/new.png","preview_url":null,"input_url":"https://cdn.test/in.png","nodes_charged":10,"ambient":"render"}]})");
	});
	rig.controller->Handle ("generate", rig.Options ());
	const Json result = rig.log.WaitFor ("result");
	CHECK (result["recovered"].AsBool ());
	CHECK_EQ (result["outputUrl"].AsString (), std::string ("https://cdn.test/new.png"));
}

TEST (flow_network_loss_without_match_reports_lost)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.http->On ("POST /api/generate", [] (const HttpRequest&) { return FakeHttp::Down (); });
	rig.http->On ("GET /api/renders/list", [] (const HttpRequest&) {
		return FakeHttp::Json200 (R"({"renders":[{"id":"11111111-1111-4111-8111-111111111111","created_at":"2020-01-01T00:00:00Z","output_url":"https://cdn.test/old.png"}]})");
	});
	rig.controller->Handle ("generate", rig.Options ());
	CHECK_EQ (rig.log.WaitMatch ("error", [] (const Json& p) { return ScopeIs (p, "generate"); })["code"].AsString (), std::string ("generate_lost"));
}

TEST (flow_restore_render_by_id_and_bad_id)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.http->On ("GET /api/integrations/render", [] (const HttpRequest& r) {
		CHECK (r.url.find (std::string ("id=") + kUuid) != std::string::npos);
		return FakeHttp::Json200 (std::string (R"({"id":")") + kUuid + R"(","status":"completed","inputUrl":"https://cdn.test/in2.png","outputUrl":"https://cdn.test/out2.png","previewUrl":null,"nodesCharged":10})");
	});
	Json p = Json::MakeObject ();
	p.Set ("id", std::string (kUuid));
	rig.controller->Handle ("restoreRender", p);
	CHECK_EQ (rig.log.WaitFor ("result")["outputUrl"].AsString (), std::string ("https://cdn.test/out2.png"));
	Json bad = Json::MakeObject ();
	bad.Set ("id", "../../x");
	rig.controller->Handle ("restoreRender", bad);
	CHECK (!rig.log.WaitMatch ("error", [] (const Json& e) { return ScopeIs (e, "load"); }).IsNull ());
	CHECK_EQ (rig.http->Count ("GET /api/integrations/render"), 1);
}

TEST (flow_save_refuses_non_image_download)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.controller->Handle ("generate", rig.Options ());
	rig.log.WaitFor ("result");
	rig.http->On ("GET /out.png", [] (const HttpRequest&) { return FakeHttp::Json200 ("<html>sign in</html>......................................."); });
	rig.controller->Handle ("save", Json ());
	CHECK_EQ (rig.log.WaitMatch ("error", [] (const Json& p) { return ScopeIs (p, "save"); })["code"].AsString (), std::string ("save_failed"));
}

TEST (flow_disconnect_clears_everything)
{
	Rig rig;
	rig.ConnectAndLoad ();
	rig.controller->Handle ("disconnect", Json ());
	CHECK (!rig.log.WaitMatch ("connection", [] (const Json& p) { return IsStatus (p, "disconnected"); }, 3000).IsNull ());
	DeviceCredentials c;
	CHECK (!rig.store->Load (c));
	rig.controller->Handle ("generate", rig.Options ());
	CHECK_EQ (rig.log.WaitMatch ("error", [] (const Json& p) { return ScopeIs (p, "generate"); })["code"].AsString (), std::string ("not_connected"));
}

TEST (flow_shutdown_aborts_and_silences)
{
	auto rig = std::make_unique<Rig> ();
	rig->ConnectAndLoad ();
	Rig* r = rig.get ();
	rig->http->On ("POST /api/generate", [r] (const HttpRequest&) {
		for (int i = 0; i < 50 && !r->http->cancelled; ++i) std::this_thread::sleep_for (std::chrono::milliseconds (50));
		return FakeHttp::Down ();
	});
	rig->controller->Handle ("generate", rig->Options ());
	rig->log.WaitFor ("capture");
	std::this_thread::sleep_for (std::chrono::milliseconds (400));
	const int before = rig->log.Count ("error") + rig->log.Count ("result");
	rig->controller->Shutdown ();
	CHECK (rig->http->cancelled);
	CHECK_EQ (rig->log.Count ("error") + rig->log.Count ("result"), before);
}

int main (int argc, char** argv)
{
	return tk::RunAll (argc > 1 ? argv[1] : nullptr);
}
