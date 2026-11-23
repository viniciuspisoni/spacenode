// Orchestrates the add-on product flow (pair -> catalog -> capture -> upload ->
// generate -> recover -> save). Platform-free: everything OS/Archicad specific
// comes in through Services. Handle() runs on the host main thread; blocking
// work (network, disk) runs on worker threads and reports through the event
// sink, which may be invoked from any thread.
#pragma once

#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>

#include "ApiClient.hpp"
#include "Generation.hpp"
#include "Json.hpp"
#include "Platform.hpp"

namespace spacenode {

using EventSink = std::function<void (const std::string& type, const Json& payload)>;

class Controller : public std::enable_shared_from_this<Controller> {
public:
	struct Services {
		std::shared_ptr<IHttpClient> http;
		std::shared_ptr<ICredentialStore> store;
		std::shared_ptr<IShell> shell;
		ICapture* capture = nullptr;      // host main thread only, outlives the controller
		ApiConfig config;
		EventSink sink;
	};

	static std::shared_ptr<Controller> Create (Services services);

	// Commands from the panel: ready, connect, openPairing, cancelConnect, disconnect,
	// refresh, activate3D, generate, cancelGenerate, save, reveal, openResult,
	// openWeb, restoreRender.
	void Handle (const std::string& type, const Json& payload);

	// Stops accepting events, aborts in-flight requests, waits briefly for workers.
	void Shutdown ();

	// Error codes emitted in {type:"error"} events are part of the UI contract:
	// not_connected, catalog_missing, invalid_options, insufficient_nodes, busy,
	// no_3d_view, capture_failed, image_too_large, pair_expired, pair_failed,
	// network, unauthorized, rate_limited, server, generate_failed, generate_lost,
	// save_failed, bad_request.

private:
	explicit Controller (Services services);

	void Emit (const std::string& type, Json payload = Json::MakeObject ());
	void EmitError (const std::string& scope, const std::string& code, const std::string& message);
	void EmitErrorFrom (const std::string& scope, const ApiResult& r);
	void EmitConnection ();
	void Spawn (std::function<void ()> work);
	bool SleepInterruptible (int milliseconds, unsigned pairEpoch);

	void StartPairing ();
	void PairingLoop (unsigned epoch);
	void LoadSessionAndCatalog ();
	void StartGenerate (const Json& payload);
	void RunGenerate (unsigned epoch, GenerateOptions options, CapturedView view);
	void SaveResult ();
	void RestoreRender (const std::string& renderId);

	Services s_;
	ApiClient api_;

	std::mutex mutex_;                    // guards state below
	std::condition_variable cv_;
	bool closed_ = false;
	unsigned pairEpoch_ = 0;
	bool pairing_ = false;
	PairingInfo pairingInfo_;
	long long pairingDeadline_ = 0;
	std::string email_;
	Json catalog_;                        // full catalog as returned
	Json lastBalance_;
	unsigned generateEpoch_ = 0;
	bool generating_ = false;
	Json lastResult_;                     // Json object with outputUrl, renderId...
	std::string lastSavedPath_;
	std::string previousRenderId_;
	int workers_ = 0;
};

} // namespace spacenode
