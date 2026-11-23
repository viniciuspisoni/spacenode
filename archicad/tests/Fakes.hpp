// Test doubles: scripted HTTP server, in-memory shell, scripted capture.
#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "../core/Controller.hpp"

namespace fakes {

using namespace spacenode;

class FakeHttp final : public IHttpClient {
public:
	using Handler = std::function<HttpResponse (const HttpRequest&)>;

	void On (const std::string& methodAndPath, Handler h) { std::lock_guard<std::mutex> l (m_); routes_[methodAndPath] = std::move (h); }

	static HttpResponse Json200 (const std::string& body, int status = 200) { HttpResponse r; r.status = status; r.body = body; return r; }
	static HttpResponse Down () { HttpResponse r; r.status = 0; r.error = "offline"; return r; }

	HttpResponse Send (const HttpRequest& req) override
	{
		Handler h;
		std::string key;
		{
			std::lock_guard<std::mutex> l (m_);
			requests_.push_back (req);
			// strip scheme+host; keep path (+query) so routes read like "POST /api/generate"
			std::string path = req.url;
			const std::size_t p = path.find ("://");
			if (p != std::string::npos) { const std::size_t s = path.find ('/', p + 3); path = s == std::string::npos ? "/" : path.substr (s); }
			key = req.method + " " + path;
			auto it = routes_.find (key);
			if (it == routes_.end ()) {
				const std::size_t q = key.find ('?');
				if (q != std::string::npos) it = routes_.find (key.substr (0, q));
			}
			if (it != routes_.end ()) h = it->second;
		}
		if (!h) { HttpResponse r; r.status = 404; r.body = "{\"error\":\"no route " + key + "\"}"; return r; }
		return h (req);
	}

	void CancelAll () override { cancelled = true; }

	std::vector<HttpRequest> Requests () { std::lock_guard<std::mutex> l (m_); return requests_; }
	int Count (const std::string& methodAndPathPrefix)
	{
		std::lock_guard<std::mutex> l (m_);
		int n = 0;
		for (const HttpRequest& r : requests_) {
			std::string path = r.url;
			const std::size_t p = path.find ("://");
			if (p != std::string::npos) { const std::size_t s = path.find ('/', p + 3); path = s == std::string::npos ? "/" : path.substr (s); }
			if ((r.method + " " + path).rfind (methodAndPathPrefix, 0) == 0) ++n;
		}
		return n;
	}
	std::atomic<bool> cancelled{false};

private:
	std::mutex m_;
	std::map<std::string, Handler> routes_;
	std::vector<HttpRequest> requests_;
};

class FakeShell final : public IShell {
public:
	bool OpenUrl (const std::string& url) override { std::lock_guard<std::mutex> l (m_); opened.push_back (url); return true; }
	bool RevealFile (const std::string& path) override { std::lock_guard<std::mutex> l (m_); revealed.push_back (path); return true; }
	std::string PicturesDirectory () override { return "/pictures"; }
	std::string TempDirectory () override { return "/tmp"; }
	std::string ConfigDirectory () override { return "/config"; }
	std::string MachineName () override { return "TestMac"; }
	bool EnsureDirectory (const std::string&) override { return true; }
	bool WriteFile (const std::string& path, const std::string& bytes) override { std::lock_guard<std::mutex> l (m_); files[path] = bytes; return true; }
	bool ReadFile (const std::string& path, std::string& bytes) override
	{
		std::lock_guard<std::mutex> l (m_);
		auto it = files.find (path);
		if (it == files.end ()) return false;
		bytes = it->second;
		return true;
	}
	void RemoveFile (const std::string& path) override { std::lock_guard<std::mutex> l (m_); files.erase (path); }
	long long NowEpoch () override { return now.load (); }

	std::vector<std::string> Opened () { std::lock_guard<std::mutex> l (m_); return opened; }

	std::mutex m_;
	std::map<std::string, std::string> files;
	std::vector<std::string> opened, revealed;
	std::atomic<long long> now{1790000000};   // 2026-09-21
};

class FakeCapture final : public ICapture {
public:
	CaptureResult CaptureCurrent3DView () override
	{
		++captures;
		if (fail) { CaptureResult r; r.errorCode = "no_3d_view"; r.errorMessage = "open 3D"; return r; }
		CaptureResult r;
		r.ok = true;
		r.view.path = "/tmp/capture.png";
		r.view.mime = "image/png";
		r.view.width = width;
		r.view.height = height;
		r.view.viewName = "3D / All Stories";
		r.view.facts = Json::MakeObject ();
		Json cam = Json::MakeObject ();
		cam.Set ("fovDeg", 50.0);
		r.view.facts.Set ("camera", cam);
		if (shell) shell->files["/tmp/capture.png"] = pngBytes;
		return r;
	}
	bool ActivateModel3DWindow () override { return true; }

	std::atomic<int> captures{0};
	bool fail = false;
	int width = 1920, height = 1080;
	FakeShell* shell = nullptr;
	std::string pngBytes;
};

class EventLog {
public:
	void Add (const std::string& type, const Json& payload)
	{
		std::lock_guard<std::mutex> l (m_);
		events_.push_back ({type, payload});
		cv_.notify_all ();
	}
	// Waits for the Nth event of a type (1-based). Returns its payload or Null.
	Json WaitFor (const std::string& type, int nth = 1, int timeoutMs = 8000)
	{
		std::unique_lock<std::mutex> l (m_);
		Json found;
		cv_.wait_for (l, std::chrono::milliseconds (timeoutMs), [&] {
			int n = 0;
			for (auto& e : events_) if (e.first == type && ++n == nth) { found = e.second; return true; }
			return false;
		});
		return found;
	}
	// Waits for an event of `type` whose payload satisfies pred.
	Json WaitMatch (const std::string& type, const std::function<bool (const Json&)>& pred, int timeoutMs = 8000)
	{
		std::unique_lock<std::mutex> l (m_);
		Json found;
		cv_.wait_for (l, std::chrono::milliseconds (timeoutMs), [&] {
			for (auto& e : events_) if (e.first == type && pred (e.second)) { found = e.second; return true; }
			return false;
		});
		return found;
	}
	int Count (const std::string& type)
	{
		std::lock_guard<std::mutex> l (m_);
		int n = 0;
		for (auto& e : events_) if (e.first == type) ++n;
		return n;
	}
	std::string DumpAll ()
	{
		std::lock_guard<std::mutex> l (m_);
		std::string s;
		for (auto& e : events_) s += e.first + ":" + e.second.Dump () + "\n";
		return s;
	}
private:
	std::mutex m_;
	std::condition_variable cv_;
	std::vector<std::pair<std::string, Json>> events_;
};

} // namespace fakes
