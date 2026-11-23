#include "ApiClient.hpp"

#include "Util.hpp"

namespace spacenode {

namespace {
constexpr long long kExpirySkewSeconds = 90;   // renew a bit early
}

ApiClient::ApiClient (ApiConfig config, IHttpClient& http, ICredentialStore& store, IShell& shell)
	: config_ (std::move (config)), http_ (http), store_ (store), shell_ (shell)
{
}

ApiResult ApiClient::Classify (const HttpResponse& response)
{
	ApiResult r;
	r.status = response.status;
	if (response.status == 0) {
		r.code = "network";
		r.message = response.error;
		return r;
	}
	std::string parseError;
	r.data = Json::Parse (response.body, &parseError);
	const std::string serverMessage = r.data["error"].AsString ();
	if (response.status >= 200 && response.status < 300) {
		r.ok = true;
		r.code = "ok";
		return r;
	}
	r.message = serverMessage;
	switch (response.status) {
		case 401: r.code = "unauthorized"; break;
		case 402: r.code = "insufficient_nodes"; break;
		case 404: r.code = "not_found"; break;
		case 429: r.code = "rate_limited"; break;
		default: r.code = (response.status >= 500) ? "server" : "bad_request"; break;
	}
	return r;
}

ApiResult ApiClient::Raw (const std::string& method, const std::string& url, const Json* body, const std::string& bearer, int timeoutSeconds)
{
	HttpRequest req;
	req.method = method;
	req.url = url;
	req.timeoutSeconds = timeoutSeconds;
	req.headers.emplace_back ("Accept", "application/json");
	req.headers.emplace_back ("User-Agent", config_.userAgent);
	if (!bearer.empty ()) req.headers.emplace_back ("Authorization", "Bearer " + bearer);
	if (body) {
		req.headers.emplace_back ("Content-Type", "application/json");
		req.body = body->Dump ();
	}
	return Classify (http_.Send (req));
}

// ── Pairing ──────────────────────────────────────────────────────────────────

ApiResult ApiClient::PairStart (const std::string& deviceName, PairingInfo& info)
{
	Json body = Json::MakeObject ();
	body.Set ("platform", config_.platform);
	body.Set ("deviceName", deviceName.empty () ? std::string ("Archicad") : deviceName.substr (0, 60));
	ApiResult r = Raw ("POST", config_.baseUrl + Path ("/pair/start"), &body, std::string (), 20);
	if (!r.ok) return r;

	DeviceCredentials creds;
	creds.deviceId = r.data["deviceId"].AsString ();
	creds.deviceSecret = r.data["deviceSecret"].AsString ();
	info.userCode = r.data["userCode"].AsString ();
	info.verificationUrl = r.data["verificationUrl"].AsString ();
	info.expiresIn = static_cast<int> (r.data["expiresIn"].AsNumber (600));
	info.pollInterval = static_cast<int> (r.data["pollInterval"].AsNumber (3));
	if (info.pollInterval < 1) info.pollInterval = 1;
	if (info.pollInterval > 30) info.pollInterval = 30;

	// The verification URL is shown to the user and opened in their browser:
	// it must live on the API host we pair with, never anywhere the server
	// response might point.
	if (!creds.Valid () || info.userCode.empty () || !IsUuid (creds.deviceId) ||
		!IsSafeUrl (info.verificationUrl) || !SameHost (info.verificationUrl, config_.baseUrl)) {
		ApiResult bad;
		bad.status = r.status;
		bad.code = "invalid_response";
		bad.message = "Unexpected response while starting the pairing.";
		return bad;
	}
	std::lock_guard<std::mutex> lock (mutex_);
	pending_ = creds;
	r.data = Json ();   // never hand the secret to callers
	return r;
}

bool ApiClient::HasPendingPairing () const
{
	std::lock_guard<std::mutex> lock (mutex_);
	return pending_.Valid ();
}

void ApiClient::DropPendingPairing ()
{
	std::lock_guard<std::mutex> lock (mutex_);
	pending_ = DeviceCredentials ();
}

ClaimResult ApiClient::PairClaim ()
{
	ClaimResult out;
	DeviceCredentials creds;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		creds = pending_;
	}
	if (!creds.Valid ()) {
		out.api.code = "bad_request";
		out.api.message = "No pairing in progress.";
		return out;
	}
	Json body = Json::MakeObject ();
	body.Set ("deviceId", creds.deviceId);
	body.Set ("deviceSecret", creds.deviceSecret);
	out.api = Raw ("POST", config_.baseUrl + Path ("/pair/claim"), &body, std::string (), 20);

