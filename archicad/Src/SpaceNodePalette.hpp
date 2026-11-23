// Dockable SpaceNode panel: a DG::Palette hosting a DG::Browser (HTML UI) and
// a small JS<->C++ bridge. All SpaceNode logic lives in core/ (Controller);
// this class only moves messages between the page and the Controller on
// Archicad's main thread.
#pragma once

#include "APIEnvir.h"
#include "ACAPinc.h"
#include "DGModule.hpp"
#include "DGBrowser.hpp"

#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <utility>

#include "../core/Controller.hpp"
#include "ArchicadCapture.hpp"

class SpaceNodePalette final : public DG::Palette,
							   public DG::PanelObserver
{
public:
	static bool HasInstance ();
	static void CreateInstance ();
	static SpaceNodePalette& GetInstance ();
	static void DestroyInstance ();
	static GSErrCode RegisterPaletteControlCallBack ();

	void Show ();
	void Hide ();
	~SpaceNodePalette ();

private:
	enum { BrowserId = 1 };

	SpaceNodePalette ();

	void InitBrowser ();
	void RegisterJavaScriptBridge ();
	void SetMenuItemCheckedState (bool isChecked);
	void PostToPage (const std::string& type, const spacenode::Json& payload);   // any thread
	void Pump ();                                                                // main thread

	virtual void PanelResized (const DG::PanelResizeEvent& ev) override;
	virtual void PanelCloseRequested (const DG::PanelCloseRequestEvent& ev, bool* accepted) override;
	virtual void PanelIdle (const DG::PanelIdleEvent& ev) override;

	static GSErrCode PaletteControlCallBack (Int32 paletteId, API_PaletteMessageID messageID, GS::IntPtr param);

	DG::Browser browser;
	std::shared_ptr<spacenode::IShell> shell_;
	std::unique_ptr<ArchicadCapture> capture_;
	std::shared_ptr<spacenode::Controller> controller_;

	std::mutex queueMutex_;
	std::deque<std::pair<std::string, spacenode::Json>> toPage_;
	std::deque<std::pair<std::string, spacenode::Json>> fromPage_;

	static GS::Ref<SpaceNodePalette> instance;
};
