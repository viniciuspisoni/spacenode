-- ─────────────────────────────────────────────────────────────
-- Pastas leves do Histórico (independentes de Spaces)
-- NOTE: This schema was already applied to production via MCP on 2026-05-08.
-- All statements use IF NOT EXISTS / DROP POLICY IF EXISTS for idempotency.
-- DO NOT run `supabase db push` — changes are live. Committed for version
-- control and future environment provisioning only.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS render_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_render_folders_user_id ON render_folders(user_id);

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS folder_id uuid
    REFERENCES render_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_renders_folder ON renders(folder_id);

-- RLS
ALTER TABLE render_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "render_folders_select_own" ON render_folders;
CREATE POLICY "render_folders_select_own"
  ON render_folders FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "render_folders_insert_own" ON render_folders;
CREATE POLICY "render_folders_insert_own"
  ON render_folders FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "render_folders_update_own" ON render_folders;
CREATE POLICY "render_folders_update_own"
  ON render_folders FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "render_folders_delete_own" ON render_folders;
CREATE POLICY "render_folders_delete_own"
  ON render_folders FOR DELETE USING (auth.uid() = user_id);