	if (out.api.status == 410) { out.status = ClaimStatus::Expired; DropPendingPairing (); return out; }
	if (!out.api.ok) { out.status = ClaimStatus::Failed; return out; }

	const std::string state = out.api.data["status"].AsString ();
	if (state == "pending") { out.status = ClaimStatus::Pending; return out; }
	if (state != "ready" || out.api.data["accessToken"].AsString ().empty ()) {
		out.status = ClaimStatus::Failed;
		out.api.ok = false;
		out.api.code = "invalid_response";
		return out;
	}

	{
		std::lock_guard<std::mutex> lock (mutex_);
		accessToken_ = out.api.data["accessToken"].AsString ();
		expiresAt_ = static_cast<long long> (out.api.data["expiresAt"].AsNumber (0));
		cached_ = pending_;
		cachedLoaded_ = true;
		pending_ = DeviceCredentials ();
	}
	store_.Save (creds);
	out.userEmail = out.api.data["userEmail"].AsString ();
	out.api.data = Json ();   // drop the token from the result
	out.status = ClaimStatus::Ready;
	return out;
}

// ── Session ──────────────────────────────────────────────────────────────────

bool ApiClient::HasCredentials ()
{
	std::lock_guard<std::mutex> lock (mutex_);
	if (!cachedLoaded_) {
		DeviceCredentials c;
		if (store_.Load (c)) cached_ = c;
		cachedLoaded_ = true;
	}
	return cached_.Valid ();
}

void ApiClient::Disconnect ()
{
	std::lock_guard<std::mutex> lock (mutex_);
	accessToken_.clear ();
	expiresAt_ = 0;
	cached_ = DeviceCredentials ();
	pending_ = DeviceCredentials ();
	cachedLoaded_ = true;
	store_.Clear ();
}

// Caller holds mutex_. `staleToken` is the token the failed call used: if the
// current token already differs, someone else refreshed meanwhile and we skip.
ApiResult ApiClient::RefreshLocked (const std::string& staleToken, bool& refreshed)
{
	refreshed = false;
	ApiResult r;
	if (!cachedLoaded_) {
		DeviceCredentials c;
		if (store_.Load (c)) cached_ = c;
		cachedLoaded_ = true;
	}
	if (!cached_.Valid ()) {
		r.status = 401;
		r.code = "unauthorized";
		r.message = "Not connected.";
		return r;
	}
	if (!staleToken.empty () && accessToken_ != staleToken && !accessToken_.empty ()) {
		r.ok = true; r.status = 200; r.code = "ok";
		return r;   // already renewed by a concurrent call
	}
	Json body = Json::MakeObject ();
	body.Set ("deviceId", cached_.deviceId);
	body.Set ("deviceSecret", cached_.deviceSecret);
	r = Raw ("POST", config_.baseUrl + Path ("/pair/refresh"), &body, std::string (), 20);
	if (r.ok) {
		const std::string token = r.data["accessToken"].AsString ();
		if (token.empty ()) {
			r.ok = false; r.code = "invalid_response";
			return r;
		}
		accessToken_ = token;
		expiresAt_ = static_cast<long long> (r.data["expiresAt"].AsNumber (0));
		refreshed = true;
		r.data = Json ();
	} else if (r.code == "unauthorized") {
		// Server revoked / lost the device: forget it so the UI offers pairing.
		accessToken_.clear ();
		expiresAt_ = 0;
		cached_ = DeviceCredentials ();
		store_.Clear ();
	}
	return r;
}

ApiResult ApiClient::Refresh ()
{
	std::lock_guard<std::mutex> lock (mutex_);
	bool refreshed = false;
	return RefreshLocked (std::string (), refreshed);
}

bool ApiClient::EnsureTokenLocked (std::string& token)
{
	if (!accessToken_.empty () && expiresAt_ > shell_.NowEpoch () + kExpirySkewSeconds) {
		token = accessToken_;
		return true;
	}
	bool refreshed = false;
	const ApiResult r = RefreshLocked (accessToken_, refreshed);
	if (!r.ok) return false;
	token = accessToken_;
	return !token.empty ();
}

