import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
import { MAX_OUTPUT_MP } from './costs'
import { MAX_SOURCE_BYTES } from './limits'

export function validateOutputDimensions(
  input: { width: number; height: number },
  output: { width?: number; height?: number },
  factor: number,
) {
  const { width, height } = output
  if (!width || !height || width * height > MAX_OUTPUT_MP * 1_000_000 ||
      Math.abs(width - Math.round(input.width * factor)) > 1 ||
      Math.abs(height - Math.round(input.height * factor)) > 1) {
    throw new Error('output_dimensions_mismatch')
  }
  return { width, height, factor: Math.round((width / input.width) * 100) / 100 }
}

export async function saveUpscaleOutput(
  admin: SupabaseClient,
  userId: string,
  jobId: string,
  source: Buffer,
  outputUrl: string,
  input: { width: number; height: number },
  factor: number,
  signal: AbortSignal,
) {
  const buffer = await fetchStorageBuffer(outputUrl, signal)
  const metadata = await sharp(buffer).metadata()
  const dimensions = validateOutputDimensions(input, metadata, factor)
  if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error('output_too_large')
  const format = metadata.format
  if (!format || !['png', 'jpeg', 'webp'].includes(format)) throw new Error('output_format_invalid')
  signal.throwIfAborted()
  const bucket = admin.storage.from('spacenode-media')
  const key = `${userId}/upscale/${jobId}.${format === 'jpeg' ? 'jpg' : format}`
  const { error } = await bucket.upload(key, buffer, { contentType: `image/${format}`, upsert: false })
  if (error) throw new Error(`output_save_failed: ${error.message}`)
  const url = bucket.getPublicUrl(key).data.publicUrl

  // Mesma redução e formato SEM perda nos dois lados. Nenhum filtro cosmético.
  // O master só é solicitado pelo browser no detalhe 100% ou no download.
  async function preview(bytes: Buffer, label: string) {
    try {
      signal.throwIfAborted()
      const derivative = await sharp(bytes).rotate().resize({ width: 1600, height: 1600,
        fit: 'inside', withoutEnlargement: true }).keepIccProfile().webp({ lossless: true }).toBuffer()
      const path = `${userId}/upscale/${jobId}-${label}.webp`
      const result = await bucket.upload(path, derivative, { contentType: 'image/webp', upsert: false })
      if (result.error) return null
      return bucket.getPublicUrl(path).data.publicUrl
    } catch { return null }
  }
  const [beforePreviewUrl, previewUrl] = await Promise.all([preview(source, 'before'), preview(buffer, 'after')])
  return { url, key, ...dimensions, bytes: buffer.byteLength, format, previewUrl, beforePreviewUrl }
}
