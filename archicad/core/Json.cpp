#include "Json.hpp"

#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace spacenode {

static const Json& NullJson ()
{
	static const Json instance;
	return instance;
}

const Json& Json::operator[] (const std::string& key) const
{
	if (type_ == Type::Object)
		for (const Member& m : object_)
			if (m.first == key)
				return m.second;
	return NullJson ();
}

const Json& Json::operator[] (std::size_t index) const
{
	if (type_ == Type::Array && index < array_.size ())
		return array_[index];
	return NullJson ();
}

bool Json::Has (const std::string& key) const
{
	if (type_ == Type::Object)
		for (const Member& m : object_)
			if (m.first == key)
				return true;
	return false;
}

Json& Json::Set (const std::string& key, Json value)
{
	if (type_ != Type::Object) {
		*this = MakeObject ();
	}
	for (Member& m : object_) {
		if (m.first == key) {
			m.second = std::move (value);
			return *this;
		}
	}
	object_.emplace_back (key, std::move (value));
	return *this;
}

Json& Json::Push (Json value)
{
	if (type_ != Type::Array)
		*this = MakeArray ();
	array_.push_back (std::move (value));
	return *this;
}

// ── Serialization ────────────────────────────────────────────────────────────

static void EscapeTo (const std::string& s, std::string& out)
{
	out.push_back ('"');
	for (std::size_t i = 0; i < s.size (); ++i) {
		const unsigned char c = static_cast<unsigned char> (s[i]);
		switch (c) {
			case '"': out += "\\\""; break;
			case '\\': out += "\\\\"; break;
			case '\b': out += "\\b"; break;
			case '\f': out += "\\f"; break;
			case '\n': out += "\\n"; break;
			case '\r': out += "\\r"; break;
			case '\t': out += "\\t"; break;
			default:
				if (c < 0x20) {
					char buf[8];
					std::snprintf (buf, sizeof buf, "\\u%04x", c);
					out += buf;
				} else if (c == 0xE2 && i + 2 < s.size () && static_cast<unsigned char> (s[i + 1]) == 0x80 &&
						   (static_cast<unsigned char> (s[i + 2]) == 0xA8 || static_cast<unsigned char> (s[i + 2]) == 0xA9)) {
					out += static_cast<unsigned char> (s[i + 2]) == 0xA8 ? "\\u2028" : "\\u2029";
					i += 2;
				} else {
					out.push_back (static_cast<char> (c));
				}
		}
	}
	out.push_back ('"');
}

std::string JsonEscape (const std::string& s)
{
	std::string out;
	EscapeTo (s, out);
	return out;
}

void Json::DumpTo (std::string& out) const
{
	switch (type_) {
		case Type::Null: out += "null"; break;
		case Type::Bool: out += bool_ ? "true" : "false"; break;
		case Type::Number: {
			if (!std::isfinite (number_)) {
				out += "null";
			} else if (number_ == std::floor (number_) && std::fabs (number_) < 9.0e15) {
				char buf[32];
				std::snprintf (buf, sizeof buf, "%.0f", number_);
				out += buf;
			} else {
				char buf[40];
				std::snprintf (buf, sizeof buf, "%.17g", number_);
				out += buf;
			}
			break;
		}
		case Type::String: EscapeTo (string_, out); break;
		case Type::Array: {
			out.push_back ('[');
			for (std::size_t i = 0; i < array_.size (); ++i) {
				if (i) out.push_back (',');
				array_[i].DumpTo (out);
			}
			out.push_back (']');
			break;
		}
		case Type::Object: {
			out.push_back ('{');
			for (std::size_t i = 0; i < object_.size (); ++i) {
				if (i) out.push_back (',');
				EscapeTo (object_[i].first, out);
				out.push_back (':');
				object_[i].second.DumpTo (out);
			}
			out.push_back ('}');
			break;
		}
	}
}

