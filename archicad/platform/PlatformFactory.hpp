// OS-specific implementations of the core interfaces (macOS: platform/mac,
// Windows: platform/win). Exactly one is compiled per target.
#pragma once

#include <memory>
#include <string>

#include "../core/Platform.hpp"

namespace spacenode {

std::shared_ptr<IHttpClient> CreateHttpClient ();
// Keychain / Credential Manager entry scoped to the API base URL.
std::shared_ptr<ICredentialStore> CreateCredentialStore (const std::string& baseUrl);
std::shared_ptr<IShell> CreateShell ();

// Optional per-user override of the API base URL (dev/staging):
//   1) env SPACENODE_API_URL   2) <config dir>/SpaceNode/archicad.json {"apiBaseUrl": "..."}
// Returns "" when nothing valid is configured.
std::string ConfiguredApiBaseUrl (IShell& shell);

} // namespace spacenode
