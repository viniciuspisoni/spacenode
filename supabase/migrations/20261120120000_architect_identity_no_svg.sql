-- 20261120120000_architect_identity_no_svg.sql
--
-- Auditoria de segurança 2026-11-18, recomendação 3
-- (docs/audits/2026-11-18/seguranca.md).
--
-- ── PROBLEMA ────────────────────────────────────────────────────────────────
-- O bucket `architect-identity` (logo do escritório) é público e aceitava
-- image/svg+xml. Um SVG com <script>, aberto direto na URL pública do Storage,
-- executa no domínio *.supabase.co — serve para phishing com o nosso projeto.
-- E qualquer conta logada podia subir arquivo na própria pasta direto pela API
-- do Storage (policies architect_identity_user_insert/update), sem passar pela
-- rota /api/users/me/identity.
--
-- ── SOLUÇÃO ─────────────────────────────────────────────────────────────────
--   • o bucket só aceita PNG, JPG e WebP (o Storage confere em todo upload,
--     inclusive do service_role);
--   • saem as policies de escrita do `authenticated` nesse bucket: o único
--     caminho de upload é a rota, que usa o service_role e confere o tipo pelos
--     bytes do arquivo (lib/spaces/logo-upload.ts). A exclusão da conta
--     (/api/users/me DELETE) também usa o service_role. Nenhum client grava aí
--     (grep 2026-11-20).
-- O bucket continua público: o logo aparece na página pública do pack (/p/…)
-- e a leitura não muda. Em produção (2026-11-20) havia 3 objetos, todos PNG —
-- nenhum SVG para migrar.
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
--   select allowed_mime_types from storage.buckets where id = 'architect-identity';
--   select polname from pg_policy where polrelid = 'storage.objects'::regclass
--      and polname like 'architect_identity_user_%';            -- nenhuma
--
-- ── REVERSÃO ────────────────────────────────────────────────────────────────
-- Reaplicar o trecho "architect-identity" da seção 11 de
-- 20260509000000_spaces_block_1.sql (bucket com SVG + as 3 policies).

update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'architect-identity';

drop policy if exists "architect_identity_user_insert" on storage.objects;
drop policy if exists "architect_identity_user_update" on storage.objects;
drop policy if exists "architect_identity_user_delete" on storage.objects;
