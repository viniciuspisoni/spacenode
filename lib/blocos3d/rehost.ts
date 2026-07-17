// lib/blocos3d/rehost.ts
//
// Re-hospedagem dos outputs dos providers (fal/Meshy) no bucket privado
// `spacenode-media` (mesma fundação B3 do lib/storage/rehost.ts). As URLs dos
// providers são presignadas/CDN sem SLA e EXPIRAM — sem re-hospedar, o modelo
// do usuário some do histórico.
//
// Devolve a KEY (não URL): o bucket é privado desde a criação, então a emissão
// assina com signStorageKey. Falha devolve null — o chamador guarda as URLs do
// provider como fallback e nunca perde o output.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelFormat } from './types'

const BUCKET = 'spacenode-media'

/** Só baixamos de hosts dos providers (defesa — as URLs vêm das APIs autenticadas). */
const ALLOWED_SOURCE_HOSTS = ['meshy.ai', 'fal.media', 'fal.run', 'fal.ai']

// MIME declarado por formato — precisa casar com o allowlist do bucket
// (migration 20260717000000). O Storage faz string-match do contentType
// declarado, não sniffing.
const FORMAT_MIME: Record<ModelFormat, string> = {
  glb:  'model/gltf-binary',
  fbx:  'model/fbx',
  obj:  'model/obj',
  usdz: 'model/vnd.usdz+zip',
}

// Teto por arquivo — o bucket aceita até 200 MB; um bloco não deve passar disso.
const MAX_MODEL_BYTES = 120 * 1024 * 1024

function isAllowedSource(url: string): boolean {
  try {
    const h = new URL(url).host.toLowerCase()
    return ALLOWED_SOURCE_HOSTS.some(a => h === a || h.endsWith(`.${a}`))
  } catch {
    return false
  }
}

async function rehostOne(
  admin: SupabaseClient,
  sourceUrl: string,
  key: string,
  contentType: string,
): Promise<string | null> {
  if (!isAllowedSource(sourceUrl)) {
    console.error('[blocos3d-rehost] fonte não permitida:', (() => { try { return new URL(sourceUrl).host } catch { return '??' } })())
    return null
  }
  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) {
      console.error('[blocos3d-rehost] download falhou:', res.status, key)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_MODEL_BYTES) {
      console.error('[blocos3d-rehost] tamanho fora do limite:', buf.byteLength, key)
      return null
    }
    // upsert: keys são determinísticas por job/formato — dois polls concorrentes
    // gravam os MESMOS bytes; sem upsert o perdedor ficaria com key nula e
    // poderia vencer o claim do job com model_*_key = NULL (perda do modelo).
    const { error } = await admin.storage.from(BUCKET).upload(key, buf, {
      contentType,
      upsert: true,
    })
    if (error) {
      console.error('[blocos3d-rehost] upload falhou:', error.message, key)
      return null
    }
    return key
  } catch (e) {
    console.error('[blocos3d-rehost] erro:', (e as Error).message, key)
    return null
  }
}

export interface RehostedModel {
  modelKeys:    Partial<Record<ModelFormat, string>>
  thumbnailKey: string | null
}

/** Re-hospeda os formatos presentes + thumbnail sob `{userId}/blocos3d/{jobId}/`.
 *  Best-effort por arquivo: um formato que falhar vira ausência (fallback =
 *  URL do provider guardada no job), sem derrubar os demais. */
export async function rehostProviderOutputs(
  admin: SupabaseClient,
  opts: {
    userId: string
    jobId:  string
    modelUrls: Partial<Record<ModelFormat, string>>
    thumbnailUrl: string | null
  },
): Promise<RehostedModel> {
  const base = `${opts.userId}/blocos3d/${opts.jobId}`

  // Extensão/MIME da thumbnail seguem a URL do provider (nem sempre é PNG).
  const thumbExt = opts.thumbnailUrl?.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1]?.toLowerCase() ?? 'png'
  const thumbMime = thumbExt === 'webp' ? 'image/webp' : thumbExt === 'png' ? 'image/png' : 'image/jpeg'

  const formats = (Object.keys(FORMAT_MIME) as ModelFormat[]).filter(f => opts.modelUrls[f])
  const [modelResults, thumbnailKey] = await Promise.all([
    Promise.all(formats.map(f =>
      rehostOne(admin, opts.modelUrls[f]!, `${base}/modelo.${f}`, FORMAT_MIME[f]).then(k => [f, k] as const),
    )),
    opts.thumbnailUrl
      ? rehostOne(admin, opts.thumbnailUrl, `${base}/thumbnail.${thumbExt.replace('jpeg', 'jpg')}`, thumbMime)
      : Promise.resolve(null),
  ])

  const modelKeys: Partial<Record<ModelFormat, string>> = {}
  for (const [format, key] of modelResults) {
    if (key) modelKeys[format] = key
  }

  return { modelKeys, thumbnailKey }
}
