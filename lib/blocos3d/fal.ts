// lib/blocos3d/fal.ts
//
// Provider fal do Blocos 3D (SERVER-ONLY — usa FAL_KEY). Fila assíncrona da
// fal: submit devolve request_id; status informa IN_QUEUE/IN_PROGRESS/
// COMPLETED; result entrega os arquivos. Uma task que falhou aparece como
// COMPLETED no status e o result() lança — tratamos como failed.
//
// Os schemas de output variam por endpoint (model_mesh, model_glb, …), então a
// extração de URLs é DEFENSIVA: varre o result atrás de arquivos por extensão.

import { fal } from '@fal-ai/client'
import type { ModelFormat, ProviderTaskState } from './types'
import type { Blocos3DEngine } from './config'

fal.config({ credentials: process.env.FAL_KEY })

/** Monta o input por endpoint (nomes de campo diferem entre os modelos). */
function buildInput(engine: Blocos3DEngine, imageUrl: string): Record<string, unknown> {
  switch (engine.engine) {
    case 'fal-ai/trellis':
      return { image_url: imageUrl }
    case 'fal-ai/hunyuan3d-v21':
      return { input_image_url: imageUrl, textured_mesh: true }
    case 'tripo3d/tripo/v2.5/image-to-3d':
      return {
        image_url: imageUrl,
        texture:   'HD',
        pbr:       true,
        // Fidelidade à foto de referência (feedback 2026-07-17: textura tem
        // que respeitar o material real do objeto, não estilizar).
        texture_alignment: 'original_image',
        // Escala real do objeto embutida no modelo — relevante pra maquete.
        auto_size: true,
      }
    default:
      return { image_url: imageUrl }
  }
}

export async function createFalTask(engine: Blocos3DEngine, imageUrl: string): Promise<string> {
  const { request_id } = await fal.queue.submit(engine.engine, {
    input: buildInput(engine, imageUrl),
  })
  if (!request_id) throw new Error('fal.queue.submit sem request_id')
  return request_id
}

const MODEL_EXT_RE = /\.(glb|fbx|obj|usdz)(\?|$)/i
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)(\?|$)/i

/** Varre o result atrás de URLs de modelo/imagem (campos {url} ou strings). */
function collectUrls(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (value.startsWith('http')) out.push(value)
    return
  }
  if (Array.isArray(value)) { value.forEach(v => collectUrls(v, out)); return }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(v => collectUrls(v, out))
  }
}

function extractOutputs(result: unknown): { modelUrls: Partial<Record<ModelFormat, string>>; thumbnailUrl: string | null } {
  const urls: string[] = []
  // Preferência explícita ANTES do scan first-wins: os providers entregam o
  // GLB com PBR num campo separado que vem DEPOIS do mesh básico no objeto
  // (Hunyuan: model_glb_pbr; Tripo: pbr_model) — sem isto, o tier vendido
  // como "Materiais PBR" serviria sempre o mesh sem PBR.
  const root = result as Record<string, unknown> | null
  for (const field of ['model_glb_pbr', 'pbr_model'] as const) {
    const url = (root?.[field] as { url?: unknown } | undefined)?.url
    if (typeof url === 'string' && url.startsWith('http')) { urls.push(url); break }
  }
  collectUrls(result, urls)

  const modelUrls: Partial<Record<ModelFormat, string>> = {}
  let thumbnailUrl: string | null = null
  for (const url of urls) {
    const m = url.match(MODEL_EXT_RE)
    if (m) {
      const format = m[1].toLowerCase() as ModelFormat
      if (!modelUrls[format]) modelUrls[format] = url
      continue
    }
    if (!thumbnailUrl && IMAGE_EXT_RE.test(url)) thumbnailUrl = url
  }
  return { modelUrls, thumbnailUrl }
}

export async function getFalTask(engineId: string, requestId: string): Promise<ProviderTaskState> {
  const status = await fal.queue.status(engineId, { requestId, logs: false })

  if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
    return { status: 'processing', progress: null, modelUrls: {}, thumbnailUrl: null, errorMessage: null }
  }

  // COMPLETED: o result é quem revela sucesso × falha (falha do MODELO lança
  // aqui com 4xx). Erro transitório (rede sem status, 429, 5xx) NÃO é terminal
  // — rethrow deixa o poll da rota manter o job em processing e tentar de novo.
  try {
    const { data } = await fal.queue.result(engineId, { requestId })
    const { modelUrls, thumbnailUrl } = extractOutputs(data)
    if (!modelUrls.glb) {
      return {
        status: 'failed', progress: null, modelUrls: {}, thumbnailUrl: null,
        errorMessage: 'O motor não retornou um modelo 3D',
      }
    }
    return { status: 'succeeded', progress: 100, modelUrls, thumbnailUrl, errorMessage: null }
  } catch (err) {
    const e = err as { status?: number; body?: { detail?: unknown }; message?: string }
    const transient =
      e?.status === undefined || e.status === 404 || e.status === 429 || e.status >= 500
    if (transient) throw err

    const detail = e?.body?.detail
    const msg = Array.isArray(detail)
      ? (detail[0] as { msg?: string })?.msg
      : typeof detail === 'string' ? detail : e?.message
    return {
      status: 'failed', progress: null, modelUrls: {}, thumbnailUrl: null,
      errorMessage: msg || 'Geração falhou no provider',
    }
  }
}
