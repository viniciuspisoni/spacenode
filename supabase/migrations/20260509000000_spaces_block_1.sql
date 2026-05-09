-- ─────────────────────────────────────────────────────────────
-- BLOCO 1 · Spaces v2 — Recriação completa
-- NOTE: aplicado em produção em 2026-05-09 via Supabase MCP.
-- Este arquivo serve apenas para versionamento; usa IF EXISTS / IF NOT EXISTS
-- pra ser seguro re-aplicar em ambientes novos.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Drop do schema antigo (Spaces v1 descartado) ─────────
DROP VIEW IF EXISTS public.spaces_with_counts;
DROP TRIGGER IF EXISTS trigger_spaces_updated_at ON public.spaces;
DROP FUNCTION IF EXISTS public.update_spaces_updated_at();

DROP INDEX IF EXISTS public.idx_renders_space;
DROP INDEX IF EXISTS public.idx_renders_parent;

ALTER TABLE public.renders DROP COLUMN IF EXISTS space_id;
ALTER TABLE public.renders DROP COLUMN IF EXISTS parent_render_id;
ALTER TABLE public.renders DROP COLUMN IF EXISTS vista_type;
ALTER TABLE public.renders DROP COLUMN IF EXISTS generation_mode;
ALTER TABLE public.renders DROP COLUMN IF EXISTS dna_overrides;
ALTER TABLE public.renders DROP COLUMN IF EXISTS vista_label;

DROP TABLE IF EXISTS public.spaces CASCADE;

-- ── 2. spaces ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spaces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  category          text NOT NULL DEFAULT 'residencial'
                    CHECK (category IN ('residencial','comercial','conceito')),
  engine            text NOT NULL DEFAULT 'vega'
                    CHECK (engine IN ('vega','quasar','pulsar')),
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','dna_extracting','dna_extracted','locked','archived')),
  vista_mestre_url  text,
  dna               jsonb,
  dna_extracted_at  timestamptz,
  locked_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spaces_user   ON public.spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_spaces_status ON public.spaces(user_id, status);

