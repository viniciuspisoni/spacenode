// fal-ai/topaz/upscale/image — provider PRINCIPAL da aba Resolução "Alta Fidelidade".
//
// Preserva geometria, materiais e detalhes originais melhor que qualquer
// outro upscaler disponível. É caro (custo FAL > Clarity) e pode falhar/timeout
// em horários de pico — por isso o orchestrator cai SILENCIOSAMENTE para Clarity
// se o Topaz não responder.
//
// Params do endpoint (mínimos):
//   - image_url: string
//   - upscale_factor: number (2, 4, 6 ...)
//   - model?: string  → deixamos default; FAL escolhe o melhor para a imagem.

import { fal } from '@fal-ai/client'
import {
  PROVIDER_ENDPOINTS,
  UpscaleProviderError,
  type ProviderCall,
} from '../types'

const ENDPOINT   = PROVIDER_ENDPOINTS.topaz
const TIMEOUT_MS = 240_000   // Topaz roda mais devagar que Clarity

interface TopazOutput {
  image?:  { url?: string }
  images?: { url?: string }[]
}

export const callTopaz: ProviderCall = async ({ imageUrl, scale }) => {
  const factor = Math.max(1, Math.min(8, scale ?? 2))
  const params: Record<string, unknown> = {
    upscale_factor: factor,
  }

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
    rawParams:  params,
  }
}
