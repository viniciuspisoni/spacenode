#include "Controller.hpp"

#include <algorithm>
#include <chrono>
#include <thread>

#include "Util.hpp"

namespace spacenode {

namespace {
constexpr int kMaxClaimFailures = 6;
constexpr int kShutdownWaitMs = 3000;
}

std::shared_ptr<Controller> Controller::Create (Services services)
{
	return std::shared_ptr<Controller> (new Controller (std::move (services)));
}

Controller::Controller (Services services)
	: s_ (std::move (services)), api_ (s_.config, *s_.http, *s_.store, *s_.shell)
{
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

void Controller::Emit (const std::string& type, Json payload)
{
	{
		std::lock_guard<std::mutex> lock (mutex_);
		if (closed_) return;
	}
	if (s_.sink) s_.sink (type, payload);
}

void Controller::EmitError (const std::string& scope, const std::string& code, const std::string& message)
{
	Json j = Json::MakeObject ();
	j.Set ("scope", scope);
	j.Set ("code", code);
	j.Set ("message", RedactSecrets (message));
	Emit ("error", std::move (j));
}

void Controller::EmitErrorFrom (const std::string& scope, const ApiResult& r)
{
	std::string code = r.code;
	if (code == "invalid_response" || code.empty ()) code = "server";
	Json j = Json::MakeObject ();
	j.Set ("scope", scope);
	j.Set ("code", code);
	j.Set ("message", RedactSecrets (r.message));
	if (r.status >= 100 && r.status <= 599) j.Set ("httpStatus", r.status);
	Emit ("error", std::move (j));
}

void Controller::Spawn (std::function<void ()> work)
{
	{
		std::lock_guard<std::mutex> lock (mutex_);
		if (closed_) return;
		++workers_;
	}
	std::shared_ptr<Controller> self = shared_from_this ();
	std::thread ([self, work] () {
		work ();
		std::lock_guard<std::mutex> lock (self->mutex_);
		--self->workers_;
		self->cv_.notify_all ();
	}).detach ();
}

bool Controller::SleepInterruptible (int milliseconds, unsigned pairEpoch)
{
	std::unique_lock<std::mutex> lock (mutex_);
	cv_.wait_for (lock, std::chrono::milliseconds (milliseconds), [&] { return closed_ || pairEpoch_ != pairEpoch; });
	return !closed_ && pairEpoch_ == pairEpoch;
}

void Controller::Shutdown ()
{
	{
		std::lock_guard<std::mutex> lock (mutex_);
		closed_ = true;
		++pairEpoch_;
		++generateEpoch_;
		cv_.notify_all ();
	}
	s_.http->CancelAll ();
	std::unique_lock<std::mutex> lock (mutex_);
	cv_.wait_for (lock, std::chrono::milliseconds (kShutdownWaitMs), [&] { return workers_ == 0; });
}

void Controller::EmitConnection ()
{
	Json j = Json::MakeObject ();
	bool pairing;
	PairingInfo info;
	long long deadline;
	std::string email;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		pairing = pairing_;
		info = pairingInfo_;
		deadline = pairingDeadline_;
		email = email_;
	}
	if (pairing) {
		j.Set ("status", "pairing");
		Json p = Json::MakeObject ();
		p.Set ("userCode", info.userCode);
		p.Set ("verificationUrl", info.verificationUrl);
		p.Set ("expiresAt", deadline);
		j.Set ("pairing", std::move (p));
	} else if (api_.HasCredentials ()) {
		j.Set ("status", "connected");
		j.Set ("email", email);
	} else {
		j.Set ("status", "disconnected");
	}
	j.Set ("apiBase", s_.config.baseUrl);
	Emit ("connection", std::move (j));
}

// ── Command dispatch ─────────────────────────────────────────────────────────

void Controller::Handle (const std::string& type, const Json& payload)
{
	if (type == "ready") {
		EmitConnection ();
		bool connected;
		{
			std::lock_guard<std::mutex> lock (mutex_);
			connected = !pairing_;
		}
		if (connected && api_.HasCredentials ())
			Spawn ([this] { LoadSessionAndCatalog (); });
	} else if (type == "connect") {
		StartPairing ();
	} else if (type == "openPairing") {
		std::string url;
		{
			std::lock_guard<std::mutex> lock (mutex_);
			if (pairing_) url = pairingInfo_.verificationUrl;
		}
		if (!url.empty ()) s_.shell->OpenUrl (url);
	} else if (type == "cancelConnect") {
		{
			std::lock_guard<std::mutex> lock (mutex_);
			++pairEpoch_;
			pairing_ = false;
			cv_.notify_all ();
		}
		api_.DropPendingPairing ();
		EmitConnection ();
	} else if (type == "disconnect") {
		{
			std::lock_guard<std::mutex> lock (mutex_);
			++pairEpoch_;
			++generateEpoch_;
			generating_ = false;
			pairing_ = false;
			email_.clear ();
			catalog_ = Json ();
			lastBalance_ = Json ();
			lastResult_ = Json ();
			cv_.notify_all ();
		}
		api_.Disconnect ();
		EmitConnection ();
	} else if (type == "refresh") {
		Spawn ([this] { LoadSessionAndCatalog (); });
	} else if (type == "activate3D") {
		if (s_.capture && !s_.capture->ActivateModel3DWindow ())
			EmitError ("capture", "no_3d_view", "Could not open the 3D window.");
	} else if (type == "testCapture") {
		if (!s_.capture) { EmitError ("capture", "capture_failed", "Capture is unavailable."); return; }
		{
			std::lock_guard<std::mutex> lock (mutex_);
			if (generating_) return;
		}
		const CaptureResult cap = s_.capture->CaptureCurrent3DView ();
		if (!cap.ok) {
			EmitError ("capture", cap.errorCode.empty () ? "capture_failed" : cap.errorCode, cap.errorMessage);
			return;
		}
		Json c = Json::MakeObject ();
		c.Set ("width", cap.view.width);
		c.Set ("height", cap.view.height);
		c.Set ("viewName", cap.view.viewName);
		c.Set ("lowResolution", std::max (cap.view.width, cap.view.height) < kMinRecommendedSidePx);
		c.Set ("diagnostic", true);
		s_.shell->RemoveFile (cap.view.path);
		Emit ("capture", std::move (c));
	} else if (type == "generate") {
		StartGenerate (payload);
	} else if (type == "cancelGenerate") {
		bool was;
		{
			std::lock_guard<std::mutex> lock (mutex_);
			was = generating_;
			++generateEpoch_;
			generating_ = false;
		}
		if (was) {
			Json j = Json::MakeObject ();
			j.Set ("busy", false);
			Emit ("busy", std::move (j));
			Json st = Json::MakeObject ();
			st.Set ("stage", "cancelled");
			Emit ("status", std::move (st));
		}
	} else if (type == "save") {
		Spawn ([this] { SaveResult (); });
	} else if (type == "reveal") {
		std::string path;
		{
			std::lock_guard<std::mutex> lock (mutex_);
			path = lastSavedPath_;
		}
		if (!path.empty ()) s_.shell->RevealFile (path);
	} else if (type == "openResult") {
		std::string url;
		{
			std::lock_guard<std::mutex> lock (mutex_);
			url = lastResult_["outputUrl"].AsString ();
		}
		if (IsSafeUrl (url)) s_.shell->OpenUrl (url);
	} else if (type == "openWeb") {
		s_.shell->OpenUrl (s_.config.baseUrl + "/app");
	} else if (type == "restoreRender") {
		const std::string id = payload["id"].AsString ();
		Spawn ([this, id] { RestoreRender (id); });
	}
}

// ── Pairing ──────────────────────────────────────────────────────────────────

void Controller::StartPairing ()
{
	unsigned epoch;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		if (pairing_) return;
		pairing_ = true;                 // optimistic: blocks double clicks
		epoch = ++pairEpoch_;
		pairingInfo_ = PairingInfo ();
	}
	Spawn ([this, epoch] { PairingLoop (epoch); });
}

