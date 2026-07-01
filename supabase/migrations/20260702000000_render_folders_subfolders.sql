-- ─────────────────────────────────────────────────────────────
-- Subpastas do Histórico (1 nível): pasta do cliente > subpasta de projeto.
-- NOTE: Already applied to production via MCP on 2026-07-02 (idempotent —
-- IF NOT EXISTS / DROP ... IF EXISTS everywhere). Committed for version
-- control and future environment provisioning only.
--
-- Hierarquia limitada a 2 níveis (pasta > subpasta) — uma subpasta nunca
-- pode ter parent_id apontando pra outra subpasta. Isso é validado em
-- /api/folders (POST), não em constraint de banco: checar profundidade
-- exigiria um trigger recursivo, desproporcional pro limite de 2 níveis.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE render_folders
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES render_folders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_render_folders_parent_id ON render_folders(parent_id);

-- Evita uma pasta ser pai de si mesma.
ALTER TABLE render_folders
  DROP CONSTRAINT IF EXISTS render_folders_no_self_parent;
ALTER TABLE render_folders
  ADD CONSTRAINT render_folders_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id);
