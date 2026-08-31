// lib/marketing/storage.ts
//
// Upload e leitura de assets de marca no bucket PRIVADO `marketing-assets`
// (criado na migration 20260713000000). Mesmo desenho do upload direto do
// produto (lib/storage/direct-upload.ts): sign → PUT direto do browser →
// confirm valida metadata real do objeto. Implementação própria porque (a) o
// bucket é privado e admin-only — nada de getPublicUrl — e (b) a infra genérica
// de produto está em evolução em outra frente; acoplar as duas agora criaria
// conflito sem ganho.
//
// Server-only (service role). Toda exibição sai como signed URL de TTL curto.

import type { SupabaseClient } from '@supabase/supabase-js'

export const MARKETING_BUCKET = 'marketing-assets'
export const MARKETING_MAX_BYTES = 25 * 1024 * 1024

/** MIMEs aceitos por tipo de asset de marca. */
const MIME_BY_KIND: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  logo: ['image/png', 'image/webp'],
  brand_file: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  cover: ['image/jpeg', 'image/png', 'image/webp'],
  reference: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4'],
}

const KEY_RE = /^brand\/(image|logo|brand_file|cover|reference|video)\/\d{10,17}-[a-z0-9]{6}\.[a-z0-9]{2,5}$/

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
}

export function allowedMimeForKind(kind: string): string[] | null {
  return Object.prototype.hasOwnProperty.call(MIME_BY_KIND, kind) ? MIME_BY_KIND[kind] : null
}

export interface SignResult {
  key: string
  token: string
  signedUrl: string
}

/** Emite a signed upload URL para um asset de marca. Valida MIME/kind/tamanho
 *  declarados; a confirmação revalida contra a metadata real do objeto. */
export async function signMarketingUpload(
  admin: SupabaseClient,
  kind: string,
  contentType: string,
  sizeBytes: number,
): Promise<{ ok: true; result: SignResult } | { ok: false; status: number; message: string }> {
  const allowed = allowedMimeForKind(kind)
  if (!allowed) return { ok: false, status: 400, message: 'Tipo de asset inválido' }
  if (!allowed.includes(contentType)) {
    return { ok: false, status: 400, message: 'Formato de arquivo não aceito para este tipo de asset' }
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MARKETING_MAX_BYTES) {
    return { ok: false, status: 400, message: 'Arquivo excede o limite de 25 MB' }
  }

  const ext = EXT_BY_MIME[contentType] ?? 'bin'
  const rand = Math.random().toString(36).slice(2, 8)
  const key = `brand/${kind}/${Date.now()}-${rand}.${ext}`

  const { data, error } = await admin.storage.from(MARKETING_BUCKET).createSignedUploadUrl(key)
  if (error || !data) {
    return { ok: false, status: 500, message: 'Falha ao preparar o upload' }
  }
  return { ok: true, result: { key, token: data.token, signedUrl: data.signedUrl } }
}

export interface ConfirmResult {
  key: string
  size: number
  mime: string
}

/** Confirma que o objeto subiu no path emitido pela sign e dentro dos limites,
 *  usando a metadata real (list — sem download). Objeto inválido é removido. */
export async function confirmMarketingUpload(
  admin: SupabaseClient,
  kind: string,
  key: string,
): Promise<{ ok: true; result: ConfirmResult } | { ok: false; status: number; message: string }> {
  const allowed = allowedMimeForKind(kind)
  if (!allowed || !KEY_RE.test(key) || !key.startsWith(`brand/${kind}/`)) {
    return { ok: false, status: 400, message: 'Chave de upload inválida' }
  }

  const lastSlash = key.lastIndexOf('/')
  const dir = key.slice(0, lastSlash)
  const fileName = key.slice(lastSlash + 1)

  const { data: entries, error } = await admin.storage
    .from(MARKETING_BUCKET)
    .list(dir, { search: fileName, limit: 100 })
  const obj = entries?.find(e => e.name === fileName)
  if (error || !obj) {
    return { ok: false, status: 400, message: 'Upload não encontrado — envie o arquivo novamente' }
  }

  const meta = obj.metadata as { size?: number; mimetype?: string } | null
  const size = meta?.size ?? 0
  const mime = meta?.mimetype ?? ''
  if (size > MARKETING_MAX_BYTES || !allowed.includes(mime)) {
    await admin.storage.from(MARKETING_BUCKET).remove([key])
    return { ok: false, status: 400, message: 'Arquivo inválido para esta área de upload' }
  }

  return { ok: true, result: { key, size, mime } }
}

const DISPLAY_TTL_SECONDS = 60 * 60 // 1h — bucket é privado; exibição sempre assinada

/** Signed URL de exibição para um asset do bucket de marketing. */
export async function signMarketingAssetUrl(
  admin: SupabaseClient,
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null
  const { data, error } = await admin.storage
    .from(MARKETING_BUCKET)
    .createSignedUrl(key, DISPLAY_TTL_SECONDS)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
