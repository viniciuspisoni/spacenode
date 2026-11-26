// Chamada de visão com saída JSON estruturada nos três fornecedores das
// camadas 1 e 3. Cada chamada devolve o JSON já parseado, o uso de tokens e o
// custo estimado pela tarifa de config.ts.
//
// SERVER-ONLY e PAGO. Só é chamado pelo runner com BENCH3=1.
//
// Sem fallback de modelo de propósito: num bench, trocar de modelo em silêncio
// invalida a medida. Recusa e erro viram resultado com `error`.

import Anthropic from '@anthropic-ai/sdk'
import { llmModel, type LlmSpec } from './config'
import { llmCallUsd } from './economics'

export interface VisionImage { data: Buffer; mime: 'image/jpeg' | 'image/png' }
export interface VisionCall {
  spec: LlmSpec
  system: string
  user: string
  images: VisionImage[]
  schema: Record<string, unknown>
  schemaName: string
  timeoutMs?: number
}
export interface VisionResult<T> {
  ok: boolean
  data: T | null
  error: string | null
  model: string
  inputTokens: number
  outputTokens: number
  usd: number
  ms: number
}

/** Reduz cada imagem a ≤1568 px no lado maior em JPEG: mesmo detalhe útil, menos tokens. */
export async function prepImage(buf: Buffer, maxSide = 1568): Promise<VisionImage> {
  const sharp = (await import('sharp')).default
  const out = await sharp(buf).rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toBuffer()
  return { data: out, mime: 'image/jpeg' }
}

let anthropic: Anthropic | null = null

async function callAnthropic(c: VisionCall, model: string) {
  anthropic ??= new Anthropic()
  const res = await anthropic.messages.create({
    model,
    max_tokens: 16_000,
    system: c.system,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: c.schema } },
    messages: [{
      role: 'user',
      content: [
        ...c.images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mime, data: img.data.toString('base64') },
        })),
        { type: 'text' as const, text: c.user },
      ],
    }],
  }, { timeout: c.timeoutMs ?? 180_000 })
  if (res.stop_reason === 'refusal') throw new Error(`recusa (${res.stop_details?.category ?? 'sem categoria'})`)
  if (res.stop_reason === 'max_tokens') throw new Error('saída cortada em max_tokens')
  const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
  return { text, input: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0), output: res.usage.output_tokens }
}

async function callOpenAI(c: VisionCall, model: string) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(c.timeoutMs ?? 180_000),
    body: JSON.stringify({
      model,
      instructions: c.system,
      reasoning: { effort: 'medium' },
      input: [{
        role: 'user',
        content: [
          ...c.images.map(img => ({ type: 'input_image', image_url: `data:${img.mime};base64,${img.data.toString('base64')}`, detail: 'high' })),
          { type: 'input_text', text: c.user },
        ],
      }],
      text: { format: { type: 'json_schema', name: c.schemaName, schema: c.schema, strict: true } },
    }),
  })
  const body = await res.json() as {
    error?: { message?: string }
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>
    usage?: { input_tokens: number; output_tokens: number }
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? 'sem mensagem'}`)
  const parts = (body.output ?? []).filter(o => o.type === 'message').flatMap(o => o.content ?? [])
  const refusal = parts.find(p => p.type === 'refusal')
  if (refusal) throw new Error(`recusa: ${refusal.refusal ?? ''}`)
  const text = parts.filter(p => p.type === 'output_text').map(p => p.text ?? '').join('')
  return { text, input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 }
}

async function callGemini(c: VisionCall, model: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(c.timeoutMs ?? 180_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: c.system }] },
      contents: [{
        role: 'user',
        parts: [
          ...c.images.map(img => ({ inlineData: { mimeType: img.mime, data: img.data.toString('base64') } })),
          { text: c.user },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: c.schema, maxOutputTokens: 16_000 },
    }),
  })
  const body = await res.json() as {
    error?: { message?: string }
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? 'sem mensagem'}`)
  const cand = body.candidates?.[0]
  if (!cand || (cand.finishReason && cand.finishReason !== 'STOP')) throw new Error(`Gemini terminou com ${cand?.finishReason ?? 'sem candidato'}`)
  const text = (cand.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('')
  const u = body.usageMetadata ?? {}
  return { text, input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }
}

export async function visionJson<T>(c: VisionCall): Promise<VisionResult<T>> {
  const model = llmModel(c.spec)
  const started = Date.now()
  try {
    const r = c.spec.provider === 'anthropic' ? await callAnthropic(c, model)
      : c.spec.provider === 'openai' ? await callOpenAI(c, model)
      : await callGemini(c, model)
    const usd = llmCallUsd(c.spec, r.input, r.output)
    try {
      return { ok: true, data: JSON.parse(r.text) as T, error: null, model, inputTokens: r.input, outputTokens: r.output, usd, ms: Date.now() - started }
    } catch {
      return { ok: false, data: null, error: `JSON inválido: ${r.text.slice(0, 160)}`, model, inputTokens: r.input, outputTokens: r.output, usd, ms: Date.now() - started }
    }
  } catch (err) {
    // Custo desconhecido em erro: entra como 0 no ledger, marcado pelo `error`.
    return { ok: false, data: null, error: String((err as Error)?.message ?? err).slice(0, 300), model, inputTokens: 0, outputTokens: 0, usd: 0, ms: Date.now() - started }
  }
}

/** Confere, sem custo, se os IDs de modelo existem nas contas configuradas. */
export async function checkModels(specs: LlmSpec[]): Promise<Array<{ id: string; model: string; ok: boolean; note: string }>> {
  const out: Array<{ id: string; model: string; ok: boolean; note: string }> = []
  for (const s of specs) {
    const model = llmModel(s)
    try {
      if (s.provider === 'anthropic') {
        if (!process.env.ANTHROPIC_API_KEY) { out.push({ id: s.id, model, ok: false, note: 'falta ANTHROPIC_API_KEY no .env.local' }); continue }
        anthropic ??= new Anthropic()
        const m = await anthropic.models.retrieve(model)
        out.push({ id: s.id, model, ok: true, note: m.display_name })
      } else if (s.provider === 'openai') {
        const r = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } })
        out.push({ id: s.id, model, ok: r.ok, note: r.ok ? 'ok' : `HTTP ${r.status}` })
      } else {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' } })
        out.push({ id: s.id, model, ok: r.ok, note: r.ok ? 'ok' : `HTTP ${r.status}` })
      }
    } catch (err) {
      out.push({ id: s.id, model, ok: false, note: String((err as Error)?.message ?? err).slice(0, 120) })
    }
  }
  return out
}