-- ── 3. vistas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vistas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                    uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url                   text,
  status                      text NOT NULL DEFAULT 'completed'
                              CHECK (status IN ('pending','processing','completed','failed')),
  engine                      text NOT NULL
                              CHECK (engine IN ('vega','quasar','pulsar','clarity')),
  quality                     text NOT NULL DEFAULT '2k'
                              CHECK (quality IN ('hd','2k','4k')),
  axis                        text
                              CHECK (axis IN ('iluminacao','angulo','horario','detalhe')),
  axis_value                  text,
  axis_label                  text,
  nodes_cost                  integer NOT NULL DEFAULT 0 CHECK (nodes_cost >= 0),
  prompt                      text,
  fal_request_id              text,
  dna_verified                boolean,
  dna_verification_details    jsonb,
  is_favorited                boolean NOT NULL DEFAULT false,
  is_in_pack                  boolean NOT NULL DEFAULT false,
  source_vista_id             uuid REFERENCES public.vistas(id) ON DELETE SET NULL,
  error_message               text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  completed_at                timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vistas_space     ON public.vistas(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vistas_user      ON public.vistas(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vistas_axis      ON public.vistas(space_id, axis) WHERE axis IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vistas_favorited ON public.vistas(space_id) WHERE is_favorited = true;

-- ── 4. packs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.packs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  narrative       text NOT NULL DEFAULT 'tour'
                  CHECK (narrative IN ('tour','dia_noite','detalhes','hero')),
  vistas_ordered  jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_name     text,
  client_email    text,
  description     text,
  share_token     text UNIQUE,
  password_hash   text,
  expires_at      timestamptz,
  pdf_url         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packs_space ON public.packs(space_id);
CREATE INDEX IF NOT EXISTS idx_packs_user  ON public.packs(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_share_token ON public.packs(share_token) WHERE share_token IS NOT NULL;

-- ── 5. architect_identity ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.architect_identity (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url             text,
  name                 text,
  subtitle             text,
  email_contact        text,
  social_link          text,
  accent_color_mode    text NOT NULL DEFAULT 'derived_from_dna'
                       CHECK (accent_color_mode IN ('fixed','derived_from_dna')),
  accent_color_fixed   text,
  footer_message       text,
  white_label_enabled  boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── 6. pack_comments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pack_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id      uuid NOT NULL REFERENCES public.packs(id) ON DELETE CASCADE,
  vista_id     uuid REFERENCES public.vistas(id) ON DELETE CASCADE,
  author_name  text NOT NULL,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pack_comments_pack ON public.pack_comments(pack_id, created_at);

-- ── 7. Trigger updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spaces_updated_at   ON public.spaces;
DROP TRIGGER IF EXISTS trg_packs_updated_at    ON public.packs;
DROP TRIGGER IF EXISTS trg_identity_updated_at ON public.architect_identity;

CREATE TRIGGER trg_spaces_updated_at   BEFORE UPDATE ON public.spaces             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_packs_updated_at    BEFORE UPDATE ON public.packs              FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_identity_updated_at BEFORE UPDATE ON public.architect_identity FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 8. RLS ───────────────────────────────────────────────────
ALTER TABLE public.spaces             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.architect_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_comments      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spaces_select_own ON public.spaces;
DROP POLICY IF EXISTS spaces_insert_own ON public.spaces;
DROP POLICY IF EXISTS spaces_update_own ON public.spaces;
DROP POLICY IF EXISTS spaces_delete_own ON public.spaces;

CREATE POLICY spaces_select_own ON public.spaces FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY spaces_insert_own ON public.spaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY spaces_update_own ON public.spaces FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY spaces_delete_own ON public.spaces FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS vistas_select_own ON public.vistas;
DROP POLICY IF EXISTS vistas_insert_own ON public.vistas;
DROP POLICY IF EXISTS vistas_update_own ON public.vistas;
DROP POLICY IF EXISTS vistas_delete_own ON public.vistas;

CREATE POLICY vistas_select_own ON public.vistas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY vistas_insert_own ON public.vistas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY vistas_update_own ON public.vistas FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY vistas_delete_own ON public.vistas FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS packs_select_own ON public.packs;
DROP POLICY IF EXISTS packs_insert_own ON public.packs;
DROP POLICY IF EXISTS packs_update_own ON public.packs;
DROP POLICY IF EXISTS packs_delete_own ON public.packs;

CREATE POLICY packs_select_own ON public.packs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY packs_insert_own ON public.packs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY packs_update_own ON public.packs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY packs_delete_own ON public.packs FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS identity_select_own ON public.architect_identity;
DROP POLICY IF EXISTS identity_insert_own ON public.architect_identity;
DROP POLICY IF EXISTS identity_update_own ON public.architect_identity;
DROP POLICY IF EXISTS identity_delete_own ON public.architect_identity;

CREATE POLICY identity_select_own ON public.architect_identity FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY identity_insert_own ON public.architect_identity FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY identity_update_own ON public.architect_identity FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY identity_delete_own ON public.architect_identity FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pack_comments_select_owner ON public.pack_comments;
CREATE POLICY pack_comments_select_owner ON public.pack_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.packs p WHERE p.id = pack_comments.pack_id AND p.user_id = auth.uid()));

-- ── 9. View spaces_with_counts ───────────────────────────────
CREATE OR REPLACE VIEW public.spaces_with_counts WITH (security_invoker = on) AS
SELECT
  s.*,
  COALESCE((SELECT count(*) FROM public.vistas v
             WHERE v.space_id = s.id AND v.status = 'completed' AND v.axis IS NOT NULL), 0) AS vista_count,
  (SELECT max(v.created_at) FROM public.vistas v
            WHERE v.space_id = s.id AND v.status = 'completed') AS last_vista_at
FROM public.spaces s;

GRANT SELECT ON public.spaces_with_counts TO authenticated;

-- ── 10. View node_usage_daily ────────────────────────────────
CREATE OR REPLACE VIEW public.node_usage_daily WITH (security_invoker = on) AS
SELECT
  user_id,
  day,
  SUM(nodes)::integer AS nodes
FROM (
  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_charged AS nodes
    FROM public.renders WHERE status = 'completed' AND nodes_charged > 0
  UNION ALL
  SELECT user_id, date_trunc('day', created_at)::date AS day, nodes_cost AS nodes
    FROM public.vistas  WHERE status = 'completed' AND nodes_cost > 0
) sub
GROUP BY user_id, day;

GRANT SELECT ON public.node_usage_daily TO authenticated;

-- ── 11. Storage buckets ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('space-mestres',      'space-mestres',      true, 15728640, ARRAY['image/jpeg','image/png','image/webp']),
  ('architect-identity', 'architect-identity', true, 2097152,  ARRAY['image/jpeg','image/png','image/svg+xml','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "space_mestres_user_insert"      ON storage.objects;
DROP POLICY IF EXISTS "space_mestres_user_update"      ON storage.objects;
DROP POLICY IF EXISTS "space_mestres_user_delete"      ON storage.objects;
DROP POLICY IF EXISTS "architect_identity_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "architect_identity_user_update" ON storage.objects;
DROP POLICY IF EXISTS "architect_identity_user_delete" ON storage.objects;

CREATE POLICY "space_mestres_user_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'space-mestres' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "space_mestres_user_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'space-mestres' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "space_mestres_user_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'space-mestres' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "architect_identity_user_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'architect-identity' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "architect_identity_user_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'architect-identity' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "architect_identity_user_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'architect-identity' AND (storage.foldername(name))[1] = auth.uid()::text);
