// Windows backends: WinHTTP transport, Credential Manager store, shell.
// NOTE: written against the documented Win32 APIs and compile-checked with a
// MinGW-w64 toolchain, but not executed on Windows in the original authoring
// environment (see archicad/README.md, "Test checklist").
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <wincred.h>
#include <winhttp.h>

#include <atomic>
#include <mutex>
#include <set>

#include "../CommonShell.hpp"
#include "../PlatformFactory.hpp"

namespace spacenode {

namespace {

std::wstring Wide (const std::string& s)
{
	if (s.empty ()) return std::wstring ();
	const int n = MultiByteToWideChar (CP_UTF8, 0, s.data (), static_cast<int> (s.size ()), nullptr, 0);
	std::wstring w (static_cast<std::size_t> (n), L'\0');
	MultiByteToWideChar (CP_UTF8, 0, s.data (), static_cast<int> (s.size ()), w.data (), n);
	return w;
}

std::string Narrow (const std::wstring& w)
{
	if (w.empty ()) return std::string ();
	const int n = WideCharToMultiByte (CP_UTF8, 0, w.data (), static_cast<int> (w.size ()), nullptr, 0, nullptr, nullptr);
	std::string s (static_cast<std::size_t> (n), '\0');
	WideCharToMultiByte (CP_UTF8, 0, w.data (), static_cast<int> (w.size ()), s.data (), n, nullptr, nullptr);
	return s;
}

std::string LastErrorText (const char* what, DWORD code)
{
	return std::string (what) + " (error " + std::to_string (static_cast<unsigned long> (code)) + ")";
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

class WinHttpClient final : public IHttpClient {
public:
	WinHttpClient ()
	{
		session_ = WinHttpOpen (L"SpaceNode-Archicad", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
		if (session_) {
			DWORD protocols = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
#ifdef WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3
			protocols |= WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
#endif
			WinHttpSetOption (session_, WINHTTP_OPTION_SECURE_PROTOCOLS, &protocols, sizeof protocols);
		}
	}

	~WinHttpClient () override
	{
		CancelAll ();
		if (session_) WinHttpCloseHandle (session_);
	}

	HttpResponse Send (const HttpRequest& request) override
	{
		HttpResponse out;
		if (!session_) { out.error = "WinHTTP unavailable"; return out; }
		if (cancelled_) { out.error = "cancelled"; return out; }

		const std::wstring wideUrl = Wide (request.url);
		URL_COMPONENTS parts = {};
		parts.dwStructSize = sizeof parts;
		parts.dwSchemeLength = parts.dwHostNameLength = parts.dwUrlPathLength = parts.dwExtraInfoLength = static_cast<DWORD> (-1);
		if (!WinHttpCrackUrl (wideUrl.c_str (), static_cast<DWORD> (wideUrl.size ()), 0, &parts)) {
			out.error = LastErrorText ("invalid url", GetLastError ());
			return out;
		}
		const std::wstring host (parts.lpszHostName, parts.dwHostNameLength);
		const std::wstring path = std::wstring (parts.lpszUrlPath, parts.dwUrlPathLength) + std::wstring (parts.lpszExtraInfo, parts.dwExtraInfoLength);
		const bool secure = parts.nScheme == INTERNET_SCHEME_HTTPS;

		HINTERNET connection = WinHttpConnect (session_, host.c_str (), parts.nPort, 0);
		if (!connection) { out.error = LastErrorText ("connect", GetLastError ()); return out; }
		HINTERNET req = WinHttpOpenRequest (connection, Wide (request.method).c_str (), path.c_str (), nullptr, WINHTTP_NO_REFERER,
											WINHTTP_DEFAULT_ACCEPT_TYPES, secure ? WINHTTP_FLAG_SECURE : 0);
		if (!req) {
			out.error = LastErrorText ("open request", GetLastError ());
			WinHttpCloseHandle (connection);
			return out;
		}
		Track (req, true);

		const int ms = (request.timeoutSeconds > 0 ? request.timeoutSeconds : 30) * 1000;
		WinHttpSetTimeouts (req, ms, ms, ms, ms);

		bool hasAuthorization = false;
		std::wstring headers;
		for (const auto& h : request.headers) {
			if (h.first == "Authorization") hasAuthorization = true;
			headers += Wide (h.first) + L": " + Wide (h.second) + L"\r\n";
		}
		// Never replay credentials across redirects.
		DWORD disable = WINHTTP_DISABLE_COOKIES | (hasAuthorization ? WINHTTP_DISABLE_REDIRECTS : 0);
		WinHttpSetOption (req, WINHTTP_OPTION_DISABLE_FEATURE, &disable, sizeof disable);

		const DWORD bodySize = static_cast<DWORD> (request.body.size ());
		BOOL ok = WinHttpSendRequest (req, headers.empty () ? WINHTTP_NO_ADDITIONAL_HEADERS : headers.c_str (),
									  headers.empty () ? 0 : static_cast<DWORD> (-1L),
									  bodySize ? const_cast<char*> (request.body.data ()) : WINHTTP_NO_REQUEST_DATA, bodySize, bodySize, 0);
		if (ok) ok = WinHttpReceiveResponse (req, nullptr);
		if (!ok) {
			out.error = LastErrorText ("request failed", GetLastError ());
		} else {
			DWORD status = 0, size = sizeof status;
			WinHttpQueryHeaders (req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX);
			out.status = static_cast<int> (status);
			for (;;) {
				DWORD available = 0;
				if (!WinHttpQueryDataAvailable (req, &available) || available == 0) break;
				const std::size_t old = out.body.size ();
				out.body.resize (old + available);
				DWORD read = 0;
				if (!WinHttpReadData (req, &out.body[old], available, &read)) { out.body.resize (old); break; }
				out.body.resize (old + read);
				if (read == 0) break;
			}
		}
		const bool wasTracked = Track (req, false);
		if (wasTracked) WinHttpCloseHandle (req);   // CancelAll() already closed untracked ones
		WinHttpCloseHandle (connection);
		return out;
	}

	void CancelAll () override
	{
		cancelled_ = true;
		std::lock_guard<std::mutex> lock (mutex_);
		for (HINTERNET h : active_) WinHttpCloseHandle (h);   // aborts pending sync calls
		active_.clear ();
	}

private:
	// add: registers; remove: returns true when the handle was still registered.
	bool Track (HINTERNET h, bool add)
	{
		std::lock_guard<std::mutex> lock (mutex_);
		if (add) { active_.insert (h); return true; }
		return active_.erase (h) > 0;
	}

	HINTERNET session_ = nullptr;
	std::atomic<bool> cancelled_{false};
	std::mutex mutex_;
	std::set<HINTERNET> active_;
};

// ── Credential Manager ───────────────────────────────────────────────────────

class CredentialManagerStore final : public ICredentialStore {
public:
	explicit CredentialManagerStore (const std::string& baseUrl) : target_ (Wide ("SpaceNode/Archicad/" + baseUrl)) {}

	bool Load (DeviceCredentials& out) override
	{
		PCREDENTIALW cred = nullptr;
		if (!CredReadW (target_.c_str (), CRED_TYPE_GENERIC, 0, &cred) || !cred) return false;
		const std::string json (reinterpret_cast<const char*> (cred->CredentialBlob), cred->CredentialBlobSize);
		CredFree (cred);
		const Json j = Json::Parse (json);
		out.deviceId = j["deviceId"].AsString ();
		out.deviceSecret = j["deviceSecret"].AsString ();
		return out.Valid ();
	}

	bool Save (const DeviceCredentials& creds) override
	{
		Json j = Json::MakeObject ();
		j.Set ("deviceId", creds.deviceId);
		j.Set ("deviceSecret", creds.deviceSecret);
		const std::string json = j.Dump ();
		CREDENTIALW cred = {};
		cred.Type = CRED_TYPE_GENERIC;
		cred.TargetName = const_cast<LPWSTR> (target_.c_str ());
		cred.CredentialBlobSize = static_cast<DWORD> (json.size ());
		cred.CredentialBlob = reinterpret_cast<LPBYTE> (const_cast<char*> (json.data ()));
		cred.Persist = CRED_PERSIST_LOCAL_MACHINE;   // this PC only, not roamed
		cred.UserName = const_cast<LPWSTR> (L"SpaceNode device");
		return CredWriteW (&cred, 0) == TRUE;
	}

	void Clear () override { CredDeleteW (target_.c_str (), CRED_TYPE_GENERIC, 0); }

private:
	std::wstring target_;
};

// ── Shell ────────────────────────────────────────────────────────────────────

std::string KnownFolder (REFKNOWNFOLDERID id)
{
	PWSTR raw = nullptr;
	std::string out;
	if (SUCCEEDED (SHGetKnownFolderPath (id, KF_FLAG_CREATE, nullptr, &raw)) && raw) out = Narrow (raw);
	CoTaskMemFree (raw);
	return out;
}

class WinShell final : public FileShellBase {
public:
	bool OpenUrl (const std::string& url) override
	{
		return reinterpret_cast<INT_PTR> (ShellExecuteW (nullptr, L"open", Wide (url).c_str (), nullptr, nullptr, SW_SHOWNORMAL)) > 32;
	}

	bool RevealFile (const std::string& path) override
	{
		const std::wstring args = L"/select,\"" + Wide (path) + L"\"";
		return reinterpret_cast<INT_PTR> (ShellExecuteW (nullptr, L"open", L"explorer.exe", args.c_str (), nullptr, SW_SHOWNORMAL)) > 32;
	}

	std::string PicturesDirectory () override
	{
		const std::string p = KnownFolder (FOLDERID_Pictures);
		return p.empty () ? TempDirectory () : p;
	}

	std::string ConfigDirectory () override
	{
		const std::string p = KnownFolder (FOLDERID_RoamingAppData);
		return p.empty () ? TempDirectory () : p;
	}

	std::string TempDirectory () override
	{
		wchar_t buf[MAX_PATH + 2] = {0};
		const DWORD n = GetTempPathW (MAX_PATH + 1, buf);
		return n ? Narrow (std::wstring (buf, n)) : std::string ("C:\\Temp");
	}

	std::string MachineName () override
	{
		wchar_t buf[MAX_COMPUTERNAME_LENGTH + 1] = {0};
		DWORD size = MAX_COMPUTERNAME_LENGTH + 1;
		return GetComputerNameW (buf, &size) ? Narrow (std::wstring (buf, size)) : std::string ("Windows");
	}
};

} // namespace

std::shared_ptr<IHttpClient> CreateHttpClient () { return std::make_shared<WinHttpClient> (); }
std::shared_ptr<ICredentialStore> CreateCredentialStore (const std::string& baseUrl) { return std::make_shared<CredentialManagerStore> (baseUrl); }
std::shared_ptr<IShell> CreateShell () { return std::make_shared<WinShell> (); }

} // namespace spacenode
