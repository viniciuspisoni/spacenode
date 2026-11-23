// macOS backends: NSURLSession transport, Keychain credential store, shell.
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#if !defined(SPACENODE_NO_APPKIT)
#import <AppKit/AppKit.h>
#endif

#include <unistd.h>

#include <atomic>
#include <mutex>

#include "../CommonShell.hpp"
#include "../PlatformFactory.hpp"

// Redirect policy: never replay credentials. A request that carries an
// Authorization header must not follow redirects at all; anonymous requests
// (signed-URL transfers) may only be redirected to https.
@interface SNRedirectGuard : NSObject <NSURLSessionTaskDelegate>
@end

@implementation SNRedirectGuard
- (void)URLSession:(NSURLSession*)session
				  task:(NSURLSessionTask*)task
willPerformHTTPRedirection:(NSHTTPURLResponse*)response
			newRequest:(NSURLRequest*)request
	 completionHandler:(void (^)(NSURLRequest*))completionHandler
{
	if ([task.originalRequest valueForHTTPHeaderField:@"Authorization"] != nil) {
		completionHandler (nil);
		return;
	}
	NSString* scheme = request.URL.scheme.lowercaseString;
	completionHandler ([scheme isEqualToString:@"https"] ? request : nil);
}
@end

namespace spacenode {

// ── HTTP ─────────────────────────────────────────────────────────────────────


namespace {

class MacHttpClient final : public IHttpClient {
public:
	MacHttpClient ()
	{
		NSURLSessionConfiguration* cfg = [NSURLSessionConfiguration ephemeralSessionConfiguration];
		cfg.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
		cfg.HTTPShouldSetCookies = NO;
		cfg.HTTPCookieAcceptPolicy = NSHTTPCookieAcceptPolicyNever;
		cfg.URLCredentialStorage = nil;
		cfg.waitsForConnectivity = NO;
		guard_ = [[SNRedirectGuard alloc] init];
		session_ = [NSURLSession sessionWithConfiguration:cfg delegate:guard_ delegateQueue:nil];
	}

	~MacHttpClient () override { CancelAll (); }

	HttpResponse Send (const HttpRequest& request) override
	{
		HttpResponse out;
		@autoreleasepool {
			if (cancelled_) { out.error = "cancelled"; return out; }
			NSURL* url = [NSURL URLWithString:[NSString stringWithUTF8String:request.url.c_str ()]];
			if (!url) { out.error = "invalid url"; return out; }
			NSMutableURLRequest* req = [NSMutableURLRequest requestWithURL:url];
			req.HTTPMethod = [NSString stringWithUTF8String:request.method.c_str ()];
			req.timeoutInterval = request.timeoutSeconds > 0 ? request.timeoutSeconds : 30;
			for (const auto& h : request.headers)
				[req setValue:[NSString stringWithUTF8String:h.second.c_str ()] forHTTPHeaderField:[NSString stringWithUTF8String:h.first.c_str ()]];
			if (!request.body.empty ())
				req.HTTPBody = [NSData dataWithBytes:request.body.data () length:request.body.size ()];

			dispatch_semaphore_t done = dispatch_semaphore_create (0);
			__block NSData* data = nil;
			__block NSHTTPURLResponse* http = nil;
			__block NSError* err = nil;
			NSURLSessionDataTask* task = [session_ dataTaskWithRequest:req
													  completionHandler:^(NSData* d, NSURLResponse* r, NSError* e) {
				data = d;
				http = [r isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse*) r : nil;
				err = e;
				dispatch_semaphore_signal (done);
			}];
			[task resume];
			dispatch_semaphore_wait (done, DISPATCH_TIME_FOREVER);

			if (http) {
				out.status = static_cast<int> (http.statusCode);
				if (data) out.body.assign (static_cast<const char*> (data.bytes), data.length);
			} else {
				out.status = 0;
				out.error = err ? std::string (err.localizedDescription.UTF8String ?: "network error") : "network error";
			}
		}
		return out;
	}

	void CancelAll () override
	{
		cancelled_ = true;
		if (session_) [session_ invalidateAndCancel];
	}

private:
	NSURLSession* session_ = nil;
	SNRedirectGuard* guard_ = nil;
	std::atomic<bool> cancelled_{false};
};

// ── Keychain ─────────────────────────────────────────────────────────────────

class KeychainStore final : public ICredentialStore {
public:
	explicit KeychainStore (std::string account) : account_ (std::move (account)) {}

