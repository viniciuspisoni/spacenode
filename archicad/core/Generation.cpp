#include "Generation.hpp"

#include <algorithm>

namespace spacenode {

static bool ArrayHasString (const Json& arr, const std::string& value)
{
	for (const Json& item : arr.Items ())
		if (item.IsString () && item.AsString () == value)
			return true;
	return false;
}

GenerateOptions GenerateOptions::FromJson (const Json& j)
{
	GenerateOptions o;
	o.engine = j["engine"].AsString ();
	o.resolution = j["resolution"].AsString ();
	o.projectType = j["projectType"].AsString () == "exterior" ? "exterior" : "interior";
	o.segment = j["segment"].AsString ();
	o.environment = j["environment"].AsString ();
	o.lighting = j["lighting"].AsString ();
	o.background = j["background"].AsString ();
	for (const Json& e : j["sceneElements"].Items ())
		if (e.IsString () && !e.AsString ().empty ())
			o.sceneElements.push_back (e.AsString ());
	o.prompt = j["prompt"].AsString ();
	return o;
}

std::string CleanPrompt (const std::string& prompt)
{
	std::string out;
	out.reserve (prompt.size ());
	for (unsigned char c : prompt) {
		if (c == '\n' || c == '\t') out.push_back (' ');
		else if (c >= 0x20 || c >= 0x80) out.push_back (static_cast<char> (c));
	}
	std::size_t a = 0, b = out.size ();
	while (a < b && out[a] == ' ') ++a;
	while (b > a && out[b - 1] == ' ') --b;
	out = out.substr (a, b - a);
	if (out.size () > kMaxPromptChars) {
		std::size_t cut = kMaxPromptChars;
		while (cut > 0 && (static_cast<unsigned char> (out[cut]) & 0xC0) == 0x80) --cut;   // don't split UTF-8
		out.resize (cut);
	}
	return out;
}

static const Json& FindEngine (const Json& catalog, const std::string& engine)
{
	for (const Json& e : catalog["engines"].Items ())
		if (e["id"].AsString () == engine)
			return e;
	return catalog["__none__"];
}

int CostNodes (const Json& catalog, const std::string& engine, const std::string& resolution)
{
	const Json& e = FindEngine (catalog, engine);
	for (const Json& r : e["resolutions"].Items ())
		if (r["id"].AsString () == resolution && r["nodes"].IsNumber ())
			return static_cast<int> (r["nodes"].AsNumber ());
	return -1;
}

OptionsCheck ValidateOptions (const Json& catalog, const GenerateOptions& o)
{
	OptionsCheck bad;
	bad.ok = false;
	const Json& engine = FindEngine (catalog, o.engine);
	if (engine.IsNull ()) { bad.field = "engine"; bad.message = "Unknown engine."; return bad; }
	bool resolutionOk = false;
	for (const Json& r : engine["resolutions"].Items ())
		if (r["id"].AsString () == o.resolution) resolutionOk = true;
	if (!resolutionOk) { bad.field = "resolution"; bad.message = "Resolution not available for this engine."; return bad; }

	const Json* type = nullptr;
	for (const Json& t : catalog["projectTypes"].Items ())
		if (t["id"].AsString () == o.projectType) type = &t;
	if (!type) return OptionsCheck ();   // no taxonomy published: nothing more to check

	const Json* segment = nullptr;
	for (const Json& s : (*type)["segments"].Items ())
		if (s["name"].AsString () == o.segment) segment = &s;
	if (!segment) { bad.field = "segment"; bad.message = "Choose the project segment."; return bad; }
	if (!ArrayHasString ((*segment)["environments"], o.environment)) { bad.field = "environment"; bad.message = "Choose the space."; return bad; }
	if (!ArrayHasString ((*segment)["lighting"], o.lighting)) { bad.field = "lighting"; bad.message = "Choose the lighting."; return bad; }
	if (!o.background.empty () && (*type)["backgrounds"].IsArray () && !ArrayHasString ((*type)["backgrounds"], o.background)) {
		bad.field = "background"; bad.message = "Invalid context."; return bad;
	}
	for (const std::string& el : o.sceneElements)
		if (!ArrayHasString ((*segment)["sceneElements"], el)) { bad.field = "sceneElements"; bad.message = "Invalid scene element."; return bad; }
	return OptionsCheck ();
}

Json BuildGeneratePayload (const GenerateOptions& o, const std::string& sourceKey, const Json& modelFacts,
							const std::string& clientVersion)
{
	Json body = Json::MakeObject ();
	body.Set ("sourceKey", sourceKey);
	body.Set ("projectType", o.projectType == "exterior" ? "exterior" : "interior");
	body.Set ("segment", o.segment);
	body.Set ("environment", o.environment);
	body.Set ("lighting", o.lighting);
	body.Set ("background", o.background.empty () ? std::string ("Preservar Original") : o.background);
	Json elements = Json::MakeArray ();
	for (const std::string& e : o.sceneElements) elements.Push (e);
	body.Set ("sceneElements", std::move (elements));
	body.Set ("fidelityLevel", "maximum");   // the only level the server accepts
	body.Set ("engine", o.engine);
	body.Set ("resolution", o.resolution);
	const std::string prompt = CleanPrompt (o.prompt);
	if (!prompt.empty ()) body.Set ("refinementText", prompt);
	if (modelFacts.IsObject () && modelFacts.Size () > 0) body.Set ("modelFacts", modelFacts);
	// Origem declarada: o servidor só registra (lib/sketchup/client-info.ts).
	Json client = Json::MakeObject ();
	client.Set ("kind", "archicad");
	if (!clientVersion.empty ()) client.Set ("version", clientVersion);
	body.Set ("client", std::move (client));
	return body;
}

Json SlimCatalogForUi (const Json& catalog)
{
	Json out = Json::MakeObject ();
	out.Set ("engines", catalog["engines"].IsArray () ? catalog["engines"] : Json::MakeArray ());
	out.Set ("defaults", catalog["defaults"].IsObject () ? catalog["defaults"] : Json::MakeObject ());
	Json types = Json::MakeArray ();
	for (const Json& t : catalog["projectTypes"].Items ()) {
		Json s = Json::MakeObject ();
		s.Set ("id", t["id"]);
		s.Set ("label", t["label"]);
		s.Set ("segments", t["segments"]);
		s.Set ("backgrounds", t["backgrounds"]);
		s.Set ("backgroundLabel", t["backgroundLabel"]);
		types.Push (std::move (s));
	}
	out.Set ("projectTypes", std::move (types));
	const Json& en = catalog["i18n"]["en"];
	Json i18n = Json::MakeObject ();
	i18n.Set ("presets", en["presets"].IsObject () ? en["presets"] : Json::MakeObject ());
	i18n.Set ("ui", en["ui"].IsObject () ? en["ui"] : Json::MakeObject ());
	out.Set ("i18n", std::move (i18n));
	return out;
}

} // namespace spacenode
