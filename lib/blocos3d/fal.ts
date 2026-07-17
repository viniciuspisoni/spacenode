// lib/blocos3d/fal.ts
//
// Provider fal do Blocos 3D (SERVER-ONLY — usa FAL_KEY). Fila assíncrona da
// fal: submit devolve request_id; status informa IN_QUEUE/IN_PROGRESS/
// COMPLETED; result entrega os arquivos. Uma task que falhou aparece como
// COMPLETED no status e o result() lança — tratamos como failed.
//
// Multiview: cada motor recebe os ângulos do seu jeito —
//   Tripo  → endpoint DIFERENTE (multiview-to-3d) com campos posicionais
//   Rodin  → input_image_urls[] + condition_mode 'fuse'
//   Meshy  → image_urls[]
// resolveFalEngineId decide o endpoint efetivo; a rota persiste o id
// retornado pelo submit — o poll SEMPRE consulta o endpoint que gerou.
//
// Os schemas de output variam por endpoint (model_mesh, model_glb, …), então a
// extração de URLs é DEFENSIVA: varre o result atrás de arquivos por extensão.

import { fal } from '@fal-ai/client'
import type { Blocos3DOptions, ModelFormat, PositionedImages, ProviderTaskState } from './types'
import { countImages, listImages, type Blocos3DEngine } from './config'

fal.config({ credentials: process.env.FAL_KEY })

/** Endpoint efetivo pro conjunto de imagens (Tripo troca pra multiview). */
export function resolveFalEngineId(engine: Blocos3DEngine, images: PositionedImages<string>): string {
  if (engine.engine === 'tripo3d/tripo/v2.5/image-to-3d' && countImages(images) > 1) {
    return 'tripo3d/tripo/v2.5/multiview-to-3d'
  }
  return engine.engine
}

// Parâmetros comuns do Tripo (single e multiview compartilham).
// texture_alignment original_image: fidelidade à foto de referência
// (feedback 2026-07-17); auto_size: escala real embutida — relevante pra maquete.
const TRIPO_COMMON = {
  texture:           'HD',
  pbr:               true,
  texture_alignment: 'original_image',
  auto_size:         true,
} as const

/** Monta o input por endpoint (nomes de campo diferem entre os modelos). */
function buildInput(
  engineId: string,
  images: PositionedImages<string>,
  options: Blocos3DOptions,
): Record<string, unknown> {
  switch (engineId) {
    case 'tripo3d/tripo/v2.5/image-to-3d':
      return { image_url: images.front, ...TRIPO_COMMON }

    case 'tripo3d/tripo/v2.5/multiview-to-3d':
      return {
        front_image_url: images.front,
        ...(images.left  ? { left_image_url:  images.left }  : {}),
        ...(images.back  ? { back_image_url:  images.back }  : {}),
        ...(images.right ? { right_image_url: images.right } : {}),
        ...TRIPO_COMMON,
      }

    case 'fal-ai/hyper3d/rodin':
      return {
        input_image_urls:     listImages(images),
        ...(countImages(images) > 1 ? { condition_mode: 'fuse' } : {}),
        geometry_file_format: 'glb',
        material:             'PBR',
        quality:              'high',
        use_hyper:            true,
        tier:                 'Regular',
        ...(options.texturePrompt ? { prompt: options.texturePrompt } : {}),
      }

    case 'fal-ai/meshy/v5/multi-image-to-3d':
      return {
        image_urls:     listImages(images),
        topology:       'quad',       // diferencial do tier: malha editável
        symmetry_mode:  'auto',
        should_remesh:  true,
        should_texture: true,
        enable_pbr:     true,
        ...(options.texturePrompt ? { texture_prompt: options.texturePrompt } : {}),
      }

    // Motores históricos (jobs antigos) e fallback.
    case 'fal-ai/hunyuan3d-v21':
      return { input_image_url: images.front, textured_mesh: true }
    default:
      return { image_url: images.front }
  }
}

export async function createFalTask(
  engine: Blocos3DEngine,
  images: PositionedImages<string>,
  options: Blocos3DOptions,
): Promise<{ taskId: string; engineId: string }> {
  const engineId = resolveFalEngineId(engine, images)
  const { request_id } = await fal.queue.submit(engineId, {
    input: buildInput(engineId, images, options),
  })
  if (!request_id) throw new Error('fal.queue.submit sem request_id')
  return { taskId: request_id, engineId }
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
