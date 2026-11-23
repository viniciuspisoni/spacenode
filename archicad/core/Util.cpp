#include "Util.hpp"

#include <cctype>
#include <cstdio>
#include <cstdlib>

namespace spacenode {

static std::string Lower (std::string s)
{
	for (char& c : s) c = static_cast<char> (std::tolower (static_cast<unsigned char> (c)));
	return s;
}

namespace {
struct ParsedUrl {
	std::string scheme, host, port, rest;
	bool ok = false;
};

ParsedUrl ParseUrl (const std::string& raw)
{
	ParsedUrl u;
	std::string s = raw;
	const std::size_t schemeEnd = s.find ("://");
	if (schemeEnd == std::string::npos) return u;
	u.scheme = Lower (s.substr (0, schemeEnd));
	s = s.substr (schemeEnd + 3);
	const std::size_t pathStart = s.find_first_of ("/?#");
	std::string authority = pathStart == std::string::npos ? s : s.substr (0, pathStart);
	u.rest = pathStart == std::string::npos ? std::string () : s.substr (pathStart);
	if (authority.find ('@') != std::string::npos) return u; // userinfo: reject
	if (!authority.empty () && authority[0] == '[') {
		const std::size_t close = authority.find (']');
		if (close == std::string::npos) return u;
		u.host = Lower (authority.substr (0, close + 1));
		if (close + 1 < authority.size ()) {
			if (authority[close + 1] != ':') return u;
			u.port = authority.substr (close + 2);
		}
	} else {
		const std::size_t colon = authority.rfind (':');
		if (colon == std::string::npos) u.host = Lower (authority);
		else { u.host = Lower (authority.substr (0, colon)); u.port = authority.substr (colon + 1); }
	}
	for (char c : u.port) if (!std::isdigit (static_cast<unsigned char> (c))) return u;
	if (u.host.empty ()) return u;
	u.ok = (u.scheme == "http" || u.scheme == "https");
	return u;
}

bool IsLoopback (const std::string& host)
{
	return host == "localhost" || host == "127.0.0.1" || host == "[::1]";
}
} // namespace

std::string NormalizeBaseUrl (const std::string& value, std::string* err)
{
	std::string raw = value;
	while (!raw.empty () && std::isspace (static_cast<unsigned char> (raw.front ()))) raw.erase (raw.begin ());
	while (!raw.empty () && std::isspace (static_cast<unsigned char> (raw.back ()))) raw.pop_back ();
	const ParsedUrl u = ParseUrl (raw);
	if (!u.ok) {
		if (err) *err = "API URL must start with http:// or https:// and have a valid host.";
		return std::string ();
	}
	if (u.scheme == "http" && !IsLoopback (u.host)) {
		if (err) *err = "Only HTTPS is accepted (HTTP only on localhost).";
		return std::string ();
	}
	const bool defaultPort = u.port.empty () || (u.scheme == "https" && u.port == "443") || (u.scheme == "http" && u.port == "80");
	return u.scheme + "://" + u.host + (defaultPort ? "" : ":" + u.port);
}

bool IsSafeUrl (const std::string& url)
{
	const ParsedUrl u = ParseUrl (url);
	if (!u.ok) return false;
	if (u.scheme == "https") return true;
	return IsLoopback (u.host);
}

bool SameHost (const std::string& a, const std::string& b)
{
	const ParsedUrl ua = ParseUrl (a), ub = ParseUrl (b);
	return ua.ok && ub.ok && ua.host == ub.host && ua.scheme == ub.scheme && ua.port == ub.port;
}

std::string UrlEncode (const std::string& s)
{
	static const char* hex = "0123456789ABCDEF";
	std::string out;
	for (unsigned char c : s) {
		if (std::isalnum (c) || c == '-' || c == '_' || c == '.' || c == '~') out.push_back (static_cast<char> (c));
		else { out.push_back ('%'); out.push_back (hex[c >> 4]); out.push_back (hex[c & 15]); }
	}
	return out;
}

bool IsUuid (const std::string& s)
{
	if (s.size () != 36) return false;
	for (std::size_t i = 0; i < s.size (); ++i) {
		const char c = s[i];
		if (i == 8 || i == 13 || i == 18 || i == 23) { if (c != '-') return false; }
		else if (!std::isxdigit (static_cast<unsigned char> (c))) return false;
	}
	return true;
}

bool ImageDimensions (const std::string& b, int& width, int& height)
{
	const auto u8 = [&b] (std::size_t i) { return static_cast<unsigned> (static_cast<unsigned char> (b[i])); };
	if (b.size () >= 24 && u8 (0) == 0x89 && b.compare (1, 3, "PNG") == 0) {
		const unsigned w = (u8 (16) << 24) | (u8 (17) << 16) | (u8 (18) << 8) | u8 (19);
		const unsigned h = (u8 (20) << 24) | (u8 (21) << 16) | (u8 (22) << 8) | u8 (23);
		if (w == 0 || h == 0 || w > 100000 || h > 100000) return false;
		width = static_cast<int> (w); height = static_cast<int> (h);
		return true;
	}
	if (b.size () >= 4 && u8 (0) == 0xFF && u8 (1) == 0xD8) {
		std::size_t i = 2;
		while (i + 9 < b.size ()) {
			if (u8 (i) != 0xFF) { ++i; continue; }
			const unsigned marker = u8 (i + 1);
			if (marker == 0xFF) { ++i; continue; }
			if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
			const std::size_t segLen = (u8 (i + 2) << 8) | u8 (i + 3);
			if (marker == 0xC0 || marker == 0xC1 || marker == 0xC2 || marker == 0xC3 || marker == 0xC5 || marker == 0xC6 ||
				marker == 0xC7 || marker == 0xC9 || marker == 0xCA || marker == 0xCB || marker == 0xCD || marker == 0xCE || marker == 0xCF) {
				const unsigned h = (u8 (i + 5) << 8) | u8 (i + 6);
				const unsigned w = (u8 (i + 7) << 8) | u8 (i + 8);
				if (w == 0 || h == 0) return false;
				width = static_cast<int> (w); height = static_cast<int> (h);
				return true;
			}
			if (segLen < 2) return false;
			i += 2 + segLen;
		}
	}
	return false;
}

std::string SniffImageExtension (const std::string& b)
{
	if (b.size () >= 8 && static_cast<unsigned char> (b[0]) == 0x89 && b.compare (1, 3, "PNG") == 0) return "png";
	if (b.size () >= 3 && static_cast<unsigned char> (b[0]) == 0xFF && static_cast<unsigned char> (b[1]) == 0xD8) return "jpg";
	if (b.size () >= 12 && b.compare (0, 4, "RIFF") == 0 && b.compare (8, 4, "WEBP") == 0) return "webp";
	return std::string ();
}

static long long DaysFromCivil (long long y, unsigned m, unsigned d)
{
	y -= m <= 2;
	const long long era = (y >= 0 ? y : y - 399) / 400;
	const unsigned yoe = static_cast<unsigned> (y - era * 400);
	const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
	const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
	return era * 146097 + static_cast<long long> (doe) - 719468;
}

bool ParseIso8601 (const std::string& t, long long& epoch)
{
	int Y, M, D, h, m;
	double sec = 0;
	int consumed = 0;
	if (std::sscanf (t.c_str (), "%4d-%2d-%2dT%2d:%2d%n", &Y, &M, &D, &h, &m, &consumed) != 5) return false;
	std::size_t pos = static_cast<std::size_t> (consumed);
	if (pos < t.size () && t[pos] == ':') {
		char* end = nullptr;
		sec = std::strtod (t.c_str () + pos + 1, &end);
		pos = static_cast<std::size_t> (end - t.c_str ());
	}
	if (M < 1 || M > 12 || D < 1 || D > 31 || h < 0 || h > 23 || m < 0 || m > 59 || sec < 0 || sec >= 61) return false;
	long long offset = 0;
	if (pos < t.size ()) {
		const char z = t[pos];
		if (z == 'Z' || z == 'z') {
			// UTC
		} else if (z == '+' || z == '-') {
			int oh = 0, om = 0;
			if (std::sscanf (t.c_str () + pos + 1, "%2d:%2d", &oh, &om) < 1) return false;
			offset = (oh * 3600 + om * 60) * (z == '+' ? 1 : -1);
		} else {
			return false;
		}
	}
	epoch = DaysFromCivil (Y, static_cast<unsigned> (M), static_cast<unsigned> (D)) * 86400 + h * 3600 + m * 60 + static_cast<long long> (sec) - offset;
	return true;
}

std::string FormatTimestampForFile (long long epoch)
{
	long long days = epoch / 86400;
	long long rem = epoch % 86400;
	if (rem < 0) { rem += 86400; --days; }
	// civil_from_days
	days += 719468;
	const long long era = (days >= 0 ? days : days - 146096) / 146097;
	const unsigned doe = static_cast<unsigned> (days - era * 146097);
	const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
	const long long y = static_cast<long long> (yoe) + era * 400;
	const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
	const unsigned mp = (5 * doy + 2) / 153;
	const unsigned d = doy - (153 * mp + 2) / 5 + 1;
	const unsigned m = mp < 10 ? mp + 3 : mp - 9;
	char buf[32];
	std::snprintf (buf, sizeof buf, "%04lld%02u%02u-%02lld%02lld%02lld", y + (m <= 2), m, d, rem / 3600, (rem % 3600) / 60, rem % 60);
	return buf;
}

std::string SanitizeFileComponent (const std::string& s, std::size_t maxLen)
{
	std::string out;
	for (unsigned char c : s) {
		if (std::isalnum (c) || c == '-' || c == '_') out.push_back (static_cast<char> (c));
		else if (!out.empty () && out.back () != '-') out.push_back ('-');
		if (out.size () >= maxLen) break;
	}
	while (!out.empty () && out.back () == '-') out.pop_back ();
	return out;
}

std::string JoinPath (const std::string& dir, const std::string& name)
{
	if (dir.empty ()) return name;
	const char last = dir.back ();
	if (last == '/' || last == '\\') return dir + name;
#ifdef _WIN32
	return dir + "\\" + name;
#else
	return dir + "/" + name;
#endif
}

std::string RedactSecrets (const std::string& text)
{
	std::string out = text;
	const char* markers[] = {"Bearer ", "token=", "\"accessToken\":\"", "\"deviceSecret\":\"", "\"refreshToken\":\""};
	for (const char* marker : markers) {
		std::size_t pos = 0;
		const std::string m (marker);
		while ((pos = out.find (m, pos)) != std::string::npos) {
			const std::size_t start = pos + m.size ();
			std::size_t end = start;
			while (end < out.size () && out[end] != '"' && out[end] != '&' && out[end] != ' ' && out[end] != '\n' && out[end] != '\r') ++end;
			if (end > start) out.replace (start, end - start, "[redacted]");
			pos = start + 10;
		}
	}
	return out;
}

} // namespace spacenode
