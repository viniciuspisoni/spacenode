// ── Cliente LLM do orquestrador (function calling) ───────────────────────────
//
// Sessão stateful POR REQUEST sobre @google/genai: acumula os turnos
// (usuário → modelo → respostas de tools → modelo…) e expõe só dois
// resultados possíveis: "o modelo quer tools" ou "o modelo terminou em texto".
// O orquestrador não conhece o SDK; trocar de fornecedor = reimplementar
// NodiLlmSession (mesma filosofia da camada de provider da V1).
//
// Auth em dois modos, escolhidos por env (docs/NODI.md):
//   · padrão: GEMINI_API_KEY (a mesma chave já usada por DNA/briefing);
//   · NODI_V2_USE_VERTEX=1: Vertex AI via ADC (GOOGLE_APPLICATION_CREDENTIALS
//     + projeto/região) — o caminho da conta GCP própria, como o Veo.
//
// thinkingBudget:0 e maxOutputTokens curtos: o loop é quem "pensa" (tools),
// não o monólogo do modelo — segura custo e latência.

import { GoogleGenAI, type Content, type Part } from '@google/genai'

export const NODI_V2_DEFAULT_MODEL = 'gemini-2.5-flash'

export function nodiV2Model(): string {
  return (process.env.NODI_V2_MODEL ?? NODI_V2_DEFAULT_MODEL).trim()
}

export interface LlmFunctionDecl {
  name: string
  description: string
  parametersJsonSchema: Record<string, unknown>
}

export interface LlmToolCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

export type LlmStep =
  | { type: 'calls'; calls: LlmToolCall[] }
  | { type: 'text'; text: string }

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
}

export interface NodiLlmSession {
  /** primeiro turno (mensagem montada pelo orquestrador) */
  start(userTurn: string, opts?: { imageParts?: Part[] }): Promise<LlmStep>
  /** devolve os resultados das tools e recebe o próximo passo */
  continueWithToolResults(results: { call: LlmToolCall; output: unknown }[]): Promise<LlmStep>
  usage(): LlmUsage
}

let _client: GoogleGenAI | null = null
let _clientMode = ''

function client(): GoogleGenAI {
  const useVertex = process.env.NODI_V2_USE_VERTEX === '1'
  const mode = useVertex ? 'vertex' : 'apikey'
  if (_client && _clientMode === mode) return _client
  if (useVertex) {
    // Mesmos envs do image-provider/Veo (conta GCP própria): projeto + região
    // + credencial (JSON inline na Vercel, ou ADC via GOOGLE_APPLICATION_CREDENTIALS).
    const project = process.env.GOOGLE_VERTEX_PROJECT?.trim()
    const location = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
    if (!project) throw new Error('NODI_V2_USE_VERTEX=1 sem GOOGLE_VERTEX_PROJECT')
    const credsJson = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON
    _client = new GoogleGenAI({
      vertexai: true,
      project,
      location,
      ...(credsJson ? { googleAuthOptions: { credentials: JSON.parse(credsJson) } } : {}),
    })
  } else {
    const apiKey = process.env.GEMINI_API_KEY?.trim() // .trim() tira BOM/espaço (gotcha real da V1)
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada')
    _client = new GoogleGenAI({ apiKey })
  }
  _clientMode = mode
  return _client
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('NODI_LLM_TIMEOUT')), ms)),
  ])
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function isTransient(err: unknown): boolean {
  const e = err as { status?: unknown; message?: unknown }
  const status = typeof e?.status === 'number' ? e.status : undefined
  if (status !== undefined && [429, 500, 502, 503, 504].includes(status)) return true
  const msg = typeof e?.message === 'string' ? e.message : ''
  return /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|NODI_LLM_TIMEOUT/i.test(msg)
}

export interface CreateSessionOpts {
  system: string
  tools: LlmFunctionDecl[]
  maxOutputTokens: number
  /** timeout POR CHAMADA de modelo (o deadline do request governa por fora) */
  turnTimeoutMs: number
  temperature?: number
  model?: string
}

export function createNodiLlmSession(opts: CreateSessionOpts): NodiLlmSession {
  const model = opts.model ?? nodiV2Model()
  const contents: Content[] = []
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 }

  async function generate(): Promise<LlmStep> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await withTimeout(
          client().models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: opts.system,
              temperature: opts.temperature ?? 0.2,
              maxOutputTokens: opts.maxOutputTokens,
              thinkingConfig: { thinkingBudget: 0 },
              tools: [{ functionDeclarations: opts.tools }],
            },
          }),
          opts.turnTimeoutMs,
        )

        usage.inputTokens += response.usageMetadata?.promptTokenCount ?? 0
        usage.outputTokens += response.usageMetadata?.candidatesTokenCount ?? 0

        const modelContent = response.candidates?.[0]?.content
        if (modelContent) contents.push(modelContent)

        const calls = (response.functionCalls ?? [])
          .filter(c => typeof c.name === 'string' && c.name)
          .map(c => ({ id: c.id, name: c.name as string, args: (c.args ?? {}) as Record<string, unknown> }))
        if (calls.length > 0) return { type: 'calls', calls }

        return { type: 'text', text: (response.text ?? '').trim() }
      } catch (err) {
        lastErr = err
        if (attempt === 2 || !isTransient(err)) throw err
        await sleep(400 + Math.floor(Math.random() * 200))
      }
    }
    throw lastErr
  }

  return {
    async start(userTurn, o) {
      const parts: Part[] = [{ text: userTurn }, ...(o?.imageParts ?? [])]
      contents.push({ role: 'user', parts })
      return generate()
    },
    async continueWithToolResults(results) {
      const parts: Part[] = results.map(({ call, output }) => ({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { output } as Record<string, unknown>,
        },
      }))
      contents.push({ role: 'user', parts })
      return generate()
    },
    usage: () => ({ ...usage }),
  }
}
