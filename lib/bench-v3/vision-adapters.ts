// lib/bench-v3/vision-adapters.ts
//
// Camadas 1 e 3 da bancada: uma chamada multimodal (imagens + texto → texto)
// por fornecedor. Todas recebem as MESMAS imagens, reduzidas para no máximo
// 2048 px no lado maior, para a comparação ser justa e caber nos limites de
// cada API. O custo sai dos tokens que o fornecedor devolve.
//
// Claude: sem `fallbacks` de propósito. Numa bancada, cair para outro modelo
// mudaria o que está sendo medido; uma recusa é registrada como recusa.

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { GoogleGenAI, createPartFromBase64, createPartFromText } from '@google/genai'
import { tokenCostUsd, type VisionModel } from './catalog'

export interface VisionImage { buffer: Buffer; mime: string }

export interface VisionRequest {
  system: string
  user: string
  images: VisionImage[]
  maxOutputTokens: number
  /** Esforço de raciocínio quando o modelo aceita (Claude). */
  effort?: 'low' | 'medium' | 'high'
  timeoutMs?: number
}

export interface VisionOutcome {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
  latencyMs: number
  refused: boolean
  providerModel: string
}

export class VisionCallError extends Error {
  constructor(readonly provider: string, message: string, readonly status: number | null = null) {
    super(`${provider}: ${message}`.slice(0, 300))
    this.name = 'VisionCallError'
  }
}

export const VISION_MAX_EDGE = 2048

/** Reduz para o lado maior ≤ 2048 px e converte para JPEG q90. */
export async function prepareVisionImage(buffer: Buffer): Promise<VisionImage> {
  const out = await sharp(buffer).rotate()
    .resize({ width: VISION_MAX_EDGE, height: VISION_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toBuffer()
  return { buffer: out, mime: 'image/jpeg' }
}

function key(name: string, provider: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new VisionCallError(provider, `${name} ausente`)
  return v
}

const cost = (m: VisionModel, i: number | null, o: number | null) =>
  i === null || o === null ? null : tokenCostUsd(m, i, o)

async function viaAnthropic(m: VisionModel, r: VisionRequest): Promise<VisionOutcome> {
  const client = new Anthropic({ apiKey: key('ANTHROPIC_API_KEY', 'anthropic'), timeout: r.timeoutMs ?? 180_000, maxRetries: 2 })
  const started = Date.now()
  const content: Anthropic.ContentBlockParam[] = [
    ...r.images.map((img): Anthropic.ImageBlockParam => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mime as 'image/jpeg', data: img.buffer.toString('base64') },
    })),
    { type: 'text', text: r.user },
  ]
  try {
    const res = await client.messages.create({
      model: m.model,
      max_tokens: r.maxOutputTokens,
      system: r.system,
      ...(r.effort ? { output_config: { effort: r.effort } } : {}),
      messages: [{ role: 'user', content }],
    })
    const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n')
    const i = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0)
    const o = res.usage.output_tokens
    return { text, inputTokens: i, outputTokens: o, costUsd: cost(m, i, o), latencyMs: Date.now() - started, refused: res.stop_reason === 'refusal', providerModel: res.model }
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw new VisionCallError('anthropic', err.message, err.status ?? null)
    throw new VisionCallError('anthropic', (err as Error).message)
  }
}

async function viaGemini(m: VisionModel, r: VisionRequest): Promise<VisionOutcome> {
  const ai = new GoogleGenAI({ apiKey: key('GEMINI_API_KEY', 'gemini') })
  const started = Date.now()
  try {
    const res = await ai.models.generateContent({
      model: m.model,
      contents: [createPartFromText(r.user), ...r.images.map(img => createPartFromBase64(img.buffer.toString('base64'), img.mime))],
      config: { systemInstruction: r.system, maxOutputTokens: r.maxOutputTokens, responseMimeType: 'application/json' },
    })
    const u = res.usageMetadata
    const i = u?.promptTokenCount ?? null
    // Tokens de raciocínio são cobrados como saída.
    const o = u?.candidatesTokenCount != null ? u.candidatesTokenCount + (u.thoughtsTokenCount ?? 0) : null
    const blocked = res.promptFeedback?.blockReason != null || res.candidates?.[0]?.finishReason === 'SAFETY'
    return { text: res.text ?? '', inputTokens: i, outputTokens: o, costUsd: cost(m, i, o), latencyMs: Date.now() - started, refused: blocked, providerModel: m.model }
  } catch (err) {
    throw new VisionCallError('gemini', (err as Error).message)
  }
}