	bool Load (DeviceCredentials& out) override
	{
		@autoreleasepool {
			NSMutableDictionary* q = Query ();
			q[(__bridge id) kSecReturnData] = @YES;
			q[(__bridge id) kSecMatchLimit] = (__bridge id) kSecMatchLimitOne;
			CFTypeRef result = nullptr;
			if (SecItemCopyMatching ((__bridge CFDictionaryRef) q, &result) != errSecSuccess || !result) return false;
			NSData* data = (__bridge_transfer NSData*) result;
			const std::string json (static_cast<const char*> (data.bytes), data.length);
			const Json j = Json::Parse (json);
			out.deviceId = j["deviceId"].AsString ();
			out.deviceSecret = j["deviceSecret"].AsString ();
			return out.Valid ();
		}
	}

	bool Save (const DeviceCredentials& creds) override
	{
		@autoreleasepool {
			Json j = Json::MakeObject ();
			j.Set ("deviceId", creds.deviceId);
			j.Set ("deviceSecret", creds.deviceSecret);
			const std::string json = j.Dump ();
			NSData* data = [NSData dataWithBytes:json.data () length:json.size ()];
			NSMutableDictionary* attrs = [NSMutableDictionary dictionary];
			attrs[(__bridge id) kSecValueData] = data;
			attrs[(__bridge id) kSecAttrAccessible] = (__bridge id) kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
			OSStatus st = SecItemUpdate ((__bridge CFDictionaryRef) Query (), (__bridge CFDictionaryRef) attrs);
			if (st == errSecItemNotFound) {
				NSMutableDictionary* add = Query ();
				[add addEntriesFromDictionary:attrs];
				st = SecItemAdd ((__bridge CFDictionaryRef) add, nullptr);
			}
			return st == errSecSuccess;
		}
	}

	void Clear () override
	{
		@autoreleasepool { SecItemDelete ((__bridge CFDictionaryRef) Query ()); }
	}

private:
	NSMutableDictionary* Query () const
	{
		NSMutableDictionary* q = [NSMutableDictionary dictionary];
		q[(__bridge id) kSecClass] = (__bridge id) kSecClassGenericPassword;
		q[(__bridge id) kSecAttrService] = @"app.spacenode.archicad";
		q[(__bridge id) kSecAttrAccount] = [NSString stringWithUTF8String:account_.c_str ()];
		return q;
	}
	std::string account_;
};

// ── Shell ────────────────────────────────────────────────────────────────────

class MacShell final : public FileShellBase {
public:
	bool OpenUrl (const std::string& url) override
	{
		NSString* s = [NSString stringWithUTF8String:url.c_str ()];
		NSURL* u = [NSURL URLWithString:s];
		if (!u) return false;
#if !defined(SPACENODE_NO_APPKIT)
		dispatch_async (dispatch_get_main_queue (), ^{ [[NSWorkspace sharedWorkspace] openURL:u]; });
		return true;
#else
		return false;
#endif
	}

	bool RevealFile (const std::string& path) override
	{
		NSURL* u = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path.c_str ()]];
#if !defined(SPACENODE_NO_APPKIT)
		dispatch_async (dispatch_get_main_queue (), ^{ [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[u]]; });
		return true;
#else
		(void) u;
		return false;
#endif
	}

	std::string PicturesDirectory () override { return Dir (NSPicturesDirectory, NSUserDomainMask); }
	std::string ConfigDirectory () override { return Dir (NSApplicationSupportDirectory, NSUserDomainMask); }
	std::string TempDirectory () override { @autoreleasepool { return std::string (NSTemporaryDirectory ().UTF8String); } }

	std::string MachineName () override
	{
		char buf[256] = {0};
		if (gethostname (buf, sizeof buf - 1) != 0) return "Mac";
		std::string name (buf);
		const std::size_t dot = name.find ('.');
		if (dot != std::string::npos) name.resize (dot);
		return name.empty () ? std::string ("Mac") : name;
	}

private:
	static std::string Dir (NSSearchPathDirectory dir, NSSearchPathDomainMask mask)
	{
		@autoreleasepool {
			NSArray* paths = NSSearchPathForDirectoriesInDomains (dir, mask, YES);
			return paths.count ? std::string ([paths[0] UTF8String]) : std::string (NSHomeDirectory ().UTF8String);
		}
	}
};

} // namespace

std::shared_ptr<IHttpClient> CreateHttpClient () { return std::make_shared<MacHttpClient> (); }
std::shared_ptr<ICredentialStore> CreateCredentialStore (const std::string& baseUrl) { return std::make_shared<KeychainStore> (baseUrl); }
std::shared_ptr<IShell> CreateShell () { return std::make_shared<MacShell> (); }

} // namespace spacenode
