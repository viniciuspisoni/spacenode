// fal-ai/nafnet/{denoise,deblur} — providers da aba Aprimorar.
//
// NAFNet ("Nonlinear Activation Free Network") é uma família de modelos
// leves e rápidos para image restoration. NÃO faz upscale — apenas restaura
// na resolução original. Por isso na aba Aprimorar a escala fica em "sem
// aumento" para esses dois modos.

import { fal } from '@fal-ai/client'
import {
  PROVIDER_ENDPOINTS,
  UpscaleProviderError,
  type ProviderCall,
} from '../types'

const TIMEOUT_MS = 120_000

interface NafnetOutput {
  image?:  { url?: string }
  images?: { url?: string }[]
}

function makeCaller(provider: 'nafnet-denoise' | 'nafnet-deblur'): ProviderCall {
  const endpoint = PROVIDER_ENDPOINTS[provider]

  return async ({ imageUrl }) => {
    const params = {} as Record<string, unknown>
    const t0     = Date.now()

    let result: { data: unknown; requestId?: string }
    try {
      result = await Promise.race([
        fal.subscribe(endpoint, {
          input: { image_url: imageUrl } as unknown as never,
        }) as Promise<{ data: unknown; requestId?: string }>,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new UpscaleProviderError(provider, 'timeout')), TIMEOUT_MS),
        ),
      ])
    } catch (err) {
      if (err instanceof UpscaleProviderError) throw err
      throw new UpscaleProviderError(provider, (err as Error).message ?? 'unknown', err)
    }

    const data = result.data as NafnetOutput
    const url  = data.image?.url ?? data.images?.[0]?.url
    if (!url) throw new UpscaleProviderError(provider, 'no output url')

    return {
      imageUrl:   url,
      endpoint,
      requestId:  result.requestId ?? null,
      durationMs: Date.now() - t0,
      rawParams:  params,
    }
  }
}

export const callNafnetDenoise = makeCaller('nafnet-denoise')
export const callNafnetDeblur  = makeCaller('nafnet-deblur')
