// SpaceNode API client for the Archicad add-on. Thread-safe: token refresh is
// serialized (a rotated refresh token is single-use server-side).
#pragma once

#include <atomic>
#include <mutex>
#include <string>

#include "Http.hpp"
#include "Json.hpp"
#include "Platform.hpp"

namespace spacenode {

struct ApiConfig {
	std::string baseUrl = "https://spacenode.app";
	std::string integrationsPrefix = "/api/integrations";   // pair/*, session, catalog, render
	std::string platform = "archicad";
	std::string userAgent = "SpaceNode-Archicad";
	std::string clientVersion;                              // x.y.z do add-on → `client` do /api/generate
	int generateTimeoutSeconds = 320;                       // /api/generate maxDuration = 300
	int pollIntervalOverrideMs = 0;                         // tests only: replaces the server's pollInterval
};

struct ApiResult {
	bool ok = false;
	int status = 0;
	Json data;
	std::string code;      // stable: ok | network | unauthorized | insufficient_nodes | rate_limited | not_found | bad_request | server | invalid_response
	std::string message;   // server text when present (already user-facing, pt-BR)
	bool Network () const { return status == 0; }
};

struct PairingInfo {
	std::string userCode;
	std::string verificationUrl;
	int expiresIn = 600;
	int pollInterval = 3;
};

enum class ClaimStatus { Pending, Ready, Expired, Failed };

struct ClaimResult {
	ClaimStatus status = ClaimStatus::Failed;
	std::string userEmail;
	ApiResult api;
};

class ApiClient {
public:
	ApiClient (ApiConfig config, IHttpClient& http, ICredentialStore& store, IShell& shell);

	const ApiConfig& Config () const { return config_; }

	// ── Pairing (no bearer) ──
	ApiResult PairStart (const std::string& deviceName, PairingInfo& info);
	ClaimResult PairClaim ();
	bool HasPendingPairing () const;
	void DropPendingPairing ();

	// ── Device session ──
	bool HasCredentials ();
	void Disconnect ();               // forget locally (keychain + token)
	ApiResult Refresh ();             // forces a token refresh

	// ── Authenticated calls (auto-refresh once on 401) ──
	ApiResult Session ();
	ApiResult Catalog ();
	ApiResult GetRender (const std::string& renderId);
	ApiResult ListRenders ();
	ApiResult SignUpload (const std::string& area, const std::string& mime, long long sizeBytes, std::string& key, std::string& uploadUrl);
	ApiResult Generate (const Json& body);

	// ── Unauthenticated byte transfer (signed URLs) ──
	ApiResult PutBytes (const std::string& uploadUrl, const std::string& mime, const std::string& bytes);
	ApiResult Download (const std::string& url, std::string& bytes);

private:
	ApiResult Authed (const std::string& method, const std::string& path, const Json* body, int timeoutSeconds);
	ApiResult Raw (const std::string& method, const std::string& url, const Json* body, const std::string& bearer, int timeoutSeconds);
	ApiResult RefreshLocked (const std::string& staleToken, bool& refreshed);
	bool EnsureTokenLocked (std::string& token);
	std::string Path (const std::string& suffix) const { return config_.integrationsPrefix + suffix; }
	static ApiResult Classify (const HttpResponse& response);

	ApiConfig config_;
	IHttpClient& http_;
	ICredentialStore& store_;
	IShell& shell_;

	mutable std::mutex mutex_;     // guards everything below
	std::string accessToken_;
	long long expiresAt_ = 0;
	DeviceCredentials pending_;    // between pair/start and a ready claim
	DeviceCredentials cached_;
	bool cachedLoaded_ = false;
};

} // namespace spacenode
