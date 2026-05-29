// lib/gemini.ts
//
// Helpers de saída estruturada (JSON) do Gemini direto (@google/genai), usados
// pela análise de texto/visão do produto: DNA visual + briefing + verifyDna
// (Spaces/Renderizar) e moodboard + carousel copy (Apresentar).
//
// Por que existe: essas chamadas rodavam no gateway FAL `any-llm` /
// `any-llm/vision`, que ficou instável — `anthropic/claude-3.5-sonnet` morreu lá
// (400 "Provider returned error") e o gpt-4o oscilava/truncava. Gemini direto
// remove a dependência do gateway flaky.
//
// Notas de integração (@google/genai 2.4.0):
//   - Imagem vai INLINE (base64) — Gemini não busca URL. Baixamos antes.
//   - `responseMimeType: 'application/json'` força JSON puro (sem ```fences).
//   - `thinkingConfig.thinkingBudget: 0` desliga o "thinking" do 2.5 — senão ele
//     consome os maxOutputTokens pensando e devolve JSON truncado/vazio.

import { GoogleGenAI, createPartFromBase64, createPartFromText, type Part } from '@google/genai'

export const GEMINI_MODEL = 'gemini-2.5-flash'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_TOKENS = 1200

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada')
    _client = new GoogleGenAI({ apiKey })
  }
  return _client
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), ms),
    ),
  ])
}

// Baixa a imagem e devolve um Part inline (base64) — formato que o Gemini exige.
// Defaulta pra image/jpeg quando o content-type não é uma imagem.
async function fetchImagePart(imageUrl: string): Promise<Part> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`image fetch ${res.status}`)
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mimeType = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return createPartFromBase64(buf.toString('base64'), mimeType)
}

async function generate(
  system:      string,
  parts:       Part[],
  temperature: number,
  maxTokens:   number,
): Promise<string> {
  const response = await client().models.generateContent({
    model:    GEMINI_MODEL,
    contents: parts,
    config: {
      systemInstruction: system,
      temperature,
      maxOutputTokens:   maxTokens,
      responseMimeType:  'application/json',
      thinkingConfig:    { thinkingBudget: 0 },
    },
  })
  const text = response.text
  if (!text) throw new Error('Gemini returned empty output')
  return text
}

export interface GeminiVisionOpts {
  system:       string
  user:         string
  imageUrl:     string
  temperature?: number
  maxTokens?:   number
  timeoutMs?:   number
}

// Visão: prompt + imagem (inline). Lança em erro/timeout/output vazio — o caller
// decide retry/fallback. O timeout cobre o fetch da imagem + a geração.
export async function geminiVisionJson(opts: GeminiVisionOpts): Promise<string> {
  return withTimeout(
    (async () => {
      const imagePart = await fetchImagePart(opts.imageUrl)
      return generate(
        opts.system,
        [createPartFromText(opts.user), imagePart],
        opts.temperature ?? 0.1,
        opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      )
    })(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
}

export interface GeminiTextOpts {
  system:       string
  user:         string
  temperature?: number
  maxTokens?:   number
  timeoutMs?:   number
}

// Texto puro (sem imagem). Mesmo contrato do geminiVisionJson.
export async function geminiTextJson(opts: GeminiTextOpts): Promise<string> {
  return withTimeout(
    generate(
      opts.system,
      [createPartFromText(opts.user)],
      opts.temperature ?? 0.4,
      opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    ),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
}
