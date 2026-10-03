// Private first-print uploads. The encrypted reference is bound to its owner;
// file paths and download credentials never enter the model's conversation.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GenerationImages } from './images'

export const NODI_UPLOAD_BUCKET = 'spacenode-media'
export const NODI_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
export const NODI_UPLOAD_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const TTL = 24 * 60 * 60_000
const FILE_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/
const AAD = Buffer.from('nodi-private-print-v1')

function encryptionKey(): Buffer {
  const secret = process.env.NODI_ACTION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Configuração do anexo indisponível')
  return createHash('sha256').update(AAD).update(secret).digest()
}

export function validUploadKey(key: string, userId: string): boolean {
  const prefix = `${userId}/nodi/source/`
  return key.startsWith(prefix) && FILE_RE.test(key.slice(prefix.length))
}

export function newUploadKey(userId: string, mime: string): string {
  if (!NODI_UPLOAD_MIMES.includes(mime)) throw new Error('Use JPG, PNG ou WebP.')
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
  return `${userId}/nodi/source/${randomBytes(16).toString('hex')}.${ext}`
}

export function sealUpload(userId: string, key: string, now = Date.now()): string {
  if (!validUploadKey(key, userId)) throw new Error('Anexo inválido')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(AAD)
  const body = Buffer.from(JSON.stringify({ userId, key, exp: now + TTL }))
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function openUpload(token: string, userId: string, now = Date.now()): string | null {
  if (!/^[A-Za-z0-9_-]{60,1024}$/.test(token)) return null
  try {
    const bytes = Buffer.from(token, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12))
    decipher.setAAD(AAD)
    decipher.setAuthTag(bytes.subarray(12, 28))
    const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString())
    return data.userId === userId && typeof data.exp === 'number' && data.exp > now &&
      typeof data.key === 'string' && validUploadKey(data.key, userId) ? data.key : null
  } catch { return null }
}

export async function validatePrint(buffer: Buffer, mime: string): Promise<void> {
  if (!buffer.length || buffer.length > NODI_UPLOAD_MAX_BYTES || !NODI_UPLOAD_MIMES.includes(mime)) {
    throw new Error('Use JPG, PNG ou WebP de até 8 MB.')
  }
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'warning' })
  const metadata = await image.metadata()
  const actual = metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`
  if (actual !== mime || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
    throw new Error('Envie uma imagem estática válida em JPG, PNG ou WebP.')
  }
  // Metadata alone accepts some truncated files. Decode pixels before sealing.
  await image.resize(32, 32, { fit: 'inside' }).raw().toBuffer()
}

export async function resolveUploadImages(admin: SupabaseClient, userId: string, token: string): Promise<GenerationImages | null> {
  const key = openUpload(token, userId)
  if (!key) return null
  const { data, error } = await admin.storage.from(NODI_UPLOAD_BUCKET).createSignedUrl(key, 3600)
  if (error || !data?.signedUrl) return null
  return { label: 'Print enviado', status: null, engine: null, inputUrl: data.signedUrl, outputUrl: null }
}

/** Persist the owner's authenticated proxy, never an expiring download token. */
export function persistentPrintUrl(url: string, userId: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin) return url
    const prefix = `/storage/v1/object/sign/${NODI_UPLOAD_BUCKET}/`
    if (!parsed.pathname.startsWith(prefix)) return url
    const key = decodeURIComponent(parsed.pathname.slice(prefix.length))
    if (!validUploadKey(key, userId)) return url
    return `/api/media?${new URLSearchParams({ bucket: NODI_UPLOAD_BUCKET, key })}`
  } catch { return url }
}

export async function refreshPrintUrl(supabase: SupabaseClient, userId: string, url: string): Promise<string | null> {
  if (!url.startsWith('/api/media?')) return url
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  const key = params.get('key')
  if (params.get('bucket') !== NODI_UPLOAD_BUCKET || !key || !validUploadKey(key, userId)) return null
  const { data, error } = await supabase.storage.from(NODI_UPLOAD_BUCKET).createSignedUrl(key, 3600)
  return error ? null : data?.signedUrl ?? null
}
