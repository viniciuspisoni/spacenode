-- Derivado de exibição do master lossless (WebP ~1600px) — ver
-- lib/storage/preview.ts. Nullable: renders antigos seguem servindo
-- output_url; a leitura (lib/history/redact.selectRenderList) tem fallback de
-- projeção pra janela entre deploy e migration.
-- Idempotente.

alter table public.renders add column if not exists preview_url text;
