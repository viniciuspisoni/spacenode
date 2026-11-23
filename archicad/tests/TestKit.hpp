// Tiny test harness (no external dependency).
#pragma once

#include <atomic>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

namespace tk {

struct Case { const char* name; std::function<void ()> fn; };
inline std::vector<Case>& Registry () { static std::vector<Case> r; return r; }
inline std::atomic<int>& Failures () { static std::atomic<int> f{0}; return f; }   // CHECKs also run on server-handler threads
inline std::atomic<int>& Checks () { static std::atomic<int> c{0}; return c; }

struct Registrar { Registrar (const char* n, std::function<void ()> f) { Registry ().push_back ({n, std::move (f)}); } };

inline int RunAll (const char* filter = nullptr)
{
	int ran = 0;
	for (const Case& c : Registry ()) {
		if (filter && std::string (c.name).find (filter) == std::string::npos) continue;
		const int before = Failures ().load ();
		std::printf ("[ RUN  ] %s\n", c.name);
		std::fflush (stdout);
		c.fn ();
		std::printf ("[ %s ] %s\n", Failures ().load () == before ? " OK " : "FAIL", c.name);
		++ran;
	}
	std::printf ("\n%d tests, %d checks, %d failures\n", ran, Checks ().load (), Failures ().load ());
	return Failures ().load () == 0 ? 0 : 1;
}

} // namespace tk

#define TEST(name) \
	static void name (); \
	static tk::Registrar reg_##name (#name, name); \
	static void name ()

#define CHECK(cond) do { ++tk::Checks (); if (!(cond)) { ++tk::Failures (); std::printf ("  CHECK failed %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { ++tk::Checks (); const auto va_ = (a); const auto vb_ = (b); if (!(va_ == vb_)) { ++tk::Failures (); std::printf ("  CHECK_EQ failed %s:%d: %s == %s\n", __FILE__, __LINE__, #a, #b); } } while (0)
