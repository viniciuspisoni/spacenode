// Minimal JSON value + parser + serializer (UTF-8, no external dependency).
// Objects keep insertion order. Numbers are doubles. Dump() always escapes
// U+2028/U+2029 so the output is safe to embed in JavaScript source.
#pragma once

#include <cstddef>
#include <string>
#include <utility>
#include <vector>

namespace spacenode {

class Json {
public:
	enum class Type { Null, Bool, Number, String, Array, Object };
	using Array = std::vector<Json>;
	using Member = std::pair<std::string, Json>;
	using Object = std::vector<Member>;

	Json () = default;
	Json (std::nullptr_t) {}
	Json (bool v) : type_ (Type::Bool), bool_ (v) {}
	Json (int v) : type_ (Type::Number), number_ (v) {}
	Json (long v) : type_ (Type::Number), number_ (static_cast<double> (v)) {}
	Json (long long v) : type_ (Type::Number), number_ (static_cast<double> (v)) {}
	Json (double v) : type_ (Type::Number), number_ (v) {}
	Json (const char* v) : type_ (Type::String), string_ (v ? v : "") {}
	Json (std::string v) : type_ (Type::String), string_ (std::move (v)) {}

	static Json MakeArray () { Json j; j.type_ = Type::Array; return j; }
	static Json MakeObject () { Json j; j.type_ = Type::Object; return j; }

	Type GetType () const { return type_; }
	bool IsNull () const { return type_ == Type::Null; }
	bool IsBool () const { return type_ == Type::Bool; }
	bool IsNumber () const { return type_ == Type::Number; }
	bool IsString () const { return type_ == Type::String; }
	bool IsArray () const { return type_ == Type::Array; }
	bool IsObject () const { return type_ == Type::Object; }

	// Lenient accessors: wrong type -> the supplied default.
	std::string AsString (const std::string& def = std::string ()) const { return IsString () ? string_ : def; }
	double AsNumber (double def = 0) const { return IsNumber () ? number_ : def; }
	bool AsBool (bool def = false) const { return IsBool () ? bool_ : def; }

	const Array& Items () const { return array_; }
	const Object& Members () const { return object_; }
	std::size_t Size () const { return IsArray () ? array_.size () : (IsObject () ? object_.size () : 0); }

	// Object lookup; returns a shared null Json when absent / not an object.
	const Json& operator[] (const std::string& key) const;
	const Json& operator[] (std::size_t index) const;
	bool Has (const std::string& key) const;

	// Mutators (object: set replaces, array: push).
	Json& Set (const std::string& key, Json value);
	Json& Push (Json value);

	std::string Dump () const;

	// On failure returns Null and, when err != nullptr, a short message.
	static Json Parse (const std::string& text, std::string* err = nullptr);

private:
	void DumpTo (std::string& out) const;

	Type type_ = Type::Null;
	bool bool_ = false;
	double number_ = 0;
	std::string string_;
	Array array_;
	Object object_;
};

std::string JsonEscape (const std::string& s); // quoted string literal

} // namespace spacenode
