-- 20260703140000_storage_flip_buckets_private.sql
--
-- ⚠️  ESTA É A MIGRATION QUEBRANTE (B2 da auditoria 2026-07-03). NÃO APLICAR
--     até que TODOS os read-sites assinem as URLs (lib/storage/signed.ts) ou usem
--     o proxy (/api/media), E a página pública /p/[slug] assine server-side.
--
-- O que faz: torna PRIVADOS os buckets `space-mestres` e `architect-identity`.
-- A partir daqui, as URLs no formato público (`…/object/public/…`) guardadas no
-- DB passam a devolver 403 — só signed URLs (ou o proxy) funcionam.
--
-- ── ORDEM DE ROLLOUT SEGURA (fazer em JANELA, com Supabase conectado) ────────
--   1. Aplicar a migration 20260703130000 (bucket privado spacenode-media) — safe.
--   2. Fazer o wiring dos read-sites/emissão pra assinar (signStorageUrl) e/ou
--      trocar os write-sites pra gravar URL do proxy /api/media. Ajustar a
--      página /p/[slug] pra assinar server-side (TTL maior) os assets do pack.
--   3. Ligar a re-hospedagem (rehostToStorage) nas rotas de geração — opcional
--      mas recomendado antes do flip, pra outputs novos já nascerem no bucket.
--   4. Testar em STAGING com o bucket já privado: cada tela que mostra imagem
--      privada + a página pública do pack (logado e deslogado).
--   5. SÓ ENTÃO aplicar esta migration em produção. Ter o rollback pronto.
--
-- ── ROLLBACK (reverte pra público na hora) ──────────────────────────────────
--   UPDATE storage.buckets SET public = true
--   WHERE id IN ('space-mestres','architect-identity');
--   DROP POLICY IF EXISTS "space_mestres_user_select"      ON storage.objects;
--   DROP POLICY IF EXISTS "architect_identity_user_select" ON storage.objects;

-- Flip pra privado.
UPDATE storage.buckets SET public = false
WHERE id IN ('space-mestres', 'architect-identity');

-- SELECT owner-scoped (defesa: signed URL/proxy via service_role não dependem
-- disto, mas deixa o client RLS ler os próprios arquivos se preciso).
DROP POLICY IF EXISTS "space_mestres_user_select"      ON storage.objects;
DROP POLICY IF EXISTS "architect_identity_user_select" ON storage.objects;

CREATE POLICY "space_mestres_user_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'space-mestres' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "architect_identity_user_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'architect-identity' AND (storage.foldername(name))[1] = auth.uid()::text);
