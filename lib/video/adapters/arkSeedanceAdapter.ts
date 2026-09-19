// Adapter Seedance 2.0 DIRETO na ModelArk (BytePlus / ByteDance) — motor
// "Natural" do Animar. Mesma conta, chave e região do Seedream (ARK_API_KEY,
// ap-southeast-1). O fal cobra ~2× a ModelArk pelo mesmo Seedance (720p 5 s:
// US$1,51 contra 0,76) — é por isso que o Seedance via fal ficou oculto no
// catálogo desde jun/26 e este caminho existe.
//
// Envs (local E Vercel — ver memória project_vercel_env_parity):
//   ARK_API_KEY                     — chave da ModelArk (já usada pelo Seedream)
//   ARK_BASE_URL                    — default https://ark.ap-southeast.bytepluses.com/api/v3
//   ARK_SEEDANCE_MODEL              — override do modelo (default dreamina-seedance-2-0-260128)
//   NEXT_PUBLIC_ANIMAR_SEEDANCE=1   — liga o modelo no catálogo (inlinado no build!)
//   ANIMAR_SEEDANCE_FAL_FALLBACK=0  — desliga o fallback pro fal na falha de submit
//
// API (docs ModelArk, set/26): POST {base}/contents/generations/tasks
//   { model, content: [{type:'text',text}, {type:'image_url', image_url:{url}, role:'first_frame'}
//     (+ role:'last_frame')], resolution, ratio:'adaptive', duration, generate_audio,
//     watermark, camera_fixed, seed } → { id }
//   GET {base}/contents/generations/tasks/{id} → { status: queued|running|succeeded|
//     failed|cancelled, content: { video_url }, error }
// A URL de saída da ByteDance expira em 24 h e não está na allowlist de fetch
// do produto → re-hospedamos o mp4 no Storage (mesmo bucket do Vertex).
// Áudio é gerado por padrão na ModelArk (generate_audio default TRUE) —
// forçamos false: não usamos e muda o tier de preço em outros modelos.

import { falAdapter } from './falAdapter'
import { uploadVideoToStorage } from './storage'
import type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

export const ARK_SEEDANCE_MODEL_ID = 'ark/seedance-2.0/image-to-video'
export const DEFAULT_ARK_SEEDANCE_MODEL = 'dreamina-seedance-2-0-260128'
const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'
// Seedance 2.0 via fal — só como fallback de submit (2× o preço; margem cai
// nesse clipe, mas o usuário recebe o vídeo).
const FAL_SEEDANCE_FALLBACK_ID = 'bytedance/seedance-2.0/image-to-video'

const POLL_INTERVAL_MS = 10_000
// Rota tem maxDuration 300 s; sobra ~40 s pra submit + re-hospedagem.
const MAX_WAIT_MS = 250_000
const SUBMIT_TIMEOUT_MS = 30_000
const ALLOWED_RESOLUTIONS = new Set(['480p', '720p', '1080p'])