async function postJson(provider: string, url: string, apiKey: string, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body), signal: ctrl.signal,
    })
    const json = await res.json().catch(() => null) as Record<string, unknown> | null
    const error = json?.error as { message?: string } | undefined
    if (!res.ok || error) throw new VisionCallError(provider, error?.message ?? `HTTP ${res.status}`, res.status)
    return json ?? {}
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new VisionCallError(provider, `timeout ${timeoutMs}ms`)
    throw err
  } finally { clearTimeout(timer) }
}

const dataUrl = (img: VisionImage) => `data:${img.mime};base64,${img.buffer.toString('base64')}`
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Texto de uma resposta da Responses API (campo `output_text` ou blocos). */
export function openAiResponseText(json: Record<string, unknown>): string {
  if (typeof json.output_text === 'string') return json.output_text
  const out = Array.isArray(json.output) ? json.output as { content?: { type?: string; text?: string }[] }[] : []
  return out.flatMap(o => o.content ?? []).filter(c => c.type === 'output_text' && typeof c.text === 'string').map(c => c.text).join('\n')
}

async function viaOpenAi(m: VisionModel, r: VisionRequest): Promise<VisionOutcome> {
  const started = Date.now()
  const json = await postJson('openai', 'https://api.openai.com/v1/responses', key('OPENAI_API_KEY', 'openai'), {
    model: m.model,
    instructions: r.system,
    max_output_tokens: r.maxOutputTokens,
    input: [{
      role: 'user',
      content: [
        ...r.images.map(img => ({ type: 'input_image', image_url: dataUrl(img), detail: 'high' })),
        { type: 'input_text', text: r.user },
      ],
    }],
  }, r.timeoutMs ?? 180_000)
  const u = (json.usage ?? {}) as Record<string, unknown>
  const i = num(u.input_tokens), o = num(u.output_tokens)
  const refused = JSON.stringify(json.output ?? '').includes('"refusal"')
  return { text: openAiResponseText(json), inputTokens: i, outputTokens: o, costUsd: cost(m, i, o), latencyMs: Date.now() - started, refused, providerModel: String(json.model ?? m.model) }
}

async function viaXai(m: VisionModel, r: VisionRequest): Promise<VisionOutcome> {
  const started = Date.now()
  const json = await postJson('xai', 'https://api.x.ai/v1/chat/completions', key('XAI_API_KEY', 'xai'), {
    model: m.model,
    max_tokens: r.maxOutputTokens,
    messages: [
      { role: 'system', content: r.system },
      { role: 'user', content: [
        ...r.images.map(img => ({ type: 'image_url', image_url: { url: dataUrl(img), detail: 'high' } })),
        { type: 'text', text: r.user },
      ] },
    ],
  }, r.timeoutMs ?? 180_000)
  const u = (json.usage ?? {}) as Record<string, unknown>
  const i = num(u.prompt_tokens)
  const total = num(u.total_tokens)
  // Saída = total − entrada: inclui raciocínio sem contar duas vezes.
  const o = i !== null && total !== null ? total - i : num(u.completion_tokens)
  const choice = (json.choices as { message?: { content?: string; refusal?: string | null } }[] | undefined)?.[0]
  return { text: choice?.message?.content ?? '', inputTokens: i, outputTokens: o, costUsd: cost(m, i, o), latencyMs: Date.now() - started, refused: Boolean(choice?.message?.refusal), providerModel: String(json.model ?? m.model) }
}

export async function callVision(m: VisionModel, r: VisionRequest): Promise<VisionOutcome> {
  switch (m.provider) {
    case 'anthropic': return viaAnthropic(m, r)
    case 'gemini':    return viaGemini(m, r)
    case 'openai':    return viaOpenAi(m, r)
    case 'xai':       return viaXai(m, r)
  }
}