void Controller::PairingLoop (unsigned epoch)
{
	const auto stale = [&] {
		std::lock_guard<std::mutex> lock (mutex_);
		return closed_ || pairEpoch_ != epoch;
	};

	PairingInfo info;
	const std::string deviceName = s_.shell->MachineName () + " \xC2\xB7 Archicad";
	const ApiResult start = api_.PairStart (deviceName, info);
	if (stale ()) return;
	if (!start.ok) {
		{
			std::lock_guard<std::mutex> lock (mutex_);
			pairing_ = false;
		}
		EmitErrorFrom ("connect", start);
		EmitConnection ();
		return;
	}
	{
		std::lock_guard<std::mutex> lock (mutex_);
		pairingInfo_ = info;
		pairingDeadline_ = s_.shell->NowEpoch () + info.expiresIn;
	}
	EmitConnection ();
	s_.shell->OpenUrl (info.verificationUrl);

	int failures = 0;
	long long deadline;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		deadline = pairingDeadline_ + 15;
	}
	const int pollMs = s_.config.pollIntervalOverrideMs > 0 ? s_.config.pollIntervalOverrideMs : info.pollInterval * 1000;
	int wait = pollMs;
	while (SleepInterruptible (wait, epoch)) {
		if (s_.shell->NowEpoch () > deadline) {
			{
				std::lock_guard<std::mutex> lock (mutex_);
				if (pairEpoch_ != epoch) return;
				pairing_ = false;
			}
			api_.DropPendingPairing ();
			EmitError ("connect", "pair_expired", "The pairing code expired.");
			EmitConnection ();
			return;
		}
		const ClaimResult claim = api_.PairClaim ();
		if (stale ()) return;
		wait = pollMs;
		switch (claim.status) {
			case ClaimStatus::Pending:
				failures = 0;
				break;
			case ClaimStatus::Ready: {
				{
					std::lock_guard<std::mutex> lock (mutex_);
					pairing_ = false;
					email_ = claim.userEmail;
				}
				EmitConnection ();
				LoadSessionAndCatalog ();
				return;
			}
			case ClaimStatus::Expired:
				{
					std::lock_guard<std::mutex> lock (mutex_);
					pairing_ = false;
				}
				EmitError ("connect", "pair_expired", "The pairing code expired.");
				EmitConnection ();
				return;
			case ClaimStatus::Failed:
				if (claim.api.code == "rate_limited") { wait = std::max (wait * 2, 10000); break; }
				if (claim.api.Network () || claim.api.code == "server") {
					if (++failures < kMaxClaimFailures) break;
				}
				{
					std::lock_guard<std::mutex> lock (mutex_);
					pairing_ = false;
				}
				api_.DropPendingPairing ();
				EmitErrorFrom ("connect", claim.api);
				EmitConnection ();
				return;
		}
	}
}

