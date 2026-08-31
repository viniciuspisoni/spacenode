// lib/storage/direct-upload.ts
//
// Infra genérica de UPLOAD DIRETO browser → Supabase Storage via signed upload
// URL. Por que existe: Vercel Functions rejeitam corpo de request > 4,5 MB com
// 413 em texto puro — bem abaixo dos limites prometidos na UI (8–15 MB). Com o
// upload direto o binário nunca passa pela nossa API; o bucket impõe
// file_size_limit + allowed_mime_types no próprio PUT, e os limites POR ÁREA
// abaixo são revalidados na confirmação/consumo (metadata real do objeto).
//
// Fluxo (mesmo padrão do upload-vista-mestre, generalizado):
//   1. POST /api/uploads/sign    { area, contentType, sizeBytes, params }
//   2. browser: uploadToSignedUrl(key, token, file)  — sem Vercel no meio
//   3. POST /api/uploads/confirm { area, key, params }  → { url, ... }
//      OU a rota de trabalho consome a key direto (downloadDirectUpload).
//
// Cliente: use uploadDirect() de lib/storage/direct-upload-client.ts.

import type { SupabaseClient } from '@supabase/supabase-js'

type Params = Record<string, string>

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Nome de arquivo emitido pela sign — confirm/consumo só aceitam este formato,
 *  o que impede apontar pra outro objeto do bucket. */
const FILE_RE = /^\d{10,17}-[a-z0-9]{6}\.(jpg|png|webp)$/

export interface DirectUploadArea {
  bucket: string
  maxBytes: number
  /** MIMEs aceitos; pode depender dos params (ex.: máscara é sempre PNG).
   *  Devolve null se os params forem inválidos pra esta área. */
  allowedMime: (params: Params) => string[] | null
  /** Diretório sob o uid (sem barras nas pontas); null = params inválidos. */
  dir: (params: Params) => string | null
  /** Checagem extra na emissão (ex.: posse/estado do Space). Devolve erro ou null. */
  authorize?: (
    supabase: SupabaseClient,
    userId: string,
    params: Params,
  ) => Promise<{ status: number; message: string } | null>
  /** confirm baixa o objeto e mede via sharp (valida assinatura real + devolve
   *  width/height). Pra áreas cujo consumidor precisa de dimensões. */
  probe?: boolean
}

export const DIRECT_UPLOAD_AREAS = {
  // Sketches do fluxo guiado do Spaces ({uid}/sketches/{spaceId}/…).
  'spaces-sketch': {
    bucket: 'space-mestres',
    maxBytes: 10 * 1024 * 1024,
    allowedMime: () => IMAGE_MIME,
    dir: p => (UUID_RE.test(p.spaceId ?? '') ? `sketches/${p.spaceId}` : null),
    authorize: async (supabase, _userId, p) => {
      const { data: space, error } = await supabase
        .from('spaces')
        .select('id, status')
        .eq('id', p.spaceId)
        .single()
      if (error || !space) return { status: 404, message: 'Space não encontrado' }
      if (space.status !== 'locked') {
        return { status: 409, message: 'Space precisa estar travado pra receber sketches' }
      }
      return null
    },
  },
  // Assets do Finalizar (source/mask/thumb — mask é sempre PNG).
  'finalizar-asset': {
    bucket: 'space-mestres',
    maxBytes: 15 * 1024 * 1024,
    allowedMime: p =>
      p.kind === 'mask' ? ['image/png']
      : p.kind === 'source' || p.kind === 'thumb' ? IMAGE_MIME
      : null,
    dir: p => (['source', 'mask', 'thumb'].includes(p.kind ?? '') ? `finalizar/${p.kind}` : null),
  },
  // Composição exportada do Finalizar (consumida por /api/finalizar/export).
  'finalizar-export': {
    bucket: 'space-mestres',
    maxBytes: 15 * 1024 * 1024,
    allowedMime: () => ['image/png', 'image/jpeg', 'image/webp'],
    dir: () => 'finalizar/export',
  },
  // Source/máscara do Retocar e dos editores (Editar v1/v2/v3).
  'retocar-asset': {
    bucket: 'space-mestres',
    maxBytes: 10 * 1024 * 1024,
    allowedMime: p =>
      p.kind === 'mask' ? ['image/png']
      : p.kind === 'source' ? IMAGE_MIME
      : null,
    dir: p => (['source', 'mask'].includes(p.kind ?? '') ? `retocar/${p.kind}` : null),
  },
  // Imagem de referência da edição (confirm mede width/height via sharp).
  'retocar-reference': {
    bucket: 'space-mestres',
    maxBytes: 8 * 1024 * 1024,
    allowedMime: () => IMAGE_MIME,
    dir: () => 'retocar/reference',
    probe: true,
  },
  // Imagem de origem do Ampliar (consumida por /api/upscale).
  'upscale-source': {
    bucket: 'space-mestres',
    maxBytes: 15 * 1024 * 1024,
    allowedMime: () => IMAGE_MIME,
    dir: () => 'upscale/source',
  },
  // Imagem de origem/end-frame do Animar (consumida por /api/video[/analyze]).
  'animar-source': {
    bucket: 'space-mestres',
    maxBytes: 15 * 1024 * 1024,
    allowedMime: () => IMAGE_MIME,
    dir: () => 'animar/source',
  },
} satisfies Record<string, DirectUploadArea>