ApiResult ApiClient::Authed (const std::string& method, const std::string& path, const Json* body, int timeoutSeconds)
{
	std::string token;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		if (!EnsureTokenLocked (token)) {
			ApiResult r;
			r.status = 401;
			r.code = "unauthorized";
			r.message = "Not connected.";
			return r;
		}
	}
	ApiResult r = Raw (method, config_.baseUrl + path, body, token, timeoutSeconds);
	if (r.code != "unauthorized") return r;

	// One transparent retry with a fresh token.
	{
		std::lock_guard<std::mutex> lock (mutex_);
		bool refreshed = false;
		const ApiResult rr = RefreshLocked (token, refreshed);
		if (!rr.ok) return r;
		token = accessToken_;
	}
	return Raw (method, config_.baseUrl + path, body, token, timeoutSeconds);
}

ApiResult ApiClient::Session () { return Authed ("GET", Path ("/session"), nullptr, 20); }
ApiResult ApiClient::Catalog () { return Authed ("GET", Path ("/catalog?platform=" + UrlEncode (config_.platform)), nullptr, 30); }
ApiResult ApiClient::ListRenders () { return Authed ("GET", "/api/renders/list", nullptr, 30); }

ApiResult ApiClient::GetRender (const std::string& renderId)
{
	if (!IsUuid (renderId)) {
		ApiResult r;
		r.code = "bad_request";
		r.message = "Invalid render id.";
		return r;
	}
	return Authed ("GET", Path ("/render?id=" + UrlEncode (renderId)), nullptr, 20);
}

ApiResult ApiClient::SignUpload (const std::string& area, const std::string& mime, long long sizeBytes, std::string& key, std::string& uploadUrl)
{
	Json body = Json::MakeObject ();
	body.Set ("area", area);
	body.Set ("contentType", mime);
	body.Set ("sizeBytes", sizeBytes);
	ApiResult r = Authed ("POST", "/api/uploads/sign", &body, 30);
	if (!r.ok) return r;
	key = r.data["key"].AsString ();
	uploadUrl = r.data["uploadUrl"].AsString ();
	if (key.empty () || !IsSafeUrl (uploadUrl)) {
		ApiResult bad;
		bad.status = r.status;
		bad.code = "invalid_response";
		bad.message = "Could not prepare the image upload.";
		return bad;
	}
	return r;
}

ApiResult ApiClient::Generate (const Json& body)
{
	return Authed ("POST", "/api/generate", &body, config_.generateTimeoutSeconds);
}

// ── Raw bytes ────────────────────────────────────────────────────────────────

ApiResult ApiClient::PutBytes (const std::string& uploadUrl, const std::string& mime, const std::string& bytes)
{
	ApiResult r;
	if (!IsSafeUrl (uploadUrl)) {
		r.code = "invalid_response";
		r.message = "Unsafe upload URL.";
		return r;
	}
	HttpRequest req;
	req.method = "PUT";
	req.url = uploadUrl;
	req.timeoutSeconds = 180;
	req.headers.emplace_back ("Content-Type", mime);
	req.headers.emplace_back ("User-Agent", config_.userAgent);
	req.body = bytes;
	const HttpResponse resp = http_.Send (req);
	r.status = resp.status;
	if (resp.status == 0) { r.code = "network"; r.message = resp.error; return r; }
	r.ok = resp.status >= 200 && resp.status < 300;
	r.code = r.ok ? "ok" : (resp.status >= 500 ? "server" : "bad_request");
	return r;
}

ApiResult ApiClient::Download (const std::string& url, std::string& bytes)
{
	ApiResult r;
	if (!IsSafeUrl (url)) {
		r.code = "invalid_response";
		r.message = "Unsafe download URL.";
		return r;
	}
	HttpRequest req;
	req.method = "GET";
	req.url = url;
	req.timeoutSeconds = 120;
	req.headers.emplace_back ("User-Agent", config_.userAgent);
	const HttpResponse resp = http_.Send (req);
	r.status = resp.status;
	if (resp.status == 0) { r.code = "network"; r.message = resp.error; return r; }
	r.ok = resp.status >= 200 && resp.status < 300;
	r.code = r.ok ? "ok" : (resp.status >= 500 ? "server" : "bad_request");
	if (r.ok) bytes = resp.body;
	return r;
}

} // namespace spacenode
