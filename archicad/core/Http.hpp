// Transport abstraction. Platform backends: NSURLSession (macOS), WinHTTP
// (Windows). Tests inject a fake. Send() is synchronous and must only be
// called from a worker thread, never from Archicad's main thread.
#pragma once

#include <string>
#include <utility>
#include <vector>

namespace spacenode {

struct HttpRequest {
	std::string method = "GET";
	std::string url;
	std::vector<std::pair<std::string, std::string>> headers;
	std::string body;       // raw bytes
	int timeoutSeconds = 30;
};

struct HttpResponse {
	int status = 0;         // 0 = no HTTP response (transport failure)
	std::string body;       // raw bytes
	std::string error;      // transport error text when status == 0
};

class IHttpClient {
public:
	virtual ~IHttpClient () = default;
	virtual HttpResponse Send (const HttpRequest& request) = 0;
	// Aborts every in-flight request (add-on shutdown). Pending Send() calls
	// return promptly with status 0.
	virtual void CancelAll () {}
};

} // namespace spacenode
