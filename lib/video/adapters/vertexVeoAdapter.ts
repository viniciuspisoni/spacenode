// Adapter Veo 3.1 via Vertex AI (conta GCP própria) — alternativa ao fal
// para o MESMO produto "Cinemático". Selecionado pelo facade quando o gate
// estiver ligado; o catálogo, os presets e o preço em nodes não mudam.
//
// Envs (local E Vercel — ver memória project_vercel_env_parity):
//   VERTEX_VEO_ENABLED=1            — gate explícito (server-only)
//   GOOGLE_VERTEX_PROJECT           — id do projeto GCP
//   GOOGLE_VERTEX_LOCATION          — região (default us-central1)
//   Credencial (UMA das duas formas — mesma convenção do vertex-imagen):
//     GOOGLE_VERTEX_CREDENTIALS_JSON — JSON inteiro da service account numa env
//     GOOGLE_APPLICATION_CREDENTIALS — caminho do arquivo da SA (ADC, p/ local)
//   VERTEX_VEO_MODEL_ID             — override do modelo
//                                     (default veo-3.1-generate-001, GA 2026-06)
//
// Fluxo: generateVideos (long-running) → poll getVideosOperation a cada 10s →
// bytes base64 → re-hospeda no Supabase Storage (o Vertex não devolve CDN
// público como o fal). Falha ANTES do submit → fallback transparente pro fal
// (se disponível); falha depois do submit → propaga (rota faz refund).
//
// Diferenças vs fal/Veo: aspecto 'auto' não existe no Vertex (só 16:9|9:16) —
// derivamos da proporção da imagem; frame final é SUPORTADO (config.lastFrame).

import { GoogleGenAI } from '@google/genai'
import { createAdminClient } from '@/lib/supabase/admin'
import { falAdapter } from './falAdapter'
import type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

export const DEFAULT_VERTEX_VEO_MODEL = 'veo-3.1-generate-001'

// Smoke 2026-07-07: 4s@720p levou 213s no Vertex — bem mais lento que o fal.
// 260s deixa ~35s de folga dentro do maxDuration de 300s da rota (submit +
// re-hospedagem). Se 8s@1080p estourar isto em uso real, o caminho certo é a
// evolução p/ fila + polling no cliente (ver comentário em app/api/video).
const POLL_INTERVAL_MS = 10_000
const MAX_WAIT_MS      = 260_000
const STORAGE_BUCKET   = 'space-mestres'

function enabled(): boolean {
  return process.env.VERTEX_VEO_ENABLED === '1'
}

