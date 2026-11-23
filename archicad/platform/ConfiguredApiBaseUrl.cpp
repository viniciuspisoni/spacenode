#include <cstdlib>

#include "../core/Json.hpp"
#include "../core/Util.hpp"
#include "PlatformFactory.hpp"

namespace spacenode {

std::string ConfiguredApiBaseUrl (IShell& shell)
{
	if (const char* env = std::getenv ("SPACENODE_API_URL")) {
		const std::string normalized = NormalizeBaseUrl (env);
		if (!normalized.empty ()) return normalized;
	}
	std::string bytes;
	const std::string path = JoinPath (JoinPath (shell.ConfigDirectory (), "SpaceNode"), "archicad.json");
	if (shell.ReadFile (path, bytes)) {
		const Json j = Json::Parse (bytes);
		return NormalizeBaseUrl (j["apiBaseUrl"].AsString ());
	}
	return std::string ();
}

} // namespace spacenode
