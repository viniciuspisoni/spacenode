// lib/storage/preview.ts
//
// Derivado de EXIBIÇÃO do master lossless: WebP ~1600 px no lado maior.
// O master PNG (2K/4K, 10-30 MB) continua sendo a verdade — download, edição,
// upscale e comparador leem ele. O preview existe pra grids (Histórico,
// dashboard) não baixarem o master inteiro por card.
//
// Best-effort por contrato: falha aqui devolve null e o caller segue servindo
// o master (comportamento anterior). SERVER-ONLY (sharp + service role).

import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'

const PREVIEW_LONG_SIDE = 1600
const PREVIEW_QUALITY = 80
const PREVIEW_BUCKET = 'space-mestres'

export async function createDisplayPreview(
  admin: SupabaseClient,
  userId: string,
  area: string,
  sourceBuffer: Buffer,
): Promise<string | null> {
  try {
    const webp = await sharp(sourceBuffer)
      .resize({
        width: PREVIEW_LONG_SIDE,
        height: PREVIEW_LONG_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer()
    const rand = Math.random().toString(36).slice(2, 8)
    const key = `${userId}/${area}/preview-${Date.now()}-${rand}.webp`
    const { error } = await admin.storage
      .from(PREVIEW_BUCKET)
      .upload(key, webp, { contentType: 'image/webp', upsert: false })
    if (error) throw new Error(error.message)
    return admin.storage.from(PREVIEW_BUCKET).getPublicUrl(key).data.publicUrl
  } catch (err) {
    console.warn('[preview] derivado de exibição falhou (segue sem):', (err as Error).message)
    return null
  }
}