// ── Session / catalog ────────────────────────────────────────────────────────

void Controller::LoadSessionAndCatalog ()
{
	const ApiResult session = api_.Session ();
	if (!session.ok) {
		if (session.code == "unauthorized") EmitConnection ();   // credentials dropped by the client
		EmitErrorFrom ("load", session);
		return;
	}
	{
		std::lock_guard<std::mutex> lock (mutex_);
		email_ = session.data["user"]["email"].AsString (email_);
		lastBalance_ = session.data["balance"];
	}
	Json s = Json::MakeObject ();
	s.Set ("email", session.data["user"]["email"]);
	s.Set ("balance", session.data["balance"]);
	s.Set ("theme", session.data["theme"]);
	Emit ("session", std::move (s));
	EmitConnection ();

	const ApiResult catalog = api_.Catalog ();
	if (!catalog.ok) {
		EmitErrorFrom ("load", catalog);
		return;
	}
	{
		std::lock_guard<std::mutex> lock (mutex_);
		catalog_ = catalog.data;
	}
	Json c = Json::MakeObject ();
	c.Set ("catalog", SlimCatalogForUi (catalog.data));
	Emit ("catalog", std::move (c));
}

// ── Generate ─────────────────────────────────────────────────────────────────

static double BalanceTotal (const Json& balance)
{
	if (balance.IsNumber ()) return balance.AsNumber ();
	return balance["totalBalance"].AsNumber (balance["total_balance"].AsNumber (-1));
}

