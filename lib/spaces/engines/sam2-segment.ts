// fal-ai/sam2/image — Segment Anything 2, segmentação promptável por PONTOS.
//
// Usado pela camada de SUPERFÍCIE (Fase 1 do redesenho do Editar): transforma o
// blob pintado pelo usuário na máscara da SUPERFÍCIE arquitetônica inteira (piso,
// parede), pra a edição estender até o limite real em vez de ficar no contorno
// pintado. Validado empiricamente: piso aberto e parede pintada saem ótimos;
// ripado/oclusão são fracos (tratados por refineSurfaceMask + fallback duro).
//
// Schema (verificado contra a OpenAPI da Fal.ai, 2026-06):
//   input  : image_url (obrig.), prompts:[{x,y,label:1=fg/0=bg}], box_prompts:
//            [{x_min,y_min,x_max,y_max}], output_format (jpeg|png, default png).
//   output : { image: { url } } — MÁSCARA binária 1-canal na resolução cheia.

import { fal } from '@fal-ai/client'

export const SAM2_IMAGE_ENDPOINT = 'fal-ai/sam2/image'
const TIMEOUT_MS = 60_000

export interface SamPoint { x: number; y: number; label: 0 | 1 }
export interface SamBox { x_min: number; y_min: number; x_max: number; y_max: number }

export interface Sam2Output { maskUrl: string; endpoint: string }

/** Segmenta a superfície a partir de pontos-seed (derivados do blob pintado). */
export async function callSam2Segment(args: {
  imageUrl: string
  points:   SamPoint[]
  box?:     SamBox
}): Promise<Sam2Output> {
  const input: Record<string, unknown> = {
    image_url:     args.imageUrl,
    prompts:       args.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), label: p.label })),
    output_format: 'png',
  }
  if (args.box) {
    input.box_prompts = [{
      x_min: Math.round(args.box.x_min), y_min: Math.round(args.box.y_min),
      x_max: Math.round(args.box.x_max), y_max: Math.round(args.box.y_max),
    }]
  }

  const result = await Promise.race([
    fal.subscribe(SAM2_IMAGE_ENDPOINT, { input: input as unknown as never }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`sam2 timeout (${SAM2_IMAGE_ENDPOINT})`)), TIMEOUT_MS),
    ),
  ])

  const data = result.data as { image?: { url?: string }; images?: { url?: string }[] }
  const url = data.image?.url ?? data.images?.[0]?.url
  if (!url) throw new Error(`sam2 returned no mask from ${SAM2_IMAGE_ENDPOINT}`)
  return { maskUrl: url, endpoint: SAM2_IMAGE_ENDPOINT }
}
