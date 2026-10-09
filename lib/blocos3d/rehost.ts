// lib/blocos3d/rehost.ts
//
// Re-hospedagem dos outputs dos providers (fal/Meshy) no bucket privado
// `spacenode-media` (mesma fundação B3 do lib/storage/rehost.ts). As URLs dos
// providers são presignadas/CDN sem SLA e EXPIRAM — sem re-hospedar, o modelo
// do usuário some do histórico.
//
// Devolve a KEY (não URL): o bucket é privado desde a criação, então a emissão
// assina com signStorageKey. O GLB é obrigatório; falhas transitórias mantêm
// o job processando para novo poll, e GLBs inválidos levam a estorno.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelFormat } from './types'
import { inspectGlb } from './inspect-glb'
import { optimizeGlb } from './optimize-glb'

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

export class InvalidGlbError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidGlbError' }
}

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
  optimizeForScenes: boolean,
): Promise<{ key: string | null; optimizedKey: string | null }> {
  const failed = { key: null, optimizedKey: null }
  if (!isAllowedSource(sourceUrl)) {
    console.error('[blocos3d-rehost] fonte não permitida:', (() => { try { return new URL(sourceUrl).host } catch { return '??' } })())
    return failed
  }
  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) {
      console.error('[blocos3d-rehost] download falhou:', res.status, key)
      return failed
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_MODEL_BYTES) {
      console.error('[blocos3d-rehost] tamanho fora do limite:', buf.byteLength, key)
      return failed
    }
    if (contentType === FORMAT_MIME.glb) {
      let inspection
      try { inspection = inspectGlb(buf) }
      catch (err) { throw new InvalidGlbError((err as Error).message) }
      console.info('[blocos3d-rehost] GLB validado:', inspection)
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
      return failed
    }
    let optimizedKey: string | null = null
    if (contentType === FORMAT_MIME.glb && optimizeForScenes) {
      try {
        const optimized = await optimizeGlb(buf)
        if (optimized) {
          const sceneKey = key.replace(/\.glb$/, '-cena.glb')
          const { error: sceneError } = await admin.storage.from(BUCKET).upload(sceneKey, optimized, {
            contentType, upsert: true,
          })
          if (sceneError) console.error('[blocos3d-rehost] versão para cenas:', sceneError.message)
          else optimizedKey = sceneKey
        }
      } catch (error) {
        // A versão leve é um bônus: sempre há o original validado e durável.
        console.warn('[blocos3d-rehost] otimização indisponível:', (error as Error).message)
      }
    }
    return { key, optimizedKey }
  } catch (e) {
    if (e instanceof InvalidGlbError) throw e
    console.error('[blocos3d-rehost] erro:', (e as Error).message, key)
    return failed
  }
}

export interface RehostedModel {
  modelKeys:    Partial<Record<ModelFormat, string>>
  thumbnailKey: string | null
  originalGlbKey: string | null
}

/** Re-hospeda os formatos presentes + thumbnail sob `{userId}/blocos3d/{jobId}/`.
 *  Formatos auxiliares e thumbnail são best-effort. Sem GLB validado e salvo,
 *  o chamador mantém o job processando ou o encerra com estorno. */
export async function rehostProviderOutputs(
  admin: SupabaseClient,
  opts: {
    userId: string
    jobId:  string
    modelUrls: Partial<Record<ModelFormat, string>>
    thumbnailUrl: string | null
    optimizeForScenes?: boolean
  },
): Promise<RehostedModel> {
  const base = `${opts.userId}/blocos3d/${opts.jobId}`

  // Extensão/MIME da thumbnail seguem a URL do provider (nem sempre é PNG).
  const thumbExt = opts.thumbnailUrl?.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1]?.toLowerCase() ?? 'png'
  const thumbMime = thumbExt === 'webp' ? 'image/webp' : thumbExt === 'png' ? 'image/png' : 'image/jpeg'

  const formats = (Object.keys(FORMAT_MIME) as ModelFormat[]).filter(f => opts.modelUrls[f])
  const [modelResults, thumbnailResult] = await Promise.all([
    Promise.all(formats.map(f =>
      rehostOne(admin, opts.modelUrls[f]!, `${base}/modelo.${f}`, FORMAT_MIME[f], opts.optimizeForScenes === true).then(k => [f, k] as const),
    )),
    opts.thumbnailUrl
      ? rehostOne(admin, opts.thumbnailUrl, `${base}/thumbnail.${thumbExt.replace('jpeg', 'jpg')}`, thumbMime, false)
      : Promise.resolve({ key: null, optimizedKey: null }),
  ])

  const modelKeys: Partial<Record<ModelFormat, string>> = {}
  let originalGlbKey: string | null = null
  for (const [format, result] of modelResults) {
    if (result.key) modelKeys[format] = result.optimizedKey ?? result.key
    if (format === 'glb' && result.optimizedKey) originalGlbKey = result.key
  }

  return { modelKeys, thumbnailKey: thumbnailResult.key, originalGlbKey }
}
