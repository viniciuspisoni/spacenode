// fal-ai/image-apps-v2/photo-restoration — aba Aprimorar / "Restaurar Imagem".
//
// Pipeline interno do FAL que combina denoise, sharpening e color correction.
// Bom para fotos antigas, scans degradados, capturas com problemas múltiplos.
// Não faz upscale — para combinar com upscale, usar pipeline multi-step
// (restore → upscale), implementado futuramente no orchestrator.

import { fal } from '@fal-ai/client'
import {
  PROVIDER_ENDPOINTS,
  UpscaleProviderError,
  type ProviderCall,
} from '../types'

const ENDPOINT   = PROVIDER_ENDPOINTS['photo-restoration']
const TIMEOUT_MS = 180_000

interface PhotoRestorationOutput {
  image?:  { url?: string }
  images?: { url?: string }[]
}

export const callPhotoRestoration: ProviderCall = async ({ imageUrl }) => {
  const params = {} as Record<string, unknown>
  const t0     = Date.now()

  let result: { data: unknown; requestId?: string }
  try {
    result = await Promise.race([
      fal.subscribe(ENDPOINT, {
        input: { image_url: imageUrl } as unknown as never,
      }) as Promise<{ data: unknown; requestId?: string }>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new UpscaleProviderError('photo-restoration', 'timeout')), TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    if (err instanceof UpscaleProviderError) throw err
    throw new UpscaleProviderError('photo-restoration', (err as Error).message ?? 'unknown', err)
  }

  const data = result.data as PhotoRestorationOutput
  const url  = data.image?.url ?? data.images?.[0]?.url
  if (!url) throw new UpscaleProviderError('photo-restoration', 'no output url')

  return {
    imageUrl:   url,
    endpoint:   ENDPOINT,
    requestId:  result.requestId ?? null,
    durationMs: Date.now() - t0,
    rawParams:  params,
  }
}