void Controller::StartGenerate (const Json& payload)
{
	const GenerateOptions options = GenerateOptions::FromJson (payload);
	Json catalog;
	Json balance;
	bool busy = false;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		if (generating_) { busy = true; }
		catalog = catalog_;
		balance = lastBalance_;
	}
	if (busy) { EmitError ("generate", "busy", "A generation is already running."); return; }
	if (!api_.HasCredentials ()) { EmitError ("generate", "not_connected", "Connect your SpaceNode account first."); return; }
	if (!catalog.IsObject ()) { EmitError ("generate", "catalog_missing", "The catalog has not loaded yet."); return; }
	{
		const OptionsCheck check = ValidateOptions (catalog, options);
		if (!check.ok) {
			Json j = Json::MakeObject ();
			j.Set ("scope", "generate");
			j.Set ("code", "invalid_options");
			j.Set ("field", check.field);
			j.Set ("message", check.message);
			Emit ("error", std::move (j));
			return;
		}
	}
	{
		const int cost = CostNodes (catalog, options.engine, options.resolution);
		const double have = BalanceTotal (balance);
		if (cost > 0 && have >= 0 && have < cost) {
			Json j = Json::MakeObject ();
			j.Set ("scope", "generate");
			j.Set ("code", "insufficient_nodes");
			j.Set ("message", "");
			j.Set ("cost", cost);
			j.Set ("balance", have);
			Emit ("error", std::move (j));
			return;
		}
	}
	if (!s_.capture) { EmitError ("generate", "capture_failed", "Capture is unavailable."); return; }

	// Claim the job slot BEFORE the (slow, modal-ish) capture so a double click
	// can't start two paid generations.
	unsigned epoch = 0;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		busy = generating_;
		if (!busy) {
			generating_ = true;
			epoch = ++generateEpoch_;
		}
	}
	if (busy) { EmitError ("generate", "busy", "A generation is already running."); return; }
	{
		Json b = Json::MakeObject ();
		b.Set ("busy", true);
		Emit ("busy", std::move (b));
		Json st = Json::MakeObject ();
		st.Set ("stage", "capture");
		Emit ("status", std::move (st));
	}

	const CaptureResult cap = s_.capture->CaptureCurrent3DView ();
	if (!cap.ok) {
		{
			std::lock_guard<std::mutex> lock (mutex_);
			if (generateEpoch_ == epoch) generating_ = false;
		}
		Json b = Json::MakeObject ();
		b.Set ("busy", false);
		Emit ("busy", std::move (b));
		EmitError ("capture", cap.errorCode.empty () ? "capture_failed" : cap.errorCode, cap.errorMessage);
		return;
	}
	{
		Json c = Json::MakeObject ();
		c.Set ("width", cap.view.width);
		c.Set ("height", cap.view.height);
		c.Set ("viewName", cap.view.viewName);
		c.Set ("lowResolution", std::max (cap.view.width, cap.view.height) < kMinRecommendedSidePx);
		Emit ("capture", std::move (c));
	}
	CapturedView view = cap.view;
	Spawn ([this, epoch, options, view] { RunGenerate (epoch, options, view); });
}