export type DirectUploadAreaId = keyof typeof DIRECT_UPLOAD_AREAS

export function getDirectUploadArea(id: string): DirectUploadArea | null {
  return Object.prototype.hasOwnProperty.call(DIRECT_UPLOAD_AREAS, id)
    ? DIRECT_UPLOAD_AREAS[id as DirectUploadAreaId]
    : null
}

/** Monta a key completa pra um upload novo; null = params/MIME inválidos. */
export function buildDirectUploadKey(
  area: DirectUploadArea,
  userId: string,
  params: Params,
  contentType: string,
): string | null {
  const dir = area.dir(params)
  const allowed = area.allowedMime(params)
  if (!dir || !allowed || !allowed.includes(contentType)) return null
  const ext = (contentType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const rand = Math.random().toString(36).slice(2, 8)
  return `${userId}/${dir}/${Date.now()}-${rand}.${ext}`
}

/** Valida a FORMA da key (prefixo do uid + dir da área + nome emitido pela
 *  sign). Não toca no Storage — existência/metadata ficam com verify/download. */
export function isValidDirectUploadKey(
  area: DirectUploadArea,
  userId: string,
  params: Params,
  key: string,
): boolean {
  const dir = area.dir(params)
  if (!dir) return false
  const prefix = `${userId}/${dir}/`
  return key.startsWith(prefix) && FILE_RE.test(key.slice(prefix.length))
}

export type VerifyResult =
  | { ok: true; url: string; size: number; mime: string }
  | { ok: false; status: number; message: string }

/** Confirma que o objeto subiu pro path esperado dentro dos limites da área.
 *  Usa list() + metadata (sem download). Devolve a URL pública (convenção do
 *  repo: read-sites assinam na emissão — ver lib/storage/signed.ts). */
export async function verifyDirectUpload(
  admin: SupabaseClient,
  area: DirectUploadArea,
  userId: string,
  params: Params,
  key: string,
): Promise<VerifyResult> {
  if (!isValidDirectUploadKey(area, userId, params, key)) {
    return { ok: false, status: 400, message: 'Chave de upload inválida' }
  }
  const lastSlash = key.lastIndexOf('/')
  const dir = key.slice(0, lastSlash)
  const fileName = key.slice(lastSlash + 1)

  const { data: entries, error } = await admin.storage
    .from(area.bucket)
    .list(dir, { search: fileName, limit: 100 })
  const obj = entries?.find(e => e.name === fileName)
  if (error || !obj) {
    return { ok: false, status: 400, message: 'Upload não encontrado — envie o arquivo novamente' }
  }

  const meta = obj.metadata as { size?: number; mimetype?: string } | null
  const size = meta?.size ?? 0
  const mime = meta?.mimetype ?? ''
  const allowed = area.allowedMime(params) ?? []
  if (size > area.maxBytes || !allowed.includes(mime)) {
    await admin.storage.from(area.bucket).remove([key])
    return { ok: false, status: 400, message: 'Arquivo inválido pra esta área de upload' }
  }

  const { data: { publicUrl } } = admin.storage.from(area.bucket).getPublicUrl(key)
  return { ok: true, url: publicUrl, size, mime }
}

export type DownloadResult =
  | { ok: true; buffer: Buffer; size: number; mime: string; url: string }
  | { ok: false; status: number; message: string }

/** Baixa o objeto pra consumo server-side (rotas de trabalho: upscale, video…).
 *  Valida forma da key + tamanho/MIME reais numa única ida ao Storage. */
export async function downloadDirectUpload(
  admin: SupabaseClient,
  area: DirectUploadArea,
  userId: string,
  params: Params,
  key: string,
): Promise<DownloadResult> {
  if (!isValidDirectUploadKey(area, userId, params, key)) {
    return { ok: false, status: 400, message: 'Chave de upload inválida' }
  }
  const { data: blob, error } = await admin.storage.from(area.bucket).download(key)
  if (error || !blob) {
    return { ok: false, status: 400, message: 'Upload não encontrado — envie o arquivo novamente' }
  }
  const buffer = Buffer.from(await blob.arrayBuffer())
  const mime = blob.type
  const allowed = area.allowedMime(params) ?? []
  if (buffer.byteLength > area.maxBytes || !allowed.includes(mime)) {
    await admin.storage.from(area.bucket).remove([key])
    return { ok: false, status: 400, message: 'Arquivo inválido pra esta área de upload' }
  }
  const { data: { publicUrl } } = admin.storage.from(area.bucket).getPublicUrl(key)
  return { ok: true, buffer, size: buffer.byteLength, mime, url: publicUrl }
}
