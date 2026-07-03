-- 20260703130000_storage_private_media_bucket.sql
--
-- Fundação do B3 (re-hospedagem das saídas da FAL) — auditoria 2026-07-03.
-- Cria um bucket PRIVADO `spacenode-media` para os outputs re-hospedados
-- (renders/vistas/vídeo/upscale), que hoje vivem só no CDN da FAL sem SLA.
--
-- ADITIVO E SEGURO DE APLICAR A QUALQUER MOMENTO: cria um bucket novo que
-- ninguém usa até o wiring do rehostToStorage (lib/storage/rehost.ts). Não muda
-- nada nos buckets/rotas existentes.
--
-- Limite de 200 MB pra caber vídeo (o space-mestres tem 15 MB, insuficiente).
-- Leitura será por signed URL (bucket privado); escrita é via service_role
-- (rehost) — por isso só policies de escrita owner-scoped + SELECT owner-scoped
-- de defesa (signed URL/proxy não dependem dela).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('spacenode-media', 'spacenode-media', false, 209715200,
   ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "spacenode_media_user_select" ON storage.objects;
DROP POLICY IF EXISTS "spacenode_media_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "spacenode_media_user_update" ON storage.objects;
DROP POLICY IF EXISTS "spacenode_media_user_delete" ON storage.objects;

CREATE POLICY "spacenode_media_user_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'spacenode-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "spacenode_media_user_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'spacenode-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "spacenode_media_user_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'spacenode-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "spacenode_media_user_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'spacenode-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Reversão: DELETE FROM storage.buckets WHERE id = 'spacenode-media'; (só se vazio)
--           + DROP das 4 policies acima.
