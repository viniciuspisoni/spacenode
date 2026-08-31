// lib/ai/gemini-knobs.ts
//
// Knobs de fidelidade da família Gemini 3 Image (Nano Banana 2 / Pro),
// compartilhados pelos DOIS caminhos Google: Vertex (lib/ai/image-provider) e
// API direta (lib/ai/google/editImage). Fonte: docs oficiais (ai.google.dev
// image-generation + guia Gemini 3, conferidos 2026-08-17).
//
//   media resolution — granularidade de TOKENIZAÇÃO das imagens de ENTRADA
//     (por parte, Gemini 3). Mais tokens = o modelo enxerga mais detalhe fino
//     da referência (bordas, esquadrias, veios, paginação de piso) — o modelo
//     não preserva o que ele nem "viu". 'ultra_high' existe só por parte.
//   thinking level — NB2 (gemini-3.1-flash-image) tem thinking configurável
//     ('minimal' é o default de fábrica; 'high' opcional): thinking alto faz o
//     modelo planejar a cena antes de gerar e aderir melhor a contratos longos
//     de preservação. O Pro pensa sempre (sem knob); o 2.5 não pensa.
//
// CLIENT-SAFE: só strings e process.env — sem imports de SDK.
//
// Envs (kill-switches de rollback; os defaults ligados vivem NO CÓDIGO — não
// precisa setar nada na Vercel pra ativar):
//   IMAGE_INPUT_MEDIA_RESOLUTION = off | low | medium | high | ultra_high (default high)
//   IMAGE_NB2_THINKING_LEVEL     = off | minimal | high                   (default high)

export type InputMediaResolution = 'low' | 'medium' | 'high' | 'ultra_high'
export type Nb2ThinkingLevel = 'minimal' | 'high'

export function inputMediaResolutionDefault(): InputMediaResolution | null {
  const raw = process.env.IMAGE_INPUT_MEDIA_RESOLUTION?.trim().toLowerCase()
  if (raw === 'off' || raw === '0') return null
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'ultra_high') return raw
  return 'high'
}

export function nb2ThinkingLevel(): Nb2ThinkingLevel | null {
  const raw = process.env.IMAGE_NB2_THINKING_LEVEL?.trim().toLowerCase()
  if (raw === 'off' || raw === '0') return null
  if (raw === 'minimal') return 'minimal'
  return 'high'
}

/** Request inválida do generateContent (knob não aceito pelo modelo/endpoint).
 *  Usado pelo retry "compat" dos caminhos Google: remove os knobs novos e
 *  tenta 1x de novo ANTES de qualquer fallback — um knob rejeitado nunca pode
 *  degradar o caminho primário inteiro (lição do incidente -preview de
 *  2026-07-24, quando um 404 silencioso mandou tudo pro fallback). */
export function isInvalidArgumentError(err: unknown): boolean {
  if ((err as { status?: number })?.status === 400) return true
  const msg = (err as Error)?.message ?? String(err)
  return /INVALID_ARGUMENT|Unknown name|Invalid JSON payload/i.test(msg)
}

/** Erro TRANSIENTE de capacidade do Gemini — vale repetir, não vale cair pro
 *  fallback. O 429 do Vertex nos modelos de imagem vem genérico ("Resource
 *  exhausted. Please try again later", SEM quota_metric/violations): é a
 *  capacidade COMPARTILHADA do endpoint global acabando, não quota do projeto
 *  estourada — some sozinho em segundos e não tem relação com o nosso volume
 *  (dezenas de imagens/dia). Mesma classificação do isRetryable do lib/gemini
 *  (texto), que já absorve isso desde sempre; o caminho de IMAGEM não tinha,
 *  então cada 429 custava uma geração inteira no provider caro.
 *  NÃO inclui 400/401/403/404 — esses não se curam sozinhos. */
export function isTransientCapacityError(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; message?: unknown }
  const status = typeof e?.status === 'number' ? e.status
               : typeof e?.code   === 'number' ? e.code
               : undefined
  if (status !== undefined) return status === 429 || (status >= 500 && status <= 504)
  const msg = typeof e?.message === 'string' ? e.message : String(err)
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL|overloaded|high demand/i.test(msg)
}
