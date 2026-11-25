// lib/bench-v3/image-adapters.ts
//
// Camada 2 da bancada: uma chamada de geração por fornecedor, com o ID de
// modelo vindo do catálogo. Os adaptadores de produção (lib/ai/ark,
// lib/ai/google, lib/orion) têm o modelo fixo no tipo; aqui o modelo é
// parâmetro para comparar versões novas sem mexer na produção.
//
// Nada de prompt, imagem ou chave nos logs (AL-9). Erro do fornecedor sobe
// com status e mensagem curta.

import sharp from 'sharp'
import { fal } from '@fal-ai/client'
import { GoogleGenAI, Modality, createPartFromBase64, createPartFromText } from '@google/genai'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'
import { orionTargetSize } from '@/lib/orion/config'
import { estimateOrionCostUsd, parseOpenAiUsage } from '@/lib/orion/pricing'
import { long2048, type ImageEngine } from './catalog'

export interface ImageInput {
  buffer: Buffer
  mime: string
  width: number
  height: number
}

export interface ImageOutcome {
  buffer: Buffer
  width: number | null
  height: number | null
  /** Custo em US$; null quando o fornecedor não informa (cobra-se o teto). */
  costUsd: number | null
  costSource: 'area' | 'tokens' | 'estimativa' | 'tarifa'
  provider: string
  providerModel: string
  requestId: string | null
  latencyMs: number
  requestedSize: string
}

export class ImageCallError extends Error {
  constructor(readonly provider: string, message: string, readonly status: number | null = null) {
    super(`${provider}: ${message}`.slice(0, 300))
    this.name = 'ImageCallError'
  }
}

const dataUrl = (i: ImageInput) => `data:${i.mime};base64,${i.buffer.toString('base64')}`

async function dims(buf: Buffer): Promise<{ width: number | null; height: number | null }> {
  const m = await sharp(buf).metadata().catch(() => null)
  return { width: m?.width ?? null, height: m?.height ?? null }
}

async function withTimeout<T>(p: Promise<T>, ms: number, provider: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => { t = setTimeout(() => rej(new ImageCallError(provider, `timeout ${ms}ms`)), ms) }),
    ])
  } finally { clearTimeout(t) }
}

function requireKey(name: string, provider: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new ImageCallError(provider, `${name} ausente`)
  return v
}

// ── ModelArk (Seedream direto) ───────────────────────────────────────────────

async function viaArk(engine: ImageEngine, prompt: string, input: ImageInput): Promise<ImageOutcome> {
  const key = requireKey('ARK_API_KEY', 'ark')
  const base = (process.env.ARK_BASE_URL?.trim() || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '')
  const target = engine.size === 'preset2k' ? null : long2048(input.width, input.height)
  const size = target ? `${target.width}x${target.height}` : '2K'
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), engine.timeoutMs)
  try {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: engine.model, prompt, image: dataUrl(input), size,
        output_format: 'png', response_format: 'b64_json', watermark: false,
      }),
      signal: ctrl.signal,
    })
    const json = await res.json().catch(() => null) as
      { data?: { b64_json?: string; size?: string }[]; error?: { message?: string } } | null
    if (!res.ok || json?.error) throw new ImageCallError('ark', json?.error?.message ?? `HTTP ${res.status}`, res.status)
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) throw new ImageCallError('ark', 'sem imagem na resposta')
    const buffer = Buffer.from(b64, 'base64')
    const d = await dims(buffer)
    const pixels = (d.width ?? 0) * (d.height ?? 0)
    return {
      buffer, ...d,
      costUsd: pixels > 0 && engine.costForPixels ? engine.costForPixels(pixels, 1) : null,
      costSource: 'area', provider: 'ark', providerModel: engine.model,
      requestId: res.headers.get('x-request-id'), latencyMs: Date.now() - started, requestedSize: size,
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new ImageCallError('ark', `timeout ${engine.timeoutMs}ms`)
    throw err
  } finally { clearTimeout(timer) }
}

// ── fal ──────────────────────────────────────────────────────────────────────

