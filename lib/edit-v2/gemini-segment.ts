// lib/edit-v2/gemini-segment.ts
//
// Segmentação de alvo por Gemini Vision (motor PRIMÁRIO do Trocar material v2).
// Uma única chamada recebe imagem + overlay verde da região + instrução PT e
// devolve, em JSON: label/descrição/localização + box_2d + mask (PNG base64) +
// confidence + exclusões + uma frase EN (reaproveitada pelo fallback evf-sam,
// evitando uma 2ª chamada ao Gemini).
//
// Isolado em lib/edit-v2 com @google/genai direto (NÃO usa lib/gemini.ts, que
// fixa thinkingBudget:0 — segmentação se beneficia de algum "thinking"). Tetos
// EXPLÍCITOS de custo: thinkingBudget e maxOutputTokens limitados (qualidade
// alta o bastante p/ a máscara, sem resposta ilimitada).

import { GoogleGenAI, createPartFromBase64, createPartFromText } from '@google/genai'

export interface GeminiSegmentResult {
  label: string
  description: string
  location: string
  /** Frase EN p/ o fallback evf-sam (ex.: "wood wall panels"). */
  targetPhraseEn: string
  /** box_2d cru [ymin, xmin, ymax, xmax] 0–1000, ou null. */
  box2d: number[] | null
  /** PNG base64 da máscara dentro da box, ou null. */
  maskBase64: string | null
  /** 0–1; baixa confiança → o chamador cai p/ fallback. */
  confidence: number
  exclusions: string[]
  used: boolean
  durationMs: number
  costUsdEstimated: number
}

const MODEL = process.env.GEMINI_SEGMENT_MODEL?.trim() || 'gemini-2.5-flash'
// Tetos explícitos (qualidade alta da máscara, custo limitado):
const MAX_OUTPUT_TOKENS = 8192
const THINKING_BUDGET = 1024
// GERAÇÃO DE MÁSCARA é lenta (gemini "desenha" o mapa de probabilidade — não é
// texto/box, que sai em ~5s). O teste de 2026-06-12 estourou os 30s antigos
// (timeout, não erro de alvo). 75s acomoda a máscara; cabe no maxDuration=120
// da rota. Override por env.
const TIMEOUT_MS = Number(process.env.GEMINI_SEGMENT_TIMEOUT_MS) || 75_000
// Estimativa conservadora p/ telemetria (output grande c/ máscara base64 +
// thinking). O teste pago fecha o número real.
const COST_USD = 0.02

const SYSTEM = `You are the target segmenter of an architectural image editor for
architects and interior designers. You receive: (1) an interior/architectural photo,
(2) the SAME photo with a GREEN highlight over the region the user roughly circled,
and (3) the user's edit instruction in Portuguese.

Identify the SINGLE architectural surface/element the user wants to change material on
— the dominant surface under/near the green region, guided by the instruction (a wall,
the floor, a set of wood panels, a countertop, the ceiling, a cabinetry run). Return its
tight segmentation. Exclude objects sitting ON or IN FRONT of it (rug, bed, sofa, chairs,
lamp, plants, frames). Output JSON only, no prose.`

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (_client) return _client
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada')
  _client = new GoogleGenAI({ apiKey })
  return _client
}

async function inlinePart(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`image fetch ${res.status}`)
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return createPartFromBase64(buf.toString('base64'), mime)
}

interface SegLlmOutput {
  label?: unknown
  description?: unknown
  location?: unknown
  target_phrase_en?: unknown
  box_2d?: unknown
  mask?: unknown
  confidence?: unknown
  exclusions?: unknown
}

/** Alguns retornos vêm como array de itens — pega o de maior confiança. */
function pickItem(parsed: unknown): SegLlmOutput | null {
  if (Array.isArray(parsed)) {
    const items = parsed.filter(x => x && typeof x === 'object') as SegLlmOutput[]
    if (items.length === 0) return null
    return items.sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))[0]
  }
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    if (Array.isArray(o.items)) return pickItem(o.items)
    if (Array.isArray(o.boxes)) return pickItem(o.boxes)
    return o as SegLlmOutput
  }
  return null
}

export interface GeminiSegmentOpts {
  imageUrl: string
  regionOverlayUrl: string
  instructionPt: string
  enabled: boolean
  timeoutMs?: number
}

export async function geminiSegmentTarget(opts: GeminiSegmentOpts): Promise<GeminiSegmentResult> {
  const empty: GeminiSegmentResult = {
    label: '', description: '', location: '', targetPhraseEn: 'the highlighted surface',
    box2d: null, maskBase64: null, confidence: 0, exclusions: [],
    used: false, durationMs: 0, costUsdEstimated: 0,
  }
  if (!opts.enabled) return empty

  const startedAt = Date.now()
  try {
    const [imgPart, overlayPart] = await Promise.all([
      inlinePart(opts.imageUrl),
      inlinePart(opts.regionOverlayUrl),
    ])
    const userPrompt = createPartFromText(JSON.stringify({
      user_instruction_pt: opts.instructionPt.trim() || '(sem texto — use só a região destacada)',
      images: ['1: original photo', '2: same photo with GREEN highlight on the user region'],
      output_schema: {
        label: 'string',
        description: 'string — short PT',
        location: 'string — short PT (ex.: parede esquerda)',
        target_phrase_en: 'string — concise EN phrase naming the element',
        box_2d: '[ymin, xmin, ymax, xmax] integers normalized 0-1000',
        mask: 'base64 PNG probability mask covering the element INSIDE box_2d',
        confidence: 'number 0-1',
        exclusions: 'string[] EN objects on top to exclude',
      },
    }))

    const result = await Promise.race([
      client().models.generateContent({
        model: MODEL,
        contents: [userPrompt, imgPart, overlayPart],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingBudget: THINKING_BUDGET },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('gemini-segment timeout')), opts.timeoutMs ?? TIMEOUT_MS),
      ),
    ])

    const text = result.text
    if (!text) return { ...empty, durationMs: Date.now() - startedAt }
    const item = pickItem(JSON.parse(text))
    if (!item) return { ...empty, durationMs: Date.now() - startedAt }

    const exclusions = Array.isArray(item.exclusions)
      ? item.exclusions.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12)
      : []
    const confidence = Number.isFinite(Number(item.confidence))
      ? Math.max(0, Math.min(1, Number(item.confidence)))
      : 0.5

    return {
      label: typeof item.label === 'string' ? item.label : '',
      description: typeof item.description === 'string' ? item.description : '',
      location: typeof item.location === 'string' ? item.location : '',
      targetPhraseEn:
        typeof item.target_phrase_en === 'string' && item.target_phrase_en.trim()
          ? item.target_phrase_en.trim()
          : (typeof item.label === 'string' && item.label.trim() ? item.label.trim() : empty.targetPhraseEn),
      box2d: Array.isArray(item.box_2d) ? (item.box_2d as number[]) : null,
      maskBase64: typeof item.mask === 'string' && item.mask.length > 0 ? item.mask : null,
      confidence,
      exclusions,
      used: true,
      durationMs: Date.now() - startedAt,
      costUsdEstimated: COST_USD,
    }
  } catch (err) {
    console.warn(`[edit-v2/gemini-segment] indisponível (${String((err as Error)?.message ?? err).slice(0, 120)}) — fallback`)
    return { ...empty, durationMs: Date.now() - startedAt }
  }
}
