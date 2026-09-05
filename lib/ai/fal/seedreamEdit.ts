// lib/ai/fal/seedreamEdit.ts
//
// Edição via Seedream 5.0 Pro Edit (bytedance/seedream/v5/pro/edit, fal.ai) —
// PROTÓTIPO do motor alternativo do Editar V3 (2026-09-05, EDIT_V3_ENGINE=seedream).
//
// O endpoint NÃO aceita máscara em pixels. A edição interativa nativa do modelo
// localiza a região por tags de coordenadas no prompt (`<bbox>x1 y1 x2 y2</bbox>`,
// normalizadas 0–999, origem no canto superior esquerdo) — a seleção do usuário
// vira a caixa envolvente da máscara no espaço da imagem ENVIADA (o crop, quando
// houve). O recompose server-side do pipeline segue garantindo os pixels fora
// da máscara: o modelo interpreta a região de forma semântica (repinta "a
// parede" inteira, não só a caixa) e re-sintetiza o frame.
//
// Schema (OpenAPI da fal, 2026-09-04): prompt, image_urls (≤10), image_size
// (enum ou {width,height} com 1024² ≤ pixels ≤ 2048²), num_images, output_format
// png|jpeg, enable_safety_checker, sync_mode. Sem seed. Sem 4K.
// Ordem das imagens: [principal] → [referências...].

import { fal } from '@fal-ai/client'
import { detectMaskBoundingBox } from '@/lib/spaces/edit-crop'

export const SEEDREAM_EDIT_ENDPOINT = 'bytedance/seedream/v5/pro/edit'
const TIMEOUT_MS = 180_000
const MIN_PIXELS = 1024 * 1024
const MAX_PIXELS = 2048 * 2048
// Faixas de preço da fal por pixels de SAÍDA (+ por imagem de entrada extra).
const COST_LOW_USD = 0.0675   // ≤ 1536²
const COST_HIGH_USD = 0.135   // até 2048²
const COST_EXTRA_INPUT_USD = 0.0045

export type SeedreamEditErrorKind = 'config' | 'api' | 'timeout' | 'no_output'

export class SeedreamEditError extends Error {
  readonly kind: SeedreamEditErrorKind
  constructor(kind: SeedreamEditErrorKind, message: string) {
    super(message)
    this.name = 'SeedreamEditError'
    this.kind = kind
  }
}

let _configured = false
function ensureConfigured(): void {
  if (_configured) return
  const key = process.env.FAL_KEY?.trim()
  if (!key) throw new SeedreamEditError('config', 'FAL_KEY não configurada.')
  fal.config({ credentials: key })
  _configured = true
}

export type SeedreamEditResolution = '1K' | '2K' | '4K'

export interface SeedreamEditImageInput {
  /** Imagem enviada ao modelo (crop da seleção ou origem normalizada). */
  imageUrl: string
  /** Dimensões da imagem enviada — base das coordenadas e do tamanho de saída. */
  imageWidth: number
  imageHeight: number
  references?: { url: string }[]
  /** Prompt já montado por buildSeedreamEditPrompt (com a tag da região). */
  prompt: string
  /** 1K mira o piso do envelope (1024²); 2K/4K o teto (2048² — o endpoint não tem 4K). */
  resolution?: SeedreamEditResolution
}

export interface SeedreamEditImageOutput {
  /** URL pública do resultado (CDN da fal). O pipeline busca o buffer e recompõe. */
  imageRef: string
  provider: 'fal'
  model: 'seedream-5-pro-edit'
  requestId: string | null
  durationMs: number
  outputWidth: number
  outputHeight: number
  /** Custo USD estimado pela faixa de pixels de saída (tabela da fal). */
  costUsd: number
}

/** Tag `<bbox>` (0–999) da caixa envolvente da máscara, no espaço da imagem
 *  enviada. null = máscara sem pixels brancos. */