std::string Json::Dump () const
{
	std::string out;
	DumpTo (out);
	return out;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

namespace {

class Parser {
public:
	explicit Parser (const std::string& text) : s_ (text) {}

	bool Run (Json& out, std::string& err)
	{
		SkipWs ();
		if (!ParseValue (out, 0)) { err = err_; return false; }
		SkipWs ();
		if (pos_ != s_.size ()) { err = Fail ("trailing characters"); return false; }
		return true;
	}

private:
	static constexpr int kMaxDepth = 64;

	std::string Fail (const char* msg)
	{
		err_ = std::string (msg) + " at offset " + std::to_string (pos_);
		return err_;
	}
	bool Bad (const char* msg) { Fail (msg); return false; }

	void SkipWs ()
	{
		while (pos_ < s_.size () && (s_[pos_] == ' ' || s_[pos_] == '\t' || s_[pos_] == '\n' || s_[pos_] == '\r'))
			++pos_;
	}

	bool Literal (const char* word)
	{
		std::size_t n = 0;
		while (word[n]) ++n;
		if (s_.compare (pos_, n, word) != 0) return false;
		pos_ += n;
		return true;
	}

	bool ParseValue (Json& out, int depth)
	{
		if (depth > kMaxDepth) return Bad ("nesting too deep");
		if (pos_ >= s_.size ()) return Bad ("unexpected end");
		const char c = s_[pos_];
		if (c == '{') return ParseObject (out, depth);
		if (c == '[') return ParseArray (out, depth);
		if (c == '"') {
			std::string str;
			if (!ParseString (str)) return false;
			out = Json (std::move (str));
			return true;
		}
		if (c == 't') { if (!Literal ("true")) return Bad ("bad literal"); out = Json (true); return true; }
		if (c == 'f') { if (!Literal ("false")) return Bad ("bad literal"); out = Json (false); return true; }
		if (c == 'n') { if (!Literal ("null")) return Bad ("bad literal"); out = Json (); return true; }
		return ParseNumber (out);
	}

	bool ParseNumber (Json& out)
	{
		const std::size_t start = pos_;
		if (pos_ < s_.size () && s_[pos_] == '-') ++pos_;
		bool digits = false;
		while (pos_ < s_.size () && s_[pos_] >= '0' && s_[pos_] <= '9') { ++pos_; digits = true; }
		if (pos_ < s_.size () && s_[pos_] == '.') {
			++pos_;
			while (pos_ < s_.size () && s_[pos_] >= '0' && s_[pos_] <= '9') { ++pos_; digits = true; }
		}
		if (digits && pos_ < s_.size () && (s_[pos_] == 'e' || s_[pos_] == 'E')) {
			++pos_;
			if (pos_ < s_.size () && (s_[pos_] == '+' || s_[pos_] == '-')) ++pos_;
			while (pos_ < s_.size () && s_[pos_] >= '0' && s_[pos_] <= '9') ++pos_;
		}
		if (!digits) { pos_ = start; return Bad ("unexpected character"); }
		out = Json (std::strtod (s_.substr (start, pos_ - start).c_str (), nullptr));
		return true;
	}

	static void AppendUtf8 (std::string& out, unsigned cp)
	{
		if (cp < 0x80) out.push_back (static_cast<char> (cp));
		else if (cp < 0x800) {
			out.push_back (static_cast<char> (0xC0 | (cp >> 6)));
			out.push_back (static_cast<char> (0x80 | (cp & 0x3F)));
		} else if (cp < 0x10000) {
			out.push_back (static_cast<char> (0xE0 | (cp >> 12)));
			out.push_back (static_cast<char> (0x80 | ((cp >> 6) & 0x3F)));
			out.push_back (static_cast<char> (0x80 | (cp & 0x3F)));
		} else {
			out.push_back (static_cast<char> (0xF0 | (cp >> 18)));
			out.push_back (static_cast<char> (0x80 | ((cp >> 12) & 0x3F)));
			out.push_back (static_cast<char> (0x80 | ((cp >> 6) & 0x3F)));
			out.push_back (static_cast<char> (0x80 | (cp & 0x3F)));
		}
	}

	bool Hex4 (unsigned& v)
	{
		if (pos_ + 4 > s_.size ()) return false;
		v = 0;
		for (int i = 0; i < 4; ++i) {
			const char h = s_[pos_++];
			v <<= 4;
			if (h >= '0' && h <= '9') v |= static_cast<unsigned> (h - '0');
			else if (h >= 'a' && h <= 'f') v |= static_cast<unsigned> (h - 'a' + 10);
			else if (h >= 'A' && h <= 'F') v |= static_cast<unsigned> (h - 'A' + 10);
			else return false;
		}
		return true;
	}

	bool ParseString (std::string& out)
	{
		++pos_; // opening quote
		while (pos_ < s_.size ()) {
			const char c = s_[pos_++];
			if (c == '"') return true;
			if (static_cast<unsigned char> (c) < 0x20) return Bad ("control character in string");
			if (c != '\\') { out.push_back (c); continue; }
			if (pos_ >= s_.size ()) break;
			const char e = s_[pos_++];
			switch (e) {
				case '"': out.push_back ('"'); break;
				case '\\': out.push_back ('\\'); break;
				case '/': out.push_back ('/'); break;
				case 'b': out.push_back ('\b'); break;
				case 'f': out.push_back ('\f'); break;
				case 'n': out.push_back ('\n'); break;
				case 'r': out.push_back ('\r'); break;
				case 't': out.push_back ('\t'); break;
				case 'u': {
					unsigned cp = 0;
					if (!Hex4 (cp)) return Bad ("bad \\u escape");
					if (cp >= 0xD800 && cp <= 0xDBFF) {
						unsigned lo = 0;
						if (pos_ + 1 < s_.size () && s_[pos_] == '\\' && s_[pos_ + 1] == 'u') {
							pos_ += 2;
							if (!Hex4 (lo) || lo < 0xDC00 || lo > 0xDFFF) return Bad ("bad surrogate pair");
							cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
						} else {
							return Bad ("lone surrogate");
						}
					} else if (cp >= 0xDC00 && cp <= 0xDFFF) {
						return Bad ("lone surrogate");
					}
					AppendUtf8 (out, cp);
					break;
				}
				default: return Bad ("bad escape");
			}
		}
		return Bad ("unterminated string");
	}

	bool ParseArray (Json& out, int depth)
	{
		++pos_;
		out = Json::MakeArray ();
		SkipWs ();
		if (pos_ < s_.size () && s_[pos_] == ']') { ++pos_; return true; }
		while (true) {
			SkipWs ();
			Json item;
			if (!ParseValue (item, depth + 1)) return false;
			out.Push (std::move (item));
			SkipWs ();
			if (pos_ >= s_.size ()) return Bad ("unterminated array");
			if (s_[pos_] == ',') { ++pos_; continue; }
			if (s_[pos_] == ']') { ++pos_; return true; }
			return Bad ("expected , or ]");
		}
	}

	bool ParseObject (Json& out, int depth)
	{
		++pos_;
		out = Json::MakeObject ();
		SkipWs ();
		if (pos_ < s_.size () && s_[pos_] == '}') { ++pos_; return true; }
		while (true) {
			SkipWs ();
			if (pos_ >= s_.size () || s_[pos_] != '"') return Bad ("expected string key");
			std::string key;
			if (!ParseString (key)) return false;
			SkipWs ();
			if (pos_ >= s_.size () || s_[pos_] != ':') return Bad ("expected :");
			++pos_;
			SkipWs ();
			Json value;
			if (!ParseValue (value, depth + 1)) return false;
			out.Set (key, std::move (value));
			SkipWs ();
			if (pos_ >= s_.size ()) return Bad ("unterminated object");
			if (s_[pos_] == ',') { ++pos_; continue; }
			if (s_[pos_] == '}') { ++pos_; return true; }
			return Bad ("expected , or }");
		}
	}

	const std::string& s_;
	std::size_t pos_ = 0;
	std::string err_;
};

} // namespace

Json Json::Parse (const std::string& text, std::string* err)
{
	Json out;
	std::string message;
	Parser parser (text);
	if (!parser.Run (out, message)) {
		if (err) *err = message;
		return Json ();
	}
	return out;
}

} // namespace spacenode