void Controller::RunGenerate (unsigned epoch, GenerateOptions options, CapturedView view)
{
	const auto stale = [&] {
		std::lock_guard<std::mutex> lock (mutex_);
		return closed_ || generateEpoch_ != epoch;
	};
	const auto finish = [&] {
		{
			std::lock_guard<std::mutex> lock (mutex_);
			if (generateEpoch_ == epoch) generating_ = false;
		}
		Json b = Json::MakeObject ();
		b.Set ("busy", false);
		Emit ("busy", std::move (b));
	};
	const auto stage = [&] (const char* name) {
		Json st = Json::MakeObject ();
		st.Set ("stage", name);
		Emit ("status", std::move (st));
	};

	std::string bytes;
	const bool read = s_.shell->ReadFile (view.path, bytes);
	s_.shell->RemoveFile (view.path);
	if (!read || bytes.empty ()) {
		if (!stale ()) { EmitError ("capture", "capture_failed", "The captured image could not be read."); finish (); }
		return;
	}
	if (static_cast<long long> (bytes.size ()) > kMaxSourceBytes) {
		if (!stale ()) { EmitError ("capture", "image_too_large", "The captured image is larger than 15 MB."); finish (); }
		return;
	}

	// 1) signed upload (nothing is charged up to here)
	stage ("upload");
	std::string key, uploadUrl;
	ApiResult r = api_.SignUpload ("render-source", view.mime, static_cast<long long> (bytes.size ()), key, uploadUrl);
	if (stale ()) return;
	if (!r.ok) { EmitErrorFrom ("generate", r); finish (); return; }
	r = api_.PutBytes (uploadUrl, view.mime, bytes);
	bytes.clear ();
	bytes.shrink_to_fit ();
	if (stale ()) return;
	if (!r.ok) {
		EmitError ("generate", r.Network () ? "network" : "server", "The image upload failed. Nothing was charged.");
		finish ();
		return;
	}

	// 2) generate (this is where Nodes are charged)
	stage ("generate");
	const long long startedAt = s_.shell->NowEpoch ();
	std::string previousId;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		previousId = previousRenderId_;
	}
	const Json body = BuildGeneratePayload (options, key, view.facts, api_.Config ().clientVersion);
	r = api_.Generate (body);
	if (stale ()) return;   // cancelled: the server may still finish — it lands in the history

	Json result = Json::MakeObject ();
	bool recovered = false;
	if (r.ok && !r.data["outputUrl"].AsString ().empty ()) {
		result.Set ("renderId", r.data["renderId"]);
		result.Set ("outputUrl", r.data["outputUrl"]);
		result.Set ("previewUrl", r.data["previewUrl"]);
		result.Set ("originalUrl", r.data["originalUrl"]);
		result.Set ("nodesCharged", r.data["nodesCharged"]);
		result.Set ("totalBalance", r.data["totalBalance"]);
		result.Set ("fidelityWarning", r.data["fidelityWarning"].AsBool () || r.data["semanticWarning"].AsBool ());
		result.Set ("seed", r.data["seed"]);
	} else if (r.Network ()) {
		// The server may have finished and charged while the connection dropped:
		// look for the render created after we started.
		stage ("recover");
		const ApiResult list = api_.ListRenders ();
		if (stale ()) return;
		if (list.ok) {
			for (const Json& row : list.data["renders"].Items ()) {
				const std::string ambient = row["ambient"].AsString ();
				if (ambient == "video" || ambient == "upscale") continue;
				if (!previousId.empty () && row["id"].AsString () == previousId) continue;
				long long created = 0;
				if (!ParseIso8601 (row["created_at"].AsString (), created) || created < startedAt - 60) continue;
				if (row["output_url"].AsString ().empty ()) continue;
				result.Set ("renderId", row["id"]);
				result.Set ("outputUrl", row["output_url"]);
				result.Set ("previewUrl", row["preview_url"]);
				result.Set ("originalUrl", row["input_url"]);
				result.Set ("nodesCharged", row["nodes_charged"]);
				recovered = true;
				break;
			}
		}
		if (!recovered) {
			EmitError ("generate", "generate_lost", "The connection dropped during generation. Check the history before generating again: Nodes may have been used.");
			finish ();
			return;
		}
	} else {
		EmitErrorFrom ("generate", r);
		finish ();
		return;
	}

	result.Set ("recovered", recovered);
	result.Set ("engine", options.engine);
	result.Set ("resolution", options.resolution);
	result.Set ("viewName", view.viewName);
	result.Set ("sourceWidth", view.width);
	result.Set ("sourceHeight", view.height);
	result.Set ("createdAt", s_.shell->NowEpoch ());
	result.Set ("signedAt", s_.shell->NowEpoch ());
	{
		std::lock_guard<std::mutex> lock (mutex_);
		if (result["totalBalance"].IsNumber ()) {
			lastBalance_ = Json::MakeObject ();
			lastBalance_.Set ("totalBalance", result["totalBalance"]);
		}
		lastResult_ = result;
		previousRenderId_ = result["renderId"].AsString ();
		lastSavedPath_.clear ();
	}
	Emit ("result", result);
	finish ();
}

