// fal-ai/topaz/upscale/image — provider PRINCIPAL da aba Resolução "Alta Fidelidade".
//
// Preserva geometria, materiais e detalhes originais melhor que qualquer
// outro upscaler disponível. É caro (custo FAL > Clarity) e pode falhar/timeout
// em horários de pico — por isso o orchestrator cai para Clarity se o Topaz
// não responder (fallback sinalizado na resposta da rota via fallbackOf).
//
// Params do endpoint:
//   - image_url: string
//   - upscale_factor: number — o schema aceita 1–4 (docs FAL 2026-08); acima
//     disso o request falha e derruba o modo pro fallback generativo.
//   - model: enum — default 'Standard V2' é o MAIS generativo da família,
//     o oposto do contrato de "Alta Fidelidade". 'High Fidelity V2' é a
//     variante de preservação de detalhe (não inventa textura nem linha) —
//     a certa pra render arquitetônico.

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
  // Clamp em 4: teto do schema FAL. Um 8x pedido roda a 4x no Topaz em vez de
  // falhar direto pro Clarity (que "amplia mais" alucinando detalhe — pior
  // troca no modo cujo contrato é fidelidade). requested_factor preserva a
  // intenção original na telemetria (upscale_meta.steps[].params).
  const requested = scale ?? 2
  const factor    = Math.max(1, Math.min(4, requested))
  const params: Record<string, unknown> = {
    upscale_factor: factor,
    model:          'High Fidelity V2',
  }
  // Telemetria (nunca vai no payload FAL — campo desconhecido derrubaria o request).
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
