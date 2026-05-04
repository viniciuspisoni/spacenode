-- ─────────────────────────────────────────────────────────────
-- SPACES v2 — Schema Migration
-- NOTE: This schema was already applied to production on 2026-05-03.
-- All statements use IF NOT EXISTS / CREATE OR REPLACE for idempotency.
-- DO NOT run `supabase db push` — changes are live. This file is
-- committed for version control and future environment provisioning only.
-- ─────────────────────────────────────────────────────────────
-- 1. Tabela spaces
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spaces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  category          text NOT NULL DEFAULT 'residencial'
                    CHECK (category IN ('residencial', 'comercial', 'conceito')),
  anchor_render_id  uuid REFERENCES renders(id) ON DELETE SET NULL,
  project_dna       jsonb NOT NULL DEFAULT '{"style":"","materials":"","palette":[],"context":"","lighting":""}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_spaces_anchor  ON spaces(anchor_render_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Extensões em renders (cada render vira candidato a Vista)
-- Nota: o projeto usa "renders", não "render_jobs" como no briefing
-- ─────────────────────────────────────────────────────────────
ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS space_id uuid
    REFERENCES spaces(id) ON DELETE SET NULL;

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS parent_render_id uuid
    REFERENCES renders(id) ON DELETE SET NULL;

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS vista_type text
    DEFAULT 'mestre'
    CHECK (vista_type IN ('mestre','iluminacao','material','angulo','detalhe','interior'));

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS generation_mode text
    DEFAULT 'coerente'
    CHECK (generation_mode IN ('coerente','explorar'));

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS dna_overrides jsonb DEFAULT '{}'::jsonb;

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS vista_label text;

CREATE INDEX IF NOT EXISTS idx_renders_space  ON renders(space_id);
CREATE INDEX IF NOT EXISTS idx_renders_parent ON renders(parent_render_id);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS — Spaces
-- ─────────────────────────────────────────────────────────────
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spaces_select_own"
  ON spaces FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "spaces_insert_own"
  ON spaces FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "spaces_update_own"
  ON spaces FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "spaces_delete_own"
  ON spaces FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Trigger updated_at
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_spaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_spaces_updated_at
  BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION update_spaces_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. View auxiliar com security_invoker (Postgres 15+)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW spaces_with_counts
  WITH (security_invoker = on)
AS
SELECT
  s.*,
  COALESCE((
    SELECT count(*) FROM renders r
    WHERE r.space_id = s.id AND r.status = 'completed'
  ), 0) AS vista_count,
  (
    SELECT max(r.created_at) FROM renders r
    WHERE r.space_id = s.id
  ) AS last_vista_at
FROM spaces s;

GRANT SELECT ON spaces_with_counts TO authenticated;
