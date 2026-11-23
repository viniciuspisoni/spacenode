// File + clock primitives shared by the OS shells (portable C++17/20).
#pragma once

#include <chrono>
#include <filesystem>
#include <fstream>
#include <string>
#include <system_error>

#include "../core/Platform.hpp"

namespace spacenode {

inline std::filesystem::path PathFromUtf8 (const std::string& s)
{
	return std::filesystem::path (std::u8string (s.begin (), s.end ()));
}

inline std::string Utf8FromPath (const std::filesystem::path& p)
{
	const std::u8string u = p.u8string ();
	return std::string (u.begin (), u.end ());
}

class FileShellBase : public IShell {
public:
	bool EnsureDirectory (const std::string& path) override
	{
		std::error_code ec;
		std::filesystem::create_directories (PathFromUtf8 (path), ec);
		return !ec && std::filesystem::is_directory (PathFromUtf8 (path), ec);
	}

	bool WriteFile (const std::string& path, const std::string& bytes) override
	{
		std::ofstream out (PathFromUtf8 (path), std::ios::binary | std::ios::trunc);
		if (!out) return false;
		out.write (bytes.data (), static_cast<std::streamsize> (bytes.size ()));
		out.flush ();
		return static_cast<bool> (out);
	}

	bool ReadFile (const std::string& path, std::string& bytes) override
	{
		std::ifstream in (PathFromUtf8 (path), std::ios::binary | std::ios::ate);
		if (!in) return false;
		const std::streamoff size = in.tellg ();
		if (size < 0 || size > 64LL * 1024 * 1024) return false;
		bytes.resize (static_cast<std::size_t> (size));
		in.seekg (0);
		in.read (bytes.data (), size);
		return static_cast<bool> (in);
	}

	void RemoveFile (const std::string& path) override
	{
		std::error_code ec;
		std::filesystem::remove (PathFromUtf8 (path), ec);
	}

	long long NowEpoch () override
	{
		return std::chrono::duration_cast<std::chrono::seconds> (std::chrono::system_clock::now ().time_since_epoch ()).count ();
	}
};

} // namespace spacenode
