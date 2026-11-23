// ICapture backed by the Archicad API: saves the CURRENT 3D window to an image
// file via ACAPI_ProjectOperation_Save (WYSIWYG: what the user sees is what
// the AI receives). Main thread only.
#pragma once

#include "../core/Platform.hpp"

class ArchicadCapture final : public spacenode::ICapture {
public:
	explicit ArchicadCapture (spacenode::IShell& shell) : shell_ (shell) {}

	spacenode::CaptureResult CaptureCurrent3DView () override;
	bool ActivateModel3DWindow () override;

private:
	spacenode::IShell& shell_;
};
