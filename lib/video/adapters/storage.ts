// Re-hospedagem do mp4 no Supabase Storage — compartilhada pelos adapters
// que não devolvem um CDN público durável (Vertex devolve bytes; a URL da
// ModelArk expira em 24 h e não está na allowlist de fetch do produto).
// Mesmo bucket/convenção de chave do uploadEditAsset (space-mestres).

import { createAdminClient } from '@/lib/supabase/admin'

const STORAGE_BUCKET = 'space-mestres'

export async function uploadVideoToStorage(buf: Buffer, userId: string): Promise<string> {
  const admin = createAdminClient()
  const rand  = Math.random().toString(36).slice(2, 8)
  const key   = `${userId}/animar/${Date.now()}-${rand}.mp4`
  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(key, buf, { contentType: 'video/mp4', upsert: false })
  if (error) throw new Error('upload do vídeo pro Storage falhou: ' + error.message)
  const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(key)
  return data.publicUrl
}
