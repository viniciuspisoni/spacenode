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

/** Falha TRANSITÓRIA do Vertex/Google — capacidade/quota (429 RESOURCE_EXHAUSTED,
 *  frequente no gemini-3-pro-image em horário de pico), blip de servidor (500/503)
 *  ou rede. É o caso em que tentar DE NOVO no caminho primário costuma resolver
 *  em segundos; cair direto pro fallback FAL troca crédito GCP por fatura FAL sem
 *  necessidade (incidente 2026-08-14: ~50% do vega caiu na FAL numa janela de 3h
 *  de 429 intermitente). Erros de contrato (400/404) NUNCA entram aqui — retry
 *  não conserta request inválida. */
export function isTransientProviderError(err: unknown): boolean {
  const status = (err as { status?: number })?.status
  if (status === 429 || status === 500 || status === 503) return true
  const msg = (err as Error)?.message ?? String(err)
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|model is overloaded|try again later|ECONNRESET|fetch failed|socket hang up/i.test(msg)
}
