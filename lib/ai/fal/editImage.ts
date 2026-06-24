// lib/ai/fal/editImage.ts
//
// Fallback OPCIONAL do Editar V3: edição via FAL nano-banana/edit (mesma família
// Gemini Flash Image, publicamente acessível). NÃO é o fluxo principal — só é
// chamado quando a API Google falha E o fallback está ligado (EDIT_V3_FAL_FALLBACK).
//
// A máscara vai como 2ª imagem (não é máscara real em pixel); a preservação fora
// da seleção continua sendo garantida pelo recompose server-side do pipeline.
//
// Ordem das imagens: [principal] → [máscara?] → [referências...].

import { fal } from '@fal-ai/client'

const FAL_ENDPOINT = 'fal-ai/nano-banana/edit'

export type FalEditErrorKind = 'config' | 'api' | 'timeout' | 'no_output'

export class FalEditError extends Error {
  readonly kind: FalEditErrorKind
  constructor(kind: FalEditErrorKind, message: string) {
    super(message)
    this.name = 'FalEditError'
    this.kind = kind
  }
}

const TIMEOUT_MS = 120_000

let _configured = false
function ensureConfigured(): void {
  if (_configured) return
  const key = process.env.FAL_KEY
  if (!key) throw new FalEditError('config', 'FAL_KEY não configurada.')
  fal.config({ credentials: key })
  _configured = true
}

export interface FalEditImageInput {
  imageUrl: string
  maskUrl?: string | null
  references?: { url: string }[]
  prompt: string
  seed?: number
}

export interface FalEditImageOutput {
  /** URL pública do resultado (CDN FAL). O pipeline busca o buffer e recompõe. */
  imageRef: string
  provider: 'fal'
  model: 'nano-banana'
  requestId: string | null
  durationMs: number
}

interface FalNBOutput {
  images?: { url?: string }[]
}

/** Edita a imagem via FAL nano-banana/edit. Lança FalEditError em qualquer falha. */
export async function editImageWithFal(input: FalEditImageInput): Promise<FalEditImageOutput> {
  ensureConfigured()
  const startedAt = Date.now()

  const imageUrls: string[] = [input.imageUrl]
  if (input.maskUrl) imageUrls.push(input.maskUrl)
  for (const ref of input.references ?? []) imageUrls.push(ref.url)

  const result = await Promise.race([
    fal.subscribe(FAL_ENDPOINT, {
      input: {
        prompt: input.prompt,
        image_urls: imageUrls,
        num_images: 1,
        output_format: 'png', // re-entra no recompose lossless sem perda
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      } as unknown as never,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new FalEditError('timeout', `nano-banana excedeu ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ])

  const data = (result as { data?: FalNBOutput })?.data
  const url = data?.images?.[0]?.url
  if (!url) {
    throw new FalEditError('no_output', 'nano-banana não devolveu imagem.')
  }

  return {
    imageRef: url,
    provider: 'fal',
    model: 'nano-banana',
    requestId: (result as { requestId?: string })?.requestId ?? null,
    durationMs: Date.now() - startedAt,
  }
}
