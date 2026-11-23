// End-to-end check of the product flow over REAL HTTP (NSURLSession / WinHTTP)
// against tests/e2e/run.mjs's mock server. Archicad is replaced by a fake capture
// that serves a real PNG; the OS shell is real for files, inert for browser opens.
#include <cstdio>
#include <cstdlib>
#include <thread>

#include "../Fakes.hpp"
#include "../TestKit.hpp"
#include "../../core/Util.hpp"
#include "../../platform/PlatformFactory.hpp"

using namespace spacenode;
using namespace fakes;

namespace {

class TestShell final : public IShell {
public:
	TestShell (std::shared_ptr<IShell> real, std::string pictures, std::string temp) : real_ (std::move (real)), pictures_ (std::move (pictures)), temp_ (std::move (temp)) {}
	bool OpenUrl (const std::string& url) override { opened.push_back (url); return true; }
	bool RevealFile (const std::string& p) override { revealed.push_back (p); return true; }
	std::string PicturesDirectory () override { return pictures_; }
	std::string TempDirectory () override { return temp_; }
	std::string ConfigDirectory () override { return temp_; }
	std::string MachineName () override { return "E2E-Mac"; }
	bool EnsureDirectory (const std::string& p) override { return real_->EnsureDirectory (p); }
	bool WriteFile (const std::string& p, const std::string& b) override { return real_->WriteFile (p, b); }
	bool ReadFile (const std::string& p, std::string& b) override { return real_->ReadFile (p, b); }
	void RemoveFile (const std::string& p) override { real_->RemoveFile (p); }
	long long NowEpoch () override { return real_->NowEpoch (); }
	std::vector<std::string> opened, revealed;
private:
	std::shared_ptr<IShell> real_;
	std::string pictures_, temp_;
};

class FileCapture final : public ICapture {
public:
	FileCapture (IShell& shell, std::string source, std::string work) : shell_ (shell), source_ (std::move (source)), work_ (std::move (work)) {}
	CaptureResult CaptureCurrent3DView () override
	{
		std::string bytes;
		CaptureResult r;
		if (!shell_.ReadFile (source_, bytes)) { r.errorCode = "capture_failed"; return r; }
		const std::string path = JoinPath (work_, "capture-under-test.png");
		shell_.WriteFile (path, bytes);
		r.ok = true;
		r.view.path = path;
		r.view.mime = "image/png";
		ImageDimensions (bytes, r.view.width, r.view.height);
		r.view.viewName = "3D";
		return r;
	}
	bool ActivateModel3DWindow () override { return true; }
private:
	IShell& shell_;
	std::string source_, work_;
};

std::string Env (const char* name)
{
	const char* v = std::getenv (name);
	return v ? v : "";
}

} // namespace

TEST (e2e_pair_catalog_capture_upload_generate_save_over_real_http)
{
	const std::string base = Env ("SN_E2E_BASE_URL");
	CHECK (!base.empty ());
	if (base.empty ()) return;

	auto real = CreateShell ();
	auto shell = std::make_shared<TestShell> (real, Env ("SN_E2E_PICTURES"), Env ("SN_E2E_TEMP"));
	FileCapture capture (*shell, Env ("SN_E2E_CAPTURE_PNG"), Env ("SN_E2E_TEMP"));
	EventLog log;

	Controller::Services sv;
	sv.http = CreateHttpClient ();
	sv.store = std::make_shared<MemoryCredentialStore> ();
	sv.shell = shell;
	sv.capture = &capture;
	sv.config.baseUrl = NormalizeBaseUrl (base);
	sv.sink = [&log] (const std::string& t, const Json& p) { log.Add (t, p); };
	auto controller = Controller::Create (sv);

	controller->Handle ("ready", Json ());
	CHECK_EQ (log.WaitFor ("connection")["status"].AsString (), std::string ("disconnected"));
	controller->Handle ("connect", Json ());
	const Json pairing = log.WaitMatch ("connection", [] (const Json& p) { return p["status"].AsString () == "pairing" && !p["pairing"]["userCode"].AsString ().empty (); }, 15000);
	CHECK_EQ (pairing["pairing"]["userCode"].AsString (), std::string ("K7QM-4XD2"));
	CHECK (!shell->opened.empty ());
	log.WaitMatch ("connection", [] (const Json& p) { return p["status"].AsString () == "connected"; }, 20000);
	const Json catalog = log.WaitFor ("catalog", 1, 15000)["catalog"];
	CHECK (catalog["engines"].Size () >= 1);
	CHECK_EQ (log.WaitFor ("session", 1, 5000)["email"].AsString (), std::string ("e2e@spacenode.test"));

	const Json options = Json::Parse (R"({"engine":"vega","resolution":"hd","projectType":"interior","segment":"Residencial","environment":"Sala de estar","lighting":"Luz natural","background":"","sceneElements":["Plantas"],"prompt":"piso de madeira clara"})");
	controller->Handle ("generate", options);
	const Json cap = log.WaitFor ("capture", 1, 15000);
	CHECK_EQ (cap["width"].AsNumber (), 1280.0);
	const Json result = log.WaitFor ("result", 1, 60000);
	CHECK_EQ (result["nodesCharged"].AsNumber (), 10.0);
	CHECK (IsSafeUrl (result["outputUrl"].AsString ()));

	controller->Handle ("save", Json ());
	const Json saved = log.WaitFor ("saved", 1, 30000);
	std::string savedBytes;
	CHECK (real->ReadFile (saved["path"].AsString (), savedBytes));
	CHECK_EQ (SniffImageExtension (savedBytes), std::string ("png"));
	std::printf ("SAVED_PATH=%s\nSAVED_BYTES=%zu\n", saved["path"].AsString ().c_str (), savedBytes.size ());

	controller->Handle ("disconnect", Json ());
	controller->Shutdown ();
}

int main () { return tk::RunAll (); }
