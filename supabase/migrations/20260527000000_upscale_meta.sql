-- ─────────────────────────────────────────────────────────────
-- Ampliar v2 — upscale_meta jsonb em renders
--
-- Estende renders com metadata rico do módulo Ampliar (abas
-- Resolução/Aprimorar). O fluxo legado guarda só ambient='upscale',
-- style=modelId, lighting=scale. Isso preserva o histórico
-- estruturado e permite admin/debug, telemetria e UI de detalhes.
--
-- Shape esperado (validado em código, não no banco — jsonb livre
-- para evoluir sem migration):
--
--   {
--     "tab":           "resolution" | "enhance",
--     "mode_id":       "fidelity" | "recover" | "denoise" | "deblur" | "restore" | "smart",
--     "objective_id":  string | null,
--     "scale":         "none" | "2x" | "4x" | "8x" | "ultra",
--     "steps": [
--       {
--         "provider":     "topaz" | "clarity" | "nafnet-denoise" | "nafnet-deblur" | "photo-restoration",
--         "endpoint":     string,
--         "params":       object,
--         "request_id":   string | null,
--         "duration_ms":  integer,
--         "status":       "completed" | "failed",
--         "error":        string | null,
--         "fallback_of":  string | null
--       }
--     ],
--     "input_dimensions":  { "width": int, "height": int } | null,
--     "output_dimensions": { "width": int, "height": int } | null,
--     "total_duration_ms": integer
--   }
-- ─────────────────────────────────────────────────────────────

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS upscale_meta jsonb;

-- Índice GIN só nas linhas que realmente têm metadata — mantém
-- baixo o custo para o uso geral (renders normais não preenchem).
CREATE INDEX IF NOT EXISTS idx_renders_upscale_meta
  ON renders USING gin (upscale_meta)
  WHERE upscale_meta IS NOT NULL;
