// Services the core needs from the host OS / Archicad. Real implementations
// live in platform/ (OS) and Src/ (Archicad); tests provide fakes.
#pragma once

#include <memory>
#include <string>

#include "Http.hpp"
#include "Json.hpp"

namespace spacenode {

struct DeviceCredentials {
	std::string deviceId;
	std::string deviceSecret;
	bool Valid () const { return !deviceId.empty () && !deviceSecret.empty (); }
};

// Long-lived device secret. The OS keychain on real builds.
class ICredentialStore {
public:
	virtual ~ICredentialStore () = default;
	virtual bool Load (DeviceCredentials& out) = 0;
	virtual bool Save (const DeviceCredentials& creds) = 0;
	virtual void Clear () = 0;
};

class MemoryCredentialStore final : public ICredentialStore {
public:
	bool Load (DeviceCredentials& out) override { out = creds_; return creds_.Valid (); }
	bool Save (const DeviceCredentials& creds) override { creds_ = creds; return true; }
	void Clear () override { creds_ = DeviceCredentials (); }
private:
	DeviceCredentials creds_;
};

struct CapturedView {
	std::string path;       // image file on disk (temp)
	std::string mime;       // image/png | image/jpeg
	int width = 0;
	int height = 0;
	Json facts;             // optional `modelFacts` (camera) — Null when unknown
	std::string viewName;   // best-effort label of the captured view
};

struct CaptureResult {
	bool ok = false;
	std::string errorCode;      // stable machine code, see Controller
	std::string errorMessage;   // already localized by the capture implementation
	CapturedView view;
};

// Captures the CURRENT 3D window. Called on the host main thread.
class ICapture {
public:
	virtual ~ICapture () = default;
	virtual CaptureResult CaptureCurrent3DView () = 0;
	// Brings the 3D window to front so a capture can happen.
	virtual bool ActivateModel3DWindow () = 0;
};

// OS shell integration. Methods are called from any thread.
class IShell {
public:
	virtual ~IShell () = default;
	virtual bool OpenUrl (const std::string& url) = 0;
	virtual bool RevealFile (const std::string& path) = 0;
	virtual std::string PicturesDirectory () = 0;   // writable folder for results
	virtual std::string TempDirectory () = 0;
	virtual std::string ConfigDirectory () = 0;     // per-user app-data root
	virtual std::string MachineName () = 0;
	virtual bool EnsureDirectory (const std::string& path) = 0;
	virtual bool WriteFile (const std::string& path, const std::string& bytes) = 0;
	virtual bool ReadFile (const std::string& path, std::string& bytes) = 0;
	virtual void RemoveFile (const std::string& path) = 0;
	virtual long long NowEpoch () = 0;
};

} // namespace spacenode