export async function seedreamRegionTag(maskBuffer: Buffer, width: number, height: number): Promise<string | null> {
  const box = await detectMaskBoundingBox(maskBuffer)
  if (!box || width <= 0 || height <= 0) return null
  const n = (v: number, size: number) => Math.max(0, Math.min(999, Math.round((v / size) * 1000)))
  return `<bbox>${n(box.left, width)} ${n(box.top, height)} ${n(box.left + box.width, width)} ${n(box.top + box.height, height)}</bbox>`
}

/** Tamanho de saída explícito: mesma proporção da imagem enviada, múltiplo de 16,
 *  dentro do envelope [1024², 2048²] do endpoint. O recompose redimensiona pro crop. */
export function seedreamOutputSize(
  width: number,
  height: number,
  resolution: SeedreamEditResolution = '2K',
): { width: number; height: number } {
  const aspect = Math.max(1 / 16, Math.min(16, width / Math.max(1, height)))
  const target = resolution === '1K' ? MIN_PIXELS * 1.06 : MAX_PIXELS * 0.97
  const round16 = (v: number) => Math.max(16, Math.round(v / 16) * 16)
  let w = round16(Math.sqrt(target * aspect))
  let h = round16(w / aspect)
  for (let i = 0; i < 64 && w * h < MIN_PIXELS; i++) { w += 16; h = round16(w / aspect) }
  for (let i = 0; i < 64 && w * h > MAX_PIXELS; i++) { w -= 16; h = round16(w / aspect) }
  return { width: w, height: h }
}

interface SeedreamOutput {
  images?: { url?: string; width?: number | null; height?: number | null }[]
}

/** Edita a imagem via Seedream 5.0 Pro Edit. Lança SeedreamEditError em qualquer falha. */
export async function editImageWithSeedream(input: SeedreamEditImageInput): Promise<SeedreamEditImageOutput> {
  ensureConfigured()
  const startedAt = Date.now()
  const size = seedreamOutputSize(input.imageWidth, input.imageHeight, input.resolution ?? '2K')
  const imageUrls = [input.imageUrl, ...(input.references ?? []).map(r => r.url)]

  let result: { data: unknown; requestId?: string }
  try {
    result = await Promise.race([
      fal.subscribe(SEEDREAM_EDIT_ENDPOINT, {
        input: {
          prompt: input.prompt,
          image_urls: imageUrls,
          image_size: size,
          num_images: 1,
          output_format: 'png', // re-entra no recompose lossless sem perda
        } as unknown as never,
      }) as Promise<{ data: unknown; requestId?: string }>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new SeedreamEditError('timeout', `seedream excedeu ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    if (err instanceof SeedreamEditError) throw err
    const e = err as { status?: number; body?: unknown; message?: string }
    // Endpoint + status + body (ex.: 422 de schema) — sem prompt/URLs (AL-9).
    console.error(
      `[seedreamEdit] fal FALHOU endpoint=${SEEDREAM_EDIT_ENDPOINT} status=${e?.status ?? 'n/a'} ` +
      `body=${JSON.stringify(e?.body ?? e?.message ?? String(err)).slice(0, 300)}`,
    )
    throw new SeedreamEditError('api', e?.message ?? String(err))
  }

  const img = (result.data as SeedreamOutput | undefined)?.images?.[0]
  if (!img?.url) throw new SeedreamEditError('no_output', 'seedream não devolveu imagem.')
  // A fal costuma devolver width/height null neste endpoint — cai no tamanho pedido.
  const outputWidth = img.width ?? size.width
  const outputHeight = img.height ?? size.height
  const costUsd =
    (outputWidth * outputHeight <= 1536 * 1536 ? COST_LOW_USD : COST_HIGH_USD) +
    COST_EXTRA_INPUT_USD * Math.max(0, imageUrls.length - 1)

  return {
    imageRef: img.url,
    provider: 'fal',
    model: 'seedream-5-pro-edit',
    requestId: result.requestId ?? null,
    durationMs: Date.now() - startedAt,
    outputWidth,
    outputHeight,
    costUsd,
  }
}
