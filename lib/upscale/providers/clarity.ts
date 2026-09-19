// fal-ai/clarity-upscaler — hoje é SÓ O FALLBACK dos modos que ampliam.
//
// Era o primário de "Recuperar Imagem Baixa" e "Melhoria Inteligente" até
// 2026-09-18, quando a medição contra verdade de campo (MEDICOES.md) mostrou
// que ele é DESTRUTIVO na exata imagem que deveria salvar: recuperando um
// recorte 320×240 em JPEG 35, devolveu edge recall 0,9207 — perdeu 8% das
// arestas estruturais do original, fundindo as barras de um guarda-corpo num
// borrão preto — contra 0,9854 do Topaz High Fidelity V2. É esperado: o
// Clarity é Stable Diffusion, e difusão inventa quando falta informação. Esse
// é justamente o contrato que o Ampliar promete não quebrar.
//
// Fica porque um fallback ruim ainda é melhor que erro quando o Topaz cai — e
// a UI avisa o usuário sempre que o resultado veio daqui (fallbackUsed).
// O preset segue o conservador (creativity 0.15 / resemblance 0.85).

import { fal } from '@fal-ai/client'
import { buildClarityConservativeParams } from '../presets/clarity-conservative'
import {
  MAX_UPSCALE_FACTOR,
  PROVIDER_ENDPOINTS,
  UpscaleProviderError,
  type ProviderCall,
} from '../types'

const ENDPOINT  = PROVIDER_ENDPOINTS.clarity
const TIMEOUT_MS = 180_000

interface ClarityOutput {
  image?:  { url?: string }
  images?: { url?: string }[]
}

export const callClarity: ProviderCall = async ({ imageUrl, scale }) => {
  // Teto 4: é o `maximum` do upscale_factor no schema do Clarity, igual ao do
  // Topaz. O clamp antigo era 8 — ou seja, o fallback de um pedido 8× era
  // rejeitado pelo próprio FAL antes de rodar, e o modo caía inteiro.
  const factor = Math.max(1, Math.min(MAX_UPSCALE_FACTOR, scale ?? 2))
  const params = buildClarityConservativeParams({ upscaleFactor: factor })

  const t0 = Date.now()
  let result: { data: unknown; requestId?: string }
  try {
    result = await Promise.race([
      fal.subscribe(ENDPOINT, {
        input: { image_url: imageUrl, ...params } as unknown as never,
      }) as Promise<{ data: unknown; requestId?: string }>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new UpscaleProviderError('clarity', 'timeout')), TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    if (err instanceof UpscaleProviderError) throw err
    throw new UpscaleProviderError('clarity', (err as Error).message ?? 'unknown', err)
  }

  const data = result.data as ClarityOutput
  const url  = data.image?.url ?? data.images?.[0]?.url
  if (!url) throw new UpscaleProviderError('clarity', 'no output url')

  return {
    imageUrl:   url,
    endpoint:   ENDPOINT,
    requestId:  result.requestId ?? null,
    durationMs: Date.now() - t0,
    rawParams:  params,
  }
}
