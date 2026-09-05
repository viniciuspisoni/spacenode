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
//   - Retry exponencial (generateWithRetry) em 503/429 — o flash satura em pico
//     de demanda e devolve 503 UNAVAILABLE; sem absorver isso, um pico virava
//     "Falha na análise da Vista Mestre" pro usuário.

import { GoogleGenAI, createPartFromBase64, createPartFromText, type Part } from '@google/genai'
import { fetchStorageBytes } from '@/lib/storage/fetch'

export const GEMINI_MODEL = 'gemini-2.5-flash'
const DEFAULT_TIMEOUT_MS     = 30_000
const DEFAULT_MAX_TOKENS     = 1200
const IMAGE_FETCH_TIMEOUT_MS = 15_000

// Retry de erro transiente. O gemini-2.5-flash devolve 503 UNAVAILABLE ("high
// demand") e 429 RESOURCE_EXHAUSTED em picos — erros que somem sozinhos em
// segundos. Sem backoff, um único pico derrubava a extração de DNA inteira com
// "Falha na análise da Vista Mestre", mesmo com a request seguinte voltando em
// segundos. Backoff exponencial absorve o pico e centraliza a resiliência pra
// todos os callers (DNA, briefing, verifyDna, moodboard, board).
const MAX_ATTEMPTS     = 3
const BASE_BACKOFF_MS  = 500
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

// ── Transporte: Vertex (projeto do dono) ou API direta (chave) ─────────────
//
// A API direta com GEMINI_API_KEY é um pool compartilhado: medido em
// 2026-09-05, o briefing de visão levou 49 s e o audit 19–40 s com 503 "high
// demand" em cadeia — era metade do tempo percebido de um render Vega. O
// Vertex usa a quota do projeto (mesma credencial dos renders de imagem) e
// não passa por esse pool. GEMINI_VIA_VERTEX=1 liga; GEMINI_VERTEX_LOCATION
// escolhe a região (default 'global'). Se o Vertex falhar com erro NÃO
// transiente (404 de modelo, permissão, credencial), a chamada cai UMA vez
// pra API direta — configuração errada nunca derruba DNA/briefing/audit.
type GeminiTransport = 'vertex' | 'direct'

