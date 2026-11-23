// SpaceNode for Archicad — add-on entry points.
#include "APIEnvir.h"
#include "ACAPinc.h"

#include "ResourceIds.hpp"
#include "SpaceNodePalette.hpp"

static void ShowOrHidePalette ()
{
	if (SpaceNodePalette::HasInstance () && SpaceNodePalette::GetInstance ().IsVisible ()) {
		SpaceNodePalette::GetInstance ().Hide ();
	} else {
		if (!SpaceNodePalette::HasInstance ())
			SpaceNodePalette::CreateInstance ();
		SpaceNodePalette::GetInstance ().Show ();
	}
}

static GSErrCode MenuCommandHandler (const API_MenuParams* menuParams)
{
	if (menuParams->menuItemRef.menuResID == ID_ADDON_MENU && menuParams->menuItemRef.itemIndex == 1)
		ShowOrHidePalette ();
	return NoError;
}

API_AddonType CheckEnvironment (API_EnvirParams* envir)
{
	RSGetIndString (&envir->addOnInfo.name, ID_ADDON_INFO, 1, ACAPI_GetOwnResModule ());
	RSGetIndString (&envir->addOnInfo.description, ID_ADDON_INFO, 2, ACAPI_GetOwnResModule ());
	return APIAddon_Preload;   // palette add-ons must be loaded at startup
}

GSErrCode RegisterInterface (void)
{
	return ACAPI_MenuItem_RegisterMenu (ID_ADDON_MENU, 0, MenuCode_Tools, MenuFlag_Default);
}

GSErrCode Initialize (void)
{
	GSErrCode err = ACAPI_MenuItem_InstallMenuHandler (ID_ADDON_MENU, MenuCommandHandler);
	if (err != NoError) return err;
	return SpaceNodePalette::RegisterPaletteControlCallBack ();
}

GSErrCode FreeData (void)
{
	if (SpaceNodePalette::HasInstance ())
		SpaceNodePalette::DestroyInstance ();
	return NoError;
}
