// fal-ai/evf-sam — segmentação SEMÂNTICA por TEXTO (EVF-SAM2).
//
// Usado na V2 da camada de superfície: a partir de um prompt de texto
// ("rug, bed, sofa, ...") devolve a máscara binária desses OBJETOS, pra
// SUBTRAIR da máscara de superfície (piso/parede) — assim o material não é
// aplicado em tapete/cama/móveis mesmo que o pincel tenha passado por cima.
// Validado empiricamente: "floor" exclui tapete+cama; "rug, bed, ..." isola
// os objetos. É semântico, então independe de onde o usuário pintou.
//
// Schema (verificado contra a OpenAPI da Fal.ai, 2026-06):
//   input  : image_url (obrig.), prompt (texto, obrig.), negative_prompt,
//            mask_only (default true -> máscara binária), expand_mask (dilata px),
//            fill_holes, semantic_type. Output: { image: { url } } = máscara.

import { fal } from '@fal-ai/client'

export const EVF_SAM_ENDPOINT = 'fal-ai/evf-sam'
const TIMEOUT_MS = 60_000

export interface EvfSamOutput { maskUrl: string; endpoint: string }

/** Segmenta por texto e devolve a URL de uma máscara binária (mask_only). */
export async function callEvfSam(args: {
  imageUrl:        string
  prompt:          string
  negativePrompt?: string
  expandMask?:     number
}): Promise<EvfSamOutput> {
  const input: Record<string, unknown> = {
    image_url: args.imageUrl,
    prompt:    args.prompt,
    mask_only: true,
  }
  if (args.negativePrompt) input.negative_prompt = args.negativePrompt
  if (args.expandMask != null) input.expand_mask = Math.round(args.expandMask)

  const result = await Promise.race([
    fal.subscribe(EVF_SAM_ENDPOINT, { input: input as unknown as never }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`evf-sam timeout (${EVF_SAM_ENDPOINT})`)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as { image?: { url?: string }; images?: { url?: string }[] }
  const url = data.image?.url ?? data.images?.[0]?.url
  if (!url) throw new Error(`evf-sam returned no mask from ${EVF_SAM_ENDPOINT}`)
  return { maskUrl: url, endpoint: EVF_SAM_ENDPOINT }
}

/** Lista de objetos típicos SOBRE superfícies (piso/parede) a subtrair da máscara. */
export const SURFACE_OBJECTS_PROMPT =
  'rug, carpet, bed, sofa, couch, armchair, chair, stool, ottoman, table, desk, ' +
  'cabinet, dresser, nightstand, plant, vase, lamp, curtain, blinds, ' +
  'picture frame, painting, mirror, shelf, tv, person'
