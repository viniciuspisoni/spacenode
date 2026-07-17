// lib/blocos3d/meshy.ts
//
// Provider Meshy do Blocos 3D (SERVER-ONLY — usa MESHY_API_KEY; exige plano
// Pro+ na Meshy pra API liberar). Docs: https://docs.meshy.ai (Image to 3D).
//
// É o tier premium do módulo: entrega GLB+FBX+OBJ+USDZ numa geração só, malha
// quad editável, PBR e texture_prompt. Task assíncrona com progress real
// (0–100) — o poll da rota consome via getMeshyTask.

import type { Blocos3DOptions, ModelFormat, ProviderTaskState } from './types'

const MESHY_BASE_URL = 'https://api.meshy.ai/openapi/v1'

export class MeshyError extends Error {
  constructor(
    message: string,
    /** HTTP status da Meshy (402 = créditos do provider esgotados). */
    public readonly status: number,
  ) {
    super(message)
    this.name = 'MeshyError'
  }
}

export function meshyConfigured(): boolean {
  return !!process.env.MESHY_API_KEY
}

function apiKey(): string {
  const key = process.env.MESHY_API_KEY
  if (!key) throw new MeshyError('MESHY_API_KEY não configurada', 500)
  return key
}

async function meshyFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${MESHY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const msg =
      (typeof data?.message === 'string' && data.message) ||
      `Meshy respondeu ${res.status}`
    throw new MeshyError(msg, res.status)
  }
  return data ?? {}
}

/** Cria a task image-to-3d e devolve o id. `imageUrl` precisa ser acessível
 *  pela Meshy (usamos signed URL de TTL curto do nosso Storage). */
export async function createMeshyTask(imageUrl: string, options: Blocos3DOptions): Promise<string> {
  const body: Record<string, unknown> = {
    image_url:      imageUrl,
    topology:       'quad',       // diferencial do tier: malha editável
    symmetry_mode:  'auto',
    should_remesh:  true,
    should_texture: true,
    enable_pbr:     true,
  }
  // Sem default hardcoded de ai_model: a Meshy usa o engine mais recente;
  // pin explícito só via env (troca sem redeploy de código).
  if (process.env.MESHY_AI_MODEL) body.ai_model = process.env.MESHY_AI_MODEL
  if (options.texturePrompt) body.texture_prompt = options.texturePrompt

  const data = await meshyFetch('/image-to-3d', { method: 'POST', body: JSON.stringify(body) })
  const taskId = data.result
  if (typeof taskId !== 'string' || !taskId) {
    throw new MeshyError('Resposta da Meshy sem id de task', 502)
  }
  return taskId
}

/** Consulta a task e normaliza pro shape comum dos providers. */
export async function getMeshyTask(taskId: string): Promise<ProviderTaskState> {
  const data = await meshyFetch(`/image-to-3d/${encodeURIComponent(taskId)}`, { method: 'GET' })

  const rawUrls = (data.model_urls ?? null) as Record<string, unknown> | null
  const modelUrls: Partial<Record<ModelFormat, string>> = {}
  for (const format of ['glb', 'fbx', 'obj', 'usdz'] as ModelFormat[]) {
    const url = rawUrls?.[format]
    if (typeof url === 'string' && url) modelUrls[format] = url
  }

  const thumbnailUrl = typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null
  const progress = typeof data.progress === 'number'
    ? Math.max(0, Math.min(100, data.progress))
    : null

  if (data.status === 'SUCCEEDED') {
    if (!modelUrls.glb) {
      return { status: 'failed', progress, modelUrls: {}, thumbnailUrl, errorMessage: 'O motor não retornou um modelo 3D' }
    }
    return { status: 'succeeded', progress: 100, modelUrls, thumbnailUrl, errorMessage: null }
  }

  if (data.status === 'FAILED' || data.status === 'CANCELED') {
    const taskError = (data.task_error ?? null) as { message?: string } | null
    return {
      status: 'failed', progress, modelUrls: {}, thumbnailUrl,
      errorMessage: taskError?.message || 'Geração falhou no provider',
    }
  }

  // PENDING / IN_PROGRESS (ou status desconhecido → segue aguardando).
  return { status: 'processing', progress, modelUrls: {}, thumbnailUrl, errorMessage: null }
}