// ── Recover / save ───────────────────────────────────────────────────────────

void Controller::RestoreRender (const std::string& renderId)
{
	std::string id = renderId;
	if (id.empty ()) {
		std::lock_guard<std::mutex> lock (mutex_);
		id = lastResult_["renderId"].AsString ();
	}
	const ApiResult r = api_.GetRender (id);
	if (!r.ok) { EmitErrorFrom ("load", r); return; }
	Json result = Json::MakeObject ();
	result.Set ("renderId", r.data["id"]);
	result.Set ("outputUrl", r.data["outputUrl"]);
	result.Set ("previewUrl", r.data["previewUrl"]);
	result.Set ("originalUrl", r.data["inputUrl"]);
	result.Set ("nodesCharged", r.data["nodesCharged"]);
	result.Set ("signedAt", s_.shell->NowEpoch ());
	result.Set ("restored", true);
	if (r.data["outputUrl"].AsString ().empty ()) {
		EmitError ("load", "generate_failed", "This render has no image yet.");
		return;
	}
	{
		std::lock_guard<std::mutex> lock (mutex_);
		// keep context fields from the in-memory result when it is the same render
		if (lastResult_["renderId"].AsString () == r.data["id"].AsString ()) {
			for (const char* k : {"engine", "resolution", "viewName", "fidelityWarning", "seed", "totalBalance"})
				if (lastResult_.Has (k)) result.Set (k, lastResult_[k]);
		}
		lastResult_ = result;
	}
	Emit ("result", result);
}

void Controller::SaveResult ()
{
	std::string url, renderId;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		url = lastResult_["outputUrl"].AsString ();
		renderId = lastResult_["renderId"].AsString ();
	}
	if (url.empty ()) { EmitError ("save", "save_failed", "There is no result to save."); return; }

	Json st = Json::MakeObject ();
	st.Set ("stage", "save");
	Emit ("status", std::move (st));

	std::string bytes;
	const ApiResult d = api_.Download (url, bytes);
	if (!d.ok) { EmitError ("save", d.Network () ? "network" : "save_failed", "Could not download the image."); return; }
	std::string ext = SniffImageExtension (bytes);
	if (ext.empty () || bytes.size () < 32) { EmitError ("save", "save_failed", "The downloaded file is not an image."); return; }

	const std::string dir = JoinPath (s_.shell->PicturesDirectory (), "SpaceNode");
	if (!s_.shell->EnsureDirectory (dir)) { EmitError ("save", "save_failed", "Could not create the output folder."); return; }
	const std::string stamp = FormatTimestampForFile (s_.shell->NowEpoch ());
	const std::string tail = SanitizeFileComponent (renderId, 8);
	const std::string name = "spacenode-archicad-" + stamp + (tail.empty () ? "" : "-" + tail) + "." + ext;
	const std::string path = JoinPath (dir, name);
	if (!s_.shell->WriteFile (path, bytes)) { EmitError ("save", "save_failed", "Could not write the file."); return; }
	{
		std::lock_guard<std::mutex> lock (mutex_);
		lastSavedPath_ = path;
	}
	Json j = Json::MakeObject ();
	j.Set ("path", path);
	j.Set ("name", name);
	Emit ("saved", std::move (j));
}

} // namespace spacenode
