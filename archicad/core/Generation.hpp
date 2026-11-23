// Catalog access + generation payload construction (pure, no I/O).
#pragma once

#include <string>
#include <vector>

#include "Json.hpp"

namespace spacenode {

struct GenerateOptions {
	std::string engine;
	std::string resolution;
	std::string projectType = "interior";
	std::string segment;
	std::string environment;
	std::string lighting;
	std::string background;                 // empty -> "Preservar Original"
	std::vector<std::string> sceneElements;
	std::string prompt;                     // free-form refinement
	static GenerateOptions FromJson (const Json& j);
};

struct OptionsCheck {
	bool ok = true;
	std::string field;     // first offending field
	std::string message;
};

constexpr std::size_t kMaxPromptChars = 1200;
constexpr long long kMaxSourceBytes = 15LL * 1024 * 1024;     // 'render-source' upload area
constexpr int kMinRecommendedSidePx = 1024;

// Cost in Nodes for engine/resolution, or -1 when the catalog doesn't say.
int CostNodes (const Json& catalog, const std::string& engine, const std::string& resolution);

// Validates against the catalog taxonomy. Lenient when the catalog does not
// carry a taxonomy (older/partial backend): then only engine+resolution rules.
OptionsCheck ValidateOptions (const Json& catalog, const GenerateOptions& options);

// POST /api/generate body.
Json BuildGeneratePayload (const GenerateOptions& options, const std::string& sourceKey, const Json& modelFacts,
							const std::string& clientVersion = std::string ());

// Only what the panel needs (engines, defaults, taxonomy, en labels).
Json SlimCatalogForUi (const Json& catalog);

// Maps a possibly-oversized prompt/strings into safe values (trim, cap).
std::string CleanPrompt (const std::string& prompt);

} // namespace spacenode
