// fal-ai/clarity-upscaler — usado em DOIS contextos:
//
//   1. Aba Resolução / "Recuperar Imagem Baixa"
//   2. Aba Aprimorar  / "Melhoria Inteligente"
//
// Ambos usam o preset conservador. O upscale_factor varia conforme a escala:
//   - "Recuperar Imagem Baixa" usa 2x ou 4x (definido pela escala da aba).
//   - "Melhoria Inteligente" usa 2x ou 4x (definido pela sub-escala da aba).
//
// Também é o FALLBACK silencioso do Topaz (Alta Fidelidade) quando ele
// falha. Nesse caso o orchestrator passa a mesma escala 2/4/8.

import { fal } from '@fal-ai/client'
import { buildClarityConservativeParams } from '../presets/clarity-conservative'
import {
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
  const factor = Math.max(1, Math.min(8, scale ?? 2))
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
