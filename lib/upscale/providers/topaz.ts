// fal-ai/topaz/upscale/image — motor de PRECISÃO do Ampliar.
//
// Desde 2026-09-18 ele atende os três modos que ampliam (Alta Fidelidade,
// Recuperar Imagem Baixa e Melhoria Inteligente). O Clarity, que era o
// primário do Recuperar, virou só o fallback de emergência — a medição contra
// verdade de campo está em MEDICOES.md deste diretório: num recorte degradado
// (320×240, JPEG 35) recuperado a 2×, o Clarity devolveu geometry score 0,9307
// e edge recall 0,9207 — ABAIXO de um Lanczos burro (0,9802 / 0,9825) — porque
// funde as barras de um guarda-corpo num borrão. O Topaz High Fidelity V2 deu
// 0,9821 / 0,9854 no mesmo teste, com quase metade do desvio de cor (ΔE médio
// 1,90 contra 3,21) e 40% mais rápido.
//
// Params do endpoint (schema FAL conferido em 2026-09-18):
//   - upscale_factor: number, minimum 1, MAXIMUM 4 (ver MAX_UPSCALE_FACTOR).
//   - model: enum. 'Standard V2' (default do FAL) é da família mais solta;
//     'High Fidelity V2' é o preservador de detalhe — o certo pro contrato do
//     módulo. 'CGI' foi TESTADO e REPROVADO: apesar da descrição da Topaz
//     citar "rendered graphics", ele afina as linhas estruturais (barras de
//     guarda-corpo perdem peso), estoura o contraste e mais que dobra o desvio
//     de cor (ΔE médio 0,976 contra 0,414 do High Fidelity V2).
//   - face_enhancement: boolean, DEFAULT true, com face_enhancement_strength
//     0.8. Ninguém desligava. Render arquitetônico é cheio de figura humana de
//     escala, e "melhorar rosto" é redesenhar rosto — exatamente o elemento
//     inventado que o módulo promete não produzir. Vai explícito em false.
//   - output_format: enum, DEFAULT 'jpeg'. Recomprimir em JPEG logo depois de
//     pagar por detalhe é jogar fora o que se acabou de comprar: medido, o PNG
//     sobe o geometry score de 0,9903 pra 0,9923 e derruba o desvio de cor de
//     ΔE 0,514 pra 0,414 (−20%) no MESMO pedido.
//   - crop_to_fill: boolean. Default já é false; vai explícito porque
//     "preserva composição e proporções" é contrato, não sorte.

import { fal } from '@fal-ai/client'
import {
  MAX_UPSCALE_FACTOR,
  PROVIDER_ENDPOINTS,
  UpscaleProviderError,
  type ProviderCall,
} from '../types'

const ENDPOINT   = PROVIDER_ENDPOINTS.topaz
const TIMEOUT_MS = 240_000   // Topaz roda mais devagar que Clarity

// Acima disto o PNG deixa de ser entregável (um 4× de render 2 MP já dá ~40 MB;
// 64 MP passariam de 150 MB e travam download, re-hospedagem e e-mail). Daí pra
// cima o JPEG do provider é o mal menor — e só acontece em pedidos gigantes.
const PNG_MAX_OUTPUT_MP = 64

interface TopazOutput {
  image?:  { url?: string }
  images?: { url?: string }[]
}

export const callTopaz: ProviderCall = async ({ imageUrl, scale, params: overrides }) => {
  // Clamp no teto do schema. A UI e o custo já trabalham com effectiveFactor,
  // então isto só pega cliente antigo (plugin desatualizado) — e aí
  // requested_factor guarda a intenção original na telemetria.
  const requested = scale ?? 2
  const factor    = Math.max(1, Math.min(MAX_UPSCALE_FACTOR, requested))

  const outputMp = typeof overrides?.outputMegapixels === 'number'
    ? overrides.outputMegapixels
    : null

  const params: Record<string, unknown> = {
    upscale_factor:    factor,
    model:             'High Fidelity V2',
    // Preservação — os três que o default do FAL deixava contra nós.
    face_enhancement:  false,
    crop_to_fill:      false,
    subject_detection: 'All',
    output_format:     outputMp !== null && outputMp > PNG_MAX_OUTPUT_MP ? 'jpeg' : 'png',
  }

  // Overrides por modo (ex.: fix_compression no Recuperar). `outputMegapixels`
  // é sinal interno de roteamento, não param do FAL — campo desconhecido no
  // payload derruba o request.
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (k === 'outputMegapixels') continue
      if (v !== undefined) params[k] = v
    }
  }

  const loggedParams = requested !== factor
    ? { ...params, requested_factor: requested }
    : params

  const t0 = Date.now()
  let result: { data: unknown; requestId?: string }
  try {
    result = await Promise.race([
      fal.subscribe(ENDPOINT, {
        input: { image_url: imageUrl, ...params } as unknown as never,
      }) as Promise<{ data: unknown; requestId?: string }>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new UpscaleProviderError('topaz', 'timeout')), TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    if (err instanceof UpscaleProviderError) throw err
    throw new UpscaleProviderError('topaz', (err as Error).message ?? 'unknown', err)
  }

  const data = result.data as TopazOutput
  const url  = data.image?.url ?? data.images?.[0]?.url
  if (!url) throw new UpscaleProviderError('topaz', 'no output url')

  return {
    imageUrl:   url,
    endpoint:   ENDPOINT,
    requestId:  result.requestId ?? null,
    durationMs: Date.now() - t0,
    rawParams:  loggedParams,
  }
}