function hasCredentials(): boolean {
  return !!process.env.GOOGLE_VERTEX_PROJECT?.trim() &&
    (!!process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim() ||
     !!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
}

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (_client) return _client
  const project   = process.env.GOOGLE_VERTEX_PROJECT?.trim()
  const location  = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
  const credsJson = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
  if (!project || !hasCredentials()) {
    throw new Error(
      'Com VERTEX_VEO_ENABLED=1 são obrigatórias GOOGLE_VERTEX_PROJECT e uma credencial: ' +
      'GOOGLE_VERTEX_CREDENTIALS_JSON (inline) ou GOOGLE_APPLICATION_CREDENTIALS (caminho ADC).',
    )
  }
  _client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    // Com JSON inline, injeta explicitamente; com ADC, omitir googleAuthOptions
    // faz o google-auth-library ler GOOGLE_APPLICATION_CREDENTIALS sozinho.
    ...(credsJson ? { googleAuthOptions: { credentials: JSON.parse(credsJson) } } : {}),
  })
  return _client
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchImageBase64(url: string): Promise<{ bytes: string; mime: string; buf: Buffer }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download da imagem falhou (${res.status})`)
  const ct   = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  const buf  = Buffer.from(await res.arrayBuffer())
  return { bytes: buf.toString('base64'), mime, buf }
}

// Vertex só aceita 16:9 | 9:16. 'auto' (manter proporção) vira o mais
// próximo da imagem base — retrato → 9:16, resto → 16:9.
async function resolveAspectRatio(requested: string | undefined, imageBuf: Buffer): Promise<'16:9' | '9:16'> {
  if (requested === '16:9' || requested === '9:16') return requested
  try {
    const sharp = (await import('sharp')).default
    const meta  = await sharp(imageBuf).metadata()
    if (meta.width && meta.height && meta.height > meta.width) return '9:16'
  } catch {
    // metadata é best-effort — cai no default paisagem
  }
  return '16:9'
}

// Sobe o MP4 pro Storage e devolve a URL (o CDN do provider não existe aqui).
// Mesmo bucket/convenção de chave do uploadEditAsset (space-mestres).
async function uploadVideoToStorage(buf: Buffer, userId: string): Promise<string> {
  const admin = createAdminClient()
  const rand  = Math.random().toString(36).slice(2, 8)
  const key   = `${userId}/animar/${Date.now()}-${rand}.mp4`
  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(key, buf, { contentType: 'video/mp4', upsert: false })
  if (error) throw new Error('upload do vídeo pro Storage falhou: ' + error.message)
  const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(key)
  return data.publicUrl
}

export const vertexVeoAdapter: VideoAdapter = {
  id:          'vertex',
  isAvailable: () => enabled() && hasCredentials(),

  async generate(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const model = process.env.VERTEX_VEO_MODEL_ID?.trim() || DEFAULT_VERTEX_VEO_MODEL

    // ── Fase de submit — qualquer falha aqui cai pro fal (nada foi cobrado
    //    no Vertex ainda; latência de fallback é pequena) ───────────────────
    let operation
    try {
      const image  = await fetchImageBase64(req.imageUrl)
      const aspect = await resolveAspectRatio(req.aspectRatio, image.buf)
      const lastFrame = req.endImageUrl ? await fetchImageBase64(req.endImageUrl) : null

      console.log('[vertexVeo] model :', model, '| aspect:', aspect, '| duration:', req.duration)

      operation = await client().models.generateVideos({
        model,
        prompt: req.prompt,
        image:  { imageBytes: image.bytes, mimeType: image.mime },
        config: {
          durationSeconds: Number.parseInt(req.duration, 10) || 8,
          aspectRatio:     aspect,
          resolution:      req.resolution ?? '1080p',
          negativePrompt:  req.negativePrompt,
          generateAudio:   req.generateAudio ?? false,
          numberOfVideos:  1,
          ...(lastFrame ? { lastFrame: { imageBytes: lastFrame.bytes, mimeType: lastFrame.mime } } : {}),
        },
      })
    } catch (err) {
      console.error('[vertexVeo] submit falhou — fallback pro fal:', (err as Error).message)
      if (falAdapter.isAvailable()) {
        const viaFal = await falAdapter.generate(req)
        return { ...viaFal, provider: 'fal' }
      }
      throw err
    }

    // ── Poll até concluir (falha aqui propaga — a rota faz o refund) ────────
    const startedAt = Date.now()
    let pollErrors  = 0
    while (!operation.done) {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error(`Vertex Veo não concluiu em ${MAX_WAIT_MS / 1000}s (operation: ${operation.name ?? '?'})`)
      }
      await sleep(POLL_INTERVAL_MS)
      try {
        operation = await client().operations.getVideosOperation({ operation })
        pollErrors = 0
      } catch (err) {
        // Erros transientes de polling não podem matar uma geração já paga.
        pollErrors += 1
        console.warn(`[vertexVeo] poll falhou (${pollErrors}/3):`, (err as Error).message)
        if (pollErrors >= 3) throw err
      }
    }

    if (operation.error) {
      const msg = typeof operation.error.message === 'string'
        ? operation.error.message
        : JSON.stringify(operation.error)
      throw new Error(`Vertex Veo retornou erro: ${msg}`)
    }

    const response = operation.response
    const video    = response?.generatedVideos?.[0]?.video
    if (!video?.videoBytes) {
      if (response?.raiMediaFilteredCount) {
        const reason = response.raiMediaFilteredReasons?.[0] ?? 'política de conteúdo'
        throw new Error(`O Vertex filtrou o vídeo gerado (${reason}). Ajuste a imagem ou a direção criativa.`)
      }
      throw new Error('Vertex Veo não devolveu vídeo (sem videoBytes na resposta).')
    }

    console.log('[vertexVeo] concluído em', Math.round((Date.now() - startedAt) / 1000), 's — re-hospedando no Storage')
    const outputUrl = await uploadVideoToStorage(
      Buffer.from(video.videoBytes, 'base64'),
      req.userId ?? 'anonimo',
    )

    return {
      outputUrl,
      provider:  'vertex',
      requestId: operation.name ?? null,
      metadata:  { model, operationName: operation.name ?? null },
    }
  },
}