async function viaFal(engine: ImageEngine, endpoint: string, prompt: string, input: ImageInput): Promise<ImageOutcome> {
  fal.config({ credentials: requireKey('FAL_KEY', 'fal') })
  const started = Date.now()
  const uploaded = await fal.storage.upload(new File([new Uint8Array(input.buffer)], 'bench-input', { type: input.mime }))
  const target = engine.size === 'preset2k' ? null : long2048(input.width, input.height)
  const result = await withTimeout(
    fal.subscribe(endpoint, {
      input: {
        prompt, image_urls: [uploaded], num_images: 1,
        image_size: target ?? 'auto_2K',
      } as never,
    }),
    engine.timeoutMs, 'fal',
  ).catch((err: unknown) => {
    if (err instanceof ImageCallError) throw err
    const e = err as { status?: number; message?: string }
    throw new ImageCallError('fal', e?.message ?? 'falha', typeof e?.status === 'number' ? e.status : null)
  })
  const url = (result as { data?: { images?: { url?: string }[] } }).data?.images?.[0]?.url
  if (!url) throw new ImageCallError('fal', 'sem imagem na resposta')
  const res = await fetch(url)
  if (!res.ok) throw new ImageCallError('fal', `download HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return {
    buffer, ...(await dims(buffer)),
    // A fal não devolve custo neste endpoint: vale a tarifa do catálogo.
    costUsd: engine.falUsd ?? engine.maxUsd, costSource: 'tarifa', provider: 'fal', providerModel: endpoint,
    requestId: (result as { requestId?: string }).requestId ?? null,
    latencyMs: Date.now() - started, requestedSize: target ? `${target.width}x${target.height}` : 'auto_2K',
  }
}

// ── Gemini API (Nano Banana) ─────────────────────────────────────────────────

/** Preço por imagem 2K do Nano Banana 2.1 + entrada por token (secundário). */
export const NB21_OUTPUT_2K_USD = 0.0504
export const NB21_INPUT_USD_PER_MTOK = 1.5

async function viaGemini(engine: ImageEngine, prompt: string, input: ImageInput): Promise<ImageOutcome> {
  const ai = new GoogleGenAI({ apiKey: requireKey('GEMINI_API_KEY', 'gemini') })
  const aspectRatio = nearestSupportedAspectRatio(input.width, input.height) ?? undefined
  const started = Date.now()
  const response = await withTimeout(ai.models.generateContent({
    model: engine.model,
    contents: [createPartFromText(prompt), createPartFromBase64(input.buffer.toString('base64'), input.mime)],
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
      imageConfig: { imageSize: '2K', ...(aspectRatio ? { aspectRatio } : {}) },
      temperature: 0.2,
    },
  }), engine.timeoutMs, 'gemini').catch((err: unknown) => {
    if (err instanceof ImageCallError) throw err
    throw new ImageCallError('gemini', (err as Error).message ?? 'falha')
  })
  const inline = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
  if (!inline?.data) throw new ImageCallError('gemini', 'sem imagem na resposta')
  const buffer = Buffer.from(inline.data, 'base64')
  const promptTokens = response.usageMetadata?.promptTokenCount
  return {
    buffer, ...(await dims(buffer)),
    costUsd: typeof promptTokens === 'number'
      ? NB21_OUTPUT_2K_USD + promptTokens * NB21_INPUT_USD_PER_MTOK / 1_000_000
      : null,
    costSource: 'estimativa', provider: 'gemini', providerModel: engine.model,
    requestId: response.responseId ?? null, latencyMs: Date.now() - started,
    requestedSize: `2K ${aspectRatio ?? 'auto'}`,
  }
}

// ── OpenAI Images (GPT Image) ────────────────────────────────────────────────

async function viaOpenAi(engine: ImageEngine, prompt: string, input: ImageInput): Promise<ImageOutcome> {
  const key = requireKey('OPENAI_API_KEY', 'openai')
  const size = orionTargetSize(input.width, input.height, '2k')
  const form = new FormData()
  form.append('model', engine.model)
  form.append('prompt', prompt)
  form.append('size', `${size.width}x${size.height}`)
  form.append('quality', 'high')
  form.append('n', '1')
  form.append('output_format', 'png')
  form.append('image[]', new Blob([new Uint8Array(input.buffer)], { type: input.mime }), 'ref-1.png')
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), engine.timeoutMs)
  try {
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: ctrl.signal,
    })
    const json = await res.json().catch(() => null) as
      { data?: { b64_json?: string }[]; usage?: unknown; error?: { message?: string } } | null
    if (!res.ok || json?.error) throw new ImageCallError('openai', json?.error?.message ?? `HTTP ${res.status}`, res.status)
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) throw new ImageCallError('openai', 'sem imagem na resposta')
    const buffer = Buffer.from(b64, 'base64')
    return {
      buffer, ...(await dims(buffer)),
      costUsd: estimateOrionCostUsd(parseOpenAiUsage(json?.usage)).usd,
      costSource: 'tokens', provider: 'openai', providerModel: engine.model,
      requestId: res.headers.get('x-request-id'), latencyMs: Date.now() - started,
      requestedSize: `${size.width}x${size.height}`,
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new ImageCallError('openai', `timeout ${engine.timeoutMs}ms`)
    throw err
  } finally { clearTimeout(timer) }
}

/** Rota efetiva: Ark sem chave cai para a fal quando o motor tem endpoint lá. */
export function resolveRoute(engine: ImageEngine): { kind: ImageEngine['provider']; target: string } {
  const forced = process.env.BENCH_V3_SEEDREAM_ROUTE?.trim()
  if (engine.provider === 'ark' && engine.falEndpoint && (forced === 'fal' || !process.env.ARK_API_KEY?.trim())) {
    return { kind: 'fal', target: engine.falEndpoint }
  }
  return { kind: engine.provider, target: engine.model }
}

export async function generateBenchImage(engine: ImageEngine, prompt: string, input: ImageInput): Promise<ImageOutcome> {
  const route = resolveRoute(engine)
  switch (route.kind) {
    case 'ark':    return viaArk(engine, prompt, input)
    case 'fal':    return viaFal(engine, route.target, prompt, input)
    case 'gemini': return viaGemini(engine, prompt, input)
    case 'openai': return viaOpenAi(engine, prompt, input)
  }
}
