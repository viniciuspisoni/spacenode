// lib/storage/normalize-image.ts
//
// Normalização do INPUT dos pipelines de imagem (Renderizar, Editar):
//
//   1. Rotação por EXIF (`rotate()` sem args) — foto de celular chega com
//      orientation tag; sem isso o modelo vê a imagem deitada.
//   2. Conversão ICC → sRGB (`withIccProfile('srgb')`) — export de
//      V-Ray/Corona/Lightroom vem em Display-P3/Adobe RGB; os modelos devolvem
//      sRGB sem tag e o recompose do Editar mistura os dois espaços, gerando o
//      shift de saturação confinado à seleção (auditoria §3.7/5.10).
//   3. Teto de dimensão (Lanczos, server-side) e de bytes — o caminho
//      GCP/Vertex envia a imagem INLINE (base64) e o request tem cap de ~20 MB;
//      além do teto, resolução acima do output máximo (4K) só custa latência.
//
// REGRA DE OURO: pass-through byte-idêntico quando nada é necessário. Uma
// imagem sRGB sem EXIF dentro dos tetos NÃO é re-encodada — zero perda
// geracional no caminho comum.
//
// SERVER-ONLY (sharp). Não importar de client components.

import sharp from 'sharp'

export interface NormalizeOptions {
  /** Teto do lado maior em px. null = sem teto (Editar usa null: o crop da
   *  máscara já limita o que vai ao modelo). Default 4096 — 2× o antigo
   *  downscale client-side de 2048 e suficiente pro output máximo de 4K. */
  maxLongSide?: number | null
  /** Teto de bytes do resultado. Default 9 MB — base64 (~×1,37) + prompt
   *  ficam com folga sob o cap de request do Vertex. */
  maxBytes?: number
}

export interface NormalizedImage {
  buffer: Buffer
  width: number | null
  height: number | null
  mime: 'image/jpeg' | 'image/png'
  /** O que foi aplicado (telemetria/log): 'exif-rotate' | 'icc-srgb' |
   *  'resize' | 'reencode-bytes'. Vazio = pass-through byte-idêntico. */
  transforms: string[]
}

const DEFAULT_MAX_LONG_SIDE = 4096
const DEFAULT_MAX_BYTES = 9 * 1024 * 1024

// Ladder de qualidade quando o teto de bytes força re-encode JPEG.
const JPEG_QUALITY_LADDER = [95, 90, 85]

/** Heurística: o profile embutido já é sRGB? (ex.: "sRGB IEC61966-2.1",
 *  "sRGB built-in"). Converter sRGB→sRGB seria re-encode inútil. */
function iccLooksLikeSrgb(icc: Buffer | undefined): boolean {
  if (!icc) return true // sem profile = tratado como sRGB em toda a cadeia
  return icc.toString('latin1').includes('sRGB')
}

export async function normalizeSourceImage(
  input: Buffer,
  opts: NormalizeOptions = {},
): Promise<NormalizedImage> {
  const maxLongSide = opts.maxLongSide === undefined ? DEFAULT_MAX_LONG_SIDE : opts.maxLongSide
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

  // metadata() lança em buffer não-decodificável — o caller trata como 400.
  const meta = await sharp(input).metadata()
  const width = meta.width ?? null
  const height = meta.height ?? null
  const isPng = meta.format === 'png'

  const needRotate = (meta.orientation ?? 1) !== 1
  const needIcc = !iccLooksLikeSrgb(meta.icc as Buffer | undefined)
  const longSide = Math.max(width ?? 0, height ?? 0)
  const needResize = maxLongSide !== null && longSide > maxLongSide
  const needShrink = input.byteLength > maxBytes

  if (!needRotate && !needIcc && !needResize && !needShrink) {
    return {
      buffer: input,
      width,
      height,
      mime: isPng ? 'image/png' : 'image/jpeg',
      transforms: [],
    }
  }

  const transforms: string[] = []
  if (needRotate) transforms.push('exif-rotate')
  if (needIcc) transforms.push('icc-srgb')
  if (needResize) transforms.push('resize')

  const build = () => {
    // rotate() sempre: auto-orienta quando há EXIF e é no-op sem tag.
    let pipe = sharp(input).rotate()
    if (needResize && maxLongSide !== null) {
      pipe = pipe.resize({
        width: maxLongSide,
        height: maxLongSide,
        fit: 'inside',
        withoutEnlargement: true,
        // kernel default do sharp é lanczos3 — o downscale de qualidade que o
        // canvas do browser (bilinear) nunca deu.
      })
    }
    if (needIcc) pipe = pipe.withIccProfile('srgb')
    return pipe
  }

  // PNG continua PNG (lossless) enquanto couber no teto de bytes; JPEG/WebP
  // viram JPEG alta qualidade com croma cheio (linhas finas de esquadria são
  // o que mais sofre com 4:2:0).
  if (isPng) {
    const png = await build().png().toBuffer()
    if (png.byteLength <= maxBytes) {
      const outMeta = await sharp(png).metadata()
      return { buffer: png, width: outMeta.width ?? null, height: outMeta.height ?? null, mime: 'image/png', transforms }
    }
    transforms.push('reencode-bytes')
  } else if (needShrink) {
    transforms.push('reencode-bytes')
  }

  let out: Buffer | null = null
  for (const quality of JPEG_QUALITY_LADDER) {
    const candidate = await build()
      .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer()
    out = candidate
    if (candidate.byteLength <= maxBytes) break
  }
  const outMeta = await sharp(out!).metadata()
  return {
    buffer: out!,
    width: outMeta.width ?? null,
    height: outMeta.height ?? null,
    mime: 'image/jpeg',
    transforms,
  }
}
