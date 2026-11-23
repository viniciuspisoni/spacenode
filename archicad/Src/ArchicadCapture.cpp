#include "APIEnvir.h"
#include "ACAPinc.h"

#include "ArchicadCapture.hpp"

#include "FileSystem.hpp"
#include "Location.hpp"

#include "../core/Generation.hpp"
#include "../core/Util.hpp"

using namespace spacenode;

namespace {

constexpr long long kPngBudgetBytes = 14LL * 1024 * 1024;   // keep headroom under the 15 MB upload limit

CaptureResult Fail (const char* code, const std::string& message)
{
	CaptureResult r;
	r.errorCode = code;
	r.errorMessage = message;
	return r;
}

API_ColorDepthID TrueColor ()
{
#ifdef macintosh
	return APIColorDepth_MiC;
#else
	return APIColorDepth_TC24;
#endif
}

// Saves the current 3D window; true on success. `path` receives the UTF-8 path.
GSErrCode SaveCurrent3DWindow (API_FTypeID type, const char* extension, IShell& shell, std::string& path)
{
	IO::Location location;
	GSErrCode err = IO::fileSystem.GetSpecialLocation (IO::FileSystem::TemporaryFolder, &location);
	if (err != NoError) return err;

	const std::string name = "spacenode-archicad-" + std::to_string (shell.NowEpoch ()) + extension;
	err = location.AppendToLocal (IO::Name (GS::UniString (name.c_str (), CC_UTF8)));
	if (err != NoError) return err;

	GS::UniString fullPath;
	err = location.ToPath (&fullPath);
	if (err != NoError) return err;
	path = std::string (fullPath.ToCStr (CC_UTF8).Get ());

	API_FileSavePars fileSavePars = {};
	fileSavePars.fileTypeID = type;
	fileSavePars.file = &location;

	API_SavePars_Picture picturePars = {};
	picturePars.colorDepth = TrueColor ();
	picturePars.dithered = false;
	picturePars.view2D = false;                 // the 3D window, never the plan
	picturePars.crop = false;
	picturePars.keepSelectionHighlight = false; // no selection overlay in the AI input

	return ACAPI_ProjectOperation_Save (&fileSavePars, &picturePars);
}

} // namespace

CaptureResult ArchicadCapture::CaptureCurrent3DView ()
{
	API_WindowInfo window = {};
	if (ACAPI_Window_GetCurrentWindow (&window) != NoError || window.typeID != APIWind_3DModelID)
		return Fail ("no_3d_view", "Open the 3D window (F3) and frame the view you want to render.");
	if ((ACAPI_Licensing_GetProtectionMode () & APIPROT_DEMO_MASK) != 0)
		return Fail ("capture_demo", "Archicad Demo does not allow saving the 3D image. Activate a license to test capture and generation.");

	std::string path;
	GSErrCode err = SaveCurrent3DWindow (APIFType_PNGFile, ".png", shell_, path);
	if (err != NoError) {
		if (!path.empty ()) shell_.RemoveFile (path);
		if (err == APIERR_REFUSEDCMD)
			return Fail ("capture_restricted", "Archicad refused to save the 3D view. Close active dialogs and try again.");
		return Fail ("capture_failed", "Could not capture the 3D view (Archicad error " + std::to_string (static_cast<long> (err)) + ").");
	}

	std::string mime = "image/png";
	std::string bytes;
	if (!shell_.ReadFile (path, bytes) || bytes.empty ()) {
		shell_.RemoveFile (path);
		return Fail ("capture_failed", "The captured image could not be read.");
	}
	if (static_cast<long long> (bytes.size ()) > kPngBudgetBytes) {
		// A very large PNG: re-capture the same unchanged view as JPEG.
		std::string jpegPath, jpegBytes;
		if (SaveCurrent3DWindow (APIFType_JPEGFile, ".jpg", shell_, jpegPath) == NoError && shell_.ReadFile (jpegPath, jpegBytes) && !jpegBytes.empty ()) {
			shell_.RemoveFile (path);
			path = jpegPath;
			bytes.swap (jpegBytes);
			mime = "image/jpeg";
		} else if (!jpegPath.empty ()) {
			shell_.RemoveFile (jpegPath);
		}
	}

	CaptureResult result;
	int width = 0, height = 0;
	if (!ImageDimensions (bytes, width, height)) {
		shell_.RemoveFile (path);
		return Fail ("capture_failed", "Archicad produced an unreadable image.");
	}
	if (static_cast<long long> (bytes.size ()) > kMaxSourceBytes) {
		shell_.RemoveFile (path);
		return Fail ("image_too_large", "The 3D view is larger than 15 MB even compressed. Shrink the 3D window and try again.");
	}

	result.ok = true;
	result.view.path = path;
	result.view.mime = mime;
	result.view.width = width;
	result.view.height = height;
	result.view.viewName = "3D";
	return result;
}

bool ArchicadCapture::ActivateModel3DWindow ()
{
	API_WindowInfo window = {};
	window.typeID = APIWind_3DModelID;
	return ACAPI_Window_ChangeWindow (&window) == NoError;
}
