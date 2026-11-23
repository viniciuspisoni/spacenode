#pragma once

#include <string>

namespace spacenode {

// "https://host[:port]" — https required, http only for loopback. Empty +
// err on failure. Strips path/query/fragment and default ports.
std::string NormalizeBaseUrl (const std::string& value, std::string* err = nullptr);

// Only https (or http to loopback) URLs may be opened / downloaded.
bool IsSafeUrl (const std::string& url);
bool SameHost (const std::string& a, const std::string& b);
std::string UrlEncode (const std::string& s);
bool IsUuid (const std::string& s);

// PNG IHDR / JPEG SOF. false when unknown.
bool ImageDimensions (const std::string& bytes, int& width, int& height);
// "png" | "jpg" | "webp" | "" by magic number.
std::string SniffImageExtension (const std::string& bytes);

// 2026-10-06T12:34:56(.123)(Z|+hh:mm) -> epoch seconds; false on failure.
bool ParseIso8601 (const std::string& text, long long& epoch);

std::string FormatTimestampForFile (long long epoch); // YYYYMMDD-HHMMSS (UTC)
std::string SanitizeFileComponent (const std::string& s, std::size_t maxLen = 40);
std::string JoinPath (const std::string& dir, const std::string& name);

// Redacts bearer tokens / secrets from text destined for logs or the UI.
std::string RedactSecrets (const std::string& text);

} // namespace spacenode
