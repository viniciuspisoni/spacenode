// fal-ai/flux-pro/kontext — Flux Pro Kontext (edição contextual por instrução).
//
// Usado pelo editRouter para edições amplas/globais (~US$0.04/image, 4 nodes):
// iluminação, paisagismo, máscara grande, edição SEM máscara e prompts
// complexos (quando o usuário NÃO ligou o premium).
//
// Kontext é um editor por INSTRUÇÃO — não usa mask_url. Recebe a imagem inteira
// + o prompt e reinterpreta a cena preservando composição/perspectiva. Por isso
// o route compõe um prompt sem a linguagem de "área mascarada" para este caso.
//
// NOTE: confirmar schema contra a doc da Fal.ai antes de produção
// (https://fal.ai/models/fal-ai/flux-pro/kontext).

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'
import { buildInstructPrompt } from './mask-prompt'

export const FLUX_PRO_KONTEXT_ENDPOINT = 'fal-ai/flux-pro/kontext'
const TIMEOUT_MS = 120_000

interface FalKontextOutput {
  images?: { url?: string }[]
  image?:  { url?: string }
}

export const callFluxProKontext: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const falInput: Record<string, unknown> = {
    prompt:           buildInstructPrompt(input.prompt, input.references),
    image_url:        input.imageUrl,
    guidance_scale:   3.5,
    num_images:       1,
    safety_tolerance: '2',
    output_format:    'jpeg',
  }
  if (input.seed !== undefined) falInput.seed = input.seed

  const result = await Promise.race([
    fal.subscribe(FLUX_PRO_KONTEXT_ENDPOINT, { input: falInput as unknown as never }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(FLUX_PRO_KONTEXT_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as FalKontextOutput
  const url  = data.images?.[0]?.url ?? data.image?.url
  if (!url) throw new RetouchNoOutputError(FLUX_PRO_KONTEXT_ENDPOINT)

  return { imageUrl: url, endpoint: FLUX_PRO_KONTEXT_ENDPOINT, requestId: (result as { requestId?: string }).requestId ?? null }
}