function baseUrl(): string {
  return (process.env.ARK_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function modelName(): string {
  return process.env.ARK_SEEDANCE_MODEL?.trim() || DEFAULT_ARK_SEEDANCE_MODEL
}

function apiKey(): string | null {
  return process.env.ARK_API_KEY?.trim() || null
}

function falFallbackEnabled(): boolean {
  return process.env.ANIMAR_SEEDANCE_FAL_FALLBACK !== '0'
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

interface ArkTaskResponse {
  id?: string
  status?: string
  content?: { video_url?: string; last_frame_url?: string }
  usage?: { completion_tokens?: number; total_tokens?: number }
  error?: { code?: string; message?: string }
  message?: string
}

async function arkFetch(path: string, init: RequestInit, timeoutMs: number): Promise<ArkTaskResponse> {
  const key = apiKey()
  if (!key) throw new Error('ARK_API_KEY não configurada.')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json: ArkTaskResponse = {}
    try {
      json = text ? (JSON.parse(text) as ArkTaskResponse) : {}
    } catch {
      json = { message: text.slice(0, 300) }
    }
    if (!res.ok) {
      const msg = json.error?.message ?? json.message ?? text.slice(0, 300)
      throw new Error(`ModelArk ${res.status}: ${msg}`)
    }
    return json
  } finally {
    clearTimeout(timer)
  }
}

async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download do vídeo da ModelArk falhou (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export const arkSeedanceAdapter: VideoAdapter = {
  id:          'ark',
  isAvailable: () => !!apiKey(),

  async generate(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const model      = modelName()
    const resolution = req.resolution && ALLOWED_RESOLUTIONS.has(req.resolution) ? req.resolution : '720p'
    const duration   = Math.min(15, Math.max(4, Number.parseInt(req.duration, 10) || 5))

    const content: Record<string, unknown>[] = [
      { type: 'text', text: req.prompt },
      { type: 'image_url', image_url: { url: req.imageUrl }, role: 'first_frame' },
    ]
    if (req.endImageUrl) {
      content.push({ type: 'image_url', image_url: { url: req.endImageUrl }, role: 'last_frame' })
    }

    // ── Submit — falha aqui não custou nada na ModelArk → fal (se ligado) ───
    let taskId: string
    try {
      console.log('[arkSeedance] model:', model, '| resolution:', resolution, '| duration:', duration)
      const created = await arkFetch('/contents/generations/tasks', {
        method: 'POST',
        body: JSON.stringify({
          model,
          content,
          resolution,
          // A imagem já tem a proporção do render; 'adaptive' segue ela.
          ratio:          'adaptive',
          duration,
          generate_audio: req.generateAudio ?? false,
          watermark:      false,
          camera_fixed:   false,
          seed:           -1,
        }),
      }, SUBMIT_TIMEOUT_MS)
      if (!created.id) throw new Error('ModelArk não devolveu id da tarefa.')
      taskId = created.id
    } catch (err) {
      console.error('[arkSeedance] submit falhou:', (err as Error).message)
      if (falFallbackEnabled() && falAdapter.isAvailable()) {
        console.warn('[arkSeedance] fallback pro fal (Seedance 2.0, 720p — 2× o custo)')
        const viaFal = await falAdapter.generate({ ...req, modelId: FAL_SEEDANCE_FALLBACK_ID, resolution })
        return { ...viaFal, provider: 'fal' }
      }
      throw err
    }

    // ── Poll (falha aqui propaga — a rota faz o refund) ─────────────────────
    const startedAt = Date.now()
    let pollErrors = 0
    let task: ArkTaskResponse = {}
    for (;;) {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error(`ModelArk não concluiu em ${MAX_WAIT_MS / 1000}s (task ${taskId})`)
      }
      await sleep(POLL_INTERVAL_MS)
      try {
        task = await arkFetch(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' }, 20_000)
        pollErrors = 0
      } catch (err) {
        pollErrors += 1
        console.warn(`[arkSeedance] poll falhou (${pollErrors}/3):`, (err as Error).message)
        if (pollErrors >= 3) throw err
        continue
      }
      const status = (task.status ?? '').toLowerCase()
      if (status === 'succeeded') break
      if (status === 'failed' || status === 'cancelled' || status === 'expired') {
        const msg = task.error?.message ?? task.message ?? status
        throw new Error(`ModelArk retornou ${status}: ${msg}`)
      }
    }

    const videoUrl = task.content?.video_url
    if (!videoUrl) throw new Error('ModelArk concluiu sem video_url.')

    console.log('[arkSeedance] concluído em', Math.round((Date.now() - startedAt) / 1000), 's — re-hospedando no Storage')
    const outputUrl = await uploadVideoToStorage(await downloadVideo(videoUrl), req.userId ?? 'anonimo')

    return {
      outputUrl,
      provider:  'ark',
      requestId: taskId,
      metadata:  { model, taskId, resolution, duration, usage: task.usage ?? null },
    }
  },
}