function vertexConfigured(): boolean {
  return process.env.GEMINI_VIA_VERTEX === '1' &&
    !!process.env.GOOGLE_VERTEX_PROJECT?.trim() &&
    (!!process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim() || !!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
}

function primaryTransport(): GeminiTransport {
  return vertexConfigured() ? 'vertex' : 'direct'
}

let _vertexClient: GoogleGenAI | null = null
function vertexClient(): GoogleGenAI {
  if (!_vertexClient) {
    const project   = process.env.GOOGLE_VERTEX_PROJECT?.trim()
    const location  = process.env.GEMINI_VERTEX_LOCATION?.trim() || 'global'
    const credsJson = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
    _vertexClient = new GoogleGenAI({
      vertexai: true,
      project,
      location,
      ...(credsJson ? { googleAuthOptions: { credentials: JSON.parse(credsJson) } } : {}),
    })
  }
  return _vertexClient
}

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (!_client) {
    // .trim() sanitiza a chave: tira espaço/newline E o BOM (U+FEFF) — em JS o
    // trim() já remove U+FEFF. Valores de env podem chegar sujos: salvar a key
    // via pipe do PowerShell prepende um BOM, e como o SDK põe a chave num header
    // HTTP, esse BOM quebrava TODA chamada com "Cannot convert argument to a
    // ByteString ... value of 65279" (não é transiente nem quota — falha 100%).
    const apiKey = process.env.GEMINI_API_KEY?.trim()
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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Erro transiente do Gemini → vale retry. O ApiError do @google/genai expõe
// `.status` numérico (503/429/...); o fallback por regex cobre a mensagem JSON
// crua (path de streaming, "got status: 503"), o nosso GEMINI_TIMEOUT e o
// "empty output" (blip que o thinkingBudget:0 quase eliminou, mas barato de
// repetir). NÃO repete 400/401 nem JSON inválido — esses não se curam sozinhos.
function isRetryable(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; message?: unknown }
  const status = typeof e?.status === 'number' ? e.status
               : typeof e?.code   === 'number' ? e.code
               : undefined
  if (status !== undefined && RETRYABLE_STATUS.has(status)) return true
  const msg = typeof e?.message === 'string' ? e.message : ''
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|overloaded|high demand|GEMINI_TIMEOUT|empty output/i.test(msg)
}

// Baixa a imagem e devolve um Part inline (base64) — formato que o Gemini exige.
// Defaulta pra image/jpeg quando o content-type não é uma imagem.
async function fetchImagePart(imageUrl: string): Promise<Part> {
  // fetchStorageBytes: baixa via storage API se for bucket privado nosso (após o
  // flip); senão fetch HTTP. Inerte enquanto STORAGE_PRIVATE != '1'.
  const { buffer, contentType } = await fetchStorageBytes(imageUrl)
  const ct = contentType.split(';')[0]?.trim()
  const mimeType = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  return createPartFromBase64(buffer.toString('base64'), mimeType)
}

async function generateVia(
  transport:   GeminiTransport,
  system:      string,
  parts:       Part[],
  temperature: number,
  maxTokens:   number,
): Promise<string> {
  const sdk = transport === 'vertex' ? vertexClient() : client()
  const response = await sdk.models.generateContent({
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

async function generate(
  system:      string,
  parts:       Part[],
  temperature: number,
  maxTokens:   number,
): Promise<string> {
  const transport = primaryTransport()
  try {
    return await generateVia(transport, system, parts, temperature, maxTokens)
  } catch (err) {
    // Vertex com erro que não se cura sozinho (404 de modelo, 403, credencial)
    // → API direta, se houver chave. Transiente (503/429/timeout) segue pro
    // retry normal do mesmo transporte.
    if (transport === 'vertex' && !isRetryable(err) && process.env.GEMINI_API_KEY?.trim()) {
      console.warn(`[gemini] vertex falhou (${String((err as Error)?.message ?? err).slice(0, 140)}) — caindo pra API direta`)
      return generateVia('direct', system, parts, temperature, maxTokens)
    }
    throw err
  }
}

// generate + retry exponencial em erro transiente. Cada tentativa tem o timeout
// completo; entre elas, backoff curto (500ms, 1s + jitter) pra deixar o pico de
// demanda passar sem estourar o tempo de função. Erro não-transiente (400/401)
// propaga na hora — ver isRetryable pro que conta como transiente.
async function generateWithRetry(
  system:      string,
  parts:       Part[],
  temperature: number,
  maxTokens:   number,
  timeoutMs:   number,
): Promise<string> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(generate(system, parts, temperature, maxTokens), timeoutMs)
    } catch (err) {
      lastErr = err
      if (attempt === MAX_ATTEMPTS || !isRetryable(err)) throw err
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)
      console.warn(
        `[gemini] tentativa ${attempt}/${MAX_ATTEMPTS} falhou ` +
        `(${String((err as Error)?.message ?? err).slice(0, 140)}) — retry em ${backoff}ms`,
      )
      await sleep(backoff)
    }
  }
  throw lastErr
}

export interface GeminiVisionOpts {
  system:       string
  user:         string
  imageUrl:     string
  temperature?: number
  maxTokens?:   number
  timeoutMs?:   number
}

// Visão: prompt + imagem (inline). Já retenta erro transiente por dentro
// (generateWithRetry); só lança depois de esgotar as tentativas — aí o caller
// decide fallback. timeoutMs é por tentativa de geração; o fetch da imagem tem
// budget próprio (IMAGE_FETCH_TIMEOUT_MS).
export async function geminiVisionJson(opts: GeminiVisionOpts): Promise<string> {
  // Imagem baixada UMA vez (fora do retry — não re-baixa os MB a cada tentativa);
  // só a geração repete em pico de demanda.
  const imagePart = await withTimeout(fetchImagePart(opts.imageUrl), IMAGE_FETCH_TIMEOUT_MS)
  return generateWithRetry(
    opts.system,
    [createPartFromText(opts.user), imagePart],
    opts.temperature ?? 0.1,
    opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
}

export interface GeminiMultiVisionOpts {
  system:       string
  user:         string
  /** Múltiplas imagens, na ordem citada no prompt (ex.: original, editada, referência). */
  imageUrls:    string[]
  temperature?: number
  maxTokens?:   number
  timeoutMs?:   number
}

// Visão multi-imagem (ex.: comparar original × resultado × referência no quality
// gate semântico do Editar). Mesmo contrato/retry do geminiVisionJson.
export async function geminiMultiVisionJson(opts: GeminiMultiVisionOpts): Promise<string> {
  const imageParts = await Promise.all(
    opts.imageUrls.map(url => withTimeout(fetchImagePart(url), IMAGE_FETCH_TIMEOUT_MS)),
  )
  return generateWithRetry(
    opts.system,
    [createPartFromText(opts.user), ...imageParts],
    opts.temperature ?? 0.1,
    opts.maxTokens ?? DEFAULT_MAX_TOKENS,
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
  return generateWithRetry(
    opts.system,
    [createPartFromText(opts.user)],
    opts.temperature ?? 0.4,
    opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
}
