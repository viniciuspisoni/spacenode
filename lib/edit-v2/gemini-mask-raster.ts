// lib/edit-v2/gemini-mask-raster.ts
//
// Rasteriza a saída de segmentação do Gemini para uma máscara P&B full-res.
// O Gemini retorna box_2d = [ymin, xmin, ymax, xmax] normalizado 0–1000 e uma
// mask (PNG base64, mapa de probabilidade DENTRO da box). Aqui:
//   - convertemos a box para pixels reais da imagem;
//   - decodificamos a mask, redimensionamos ao tamanho da box e binarizamos;
//   - colamos exatamente na posição da box sobre um canvas preto full-res.
//
// Puro (só sharp, sem imports de alias) → testável isolado, sem rede/custo.

import sharp from 'sharp'

/** box_2d do Gemini, normalizado 0–1000. */
export interface BoxNorm {
  ymin: number
  xmin: number
  ymax: number
  xmax: number
}

/** Aceita [ymin, xmin, ymax, xmax] (formato do Gemini) e valida. */
export function parseBoxNorm(arr: unknown): BoxNorm | null {
  if (!Array.isArray(arr) || arr.length !== 4) return null
  const [ymin, xmin, ymax, xmax] = arr.map(Number)
  if (![ymin, xmin, ymax, xmax].every(n => Number.isFinite(n))) return null
  const clamp = (n: number) => Math.max(0, Math.min(1000, n))
  const b: BoxNorm = { ymin: clamp(ymin), xmin: clamp(xmin), ymax: clamp(ymax), xmax: clamp(xmax) }
  if (b.xmax <= b.xmin || b.ymax <= b.ymin) return null
  return b
}

/** Converte a box normalizada (0–1000) para retângulo em pixels da imagem. */
export function boxToPixels(
  box: BoxNorm,
  W: number,
  H: number,
): { left: number; top: number; width: number; height: number } | null {
  const left = Math.round((box.xmin / 1000) * W)
  const top = Math.round((box.ymin / 1000) * H)
  const right = Math.round((box.xmax / 1000) * W)
  const bottom = Math.round((box.ymax / 1000) * H)
  const width = Math.min(W - left, right - left)
  const height = Math.min(H - top, bottom - top)
  if (width <= 0 || height <= 0) return null
  return { left, top, width, height }
}

function stripDataUrl(b64: string): string {
  const i = b64.indexOf('base64,')
  return i >= 0 ? b64.slice(i + 'base64,'.length) : b64
}

/** Decodifica a mask do Gemini e a posiciona na box, full-res (P&B). */
export async function rasterizeBoxMask(opts: {
  maskBase64: string
  box: BoxNorm
  width: number
  height: number
  threshold?: number
}): Promise<Buffer | null> {
  const { width: W, height: H } = opts
  const px = boxToPixels(opts.box, W, H)
  if (!px) return null
  const threshold = opts.threshold ?? 128

  let regionRaw: Buffer
  try {
    const buf = Buffer.from(stripDataUrl(opts.maskBase64), 'base64')
    if (buf.length === 0) return null
    regionRaw = await sharp(buf)
      .greyscale()
      .resize(px.width, px.height, { fit: 'fill' })
      .raw()
      .toBuffer()
  } catch {
    return null
  }

  // Cola a região binarizada num canvas preto full-res.
  const out = Buffer.alloc(W * H, 0)
  for (let y = 0; y < px.height; y++) {
    const srcRow = y * px.width
    const dstRow = (px.top + y) * W + px.left
    for (let x = 0; x < px.width; x++) {
      out[dstRow + x] = regionRaw[srcRow + x] > threshold ? 255 : 0
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
}

/** Máscara = retângulo da box preenchido (fallback quando só veio box, sem mask). */
export async function boxFillMask(box: BoxNorm, W: number, H: number): Promise<Buffer | null> {
  const px = boxToPixels(box, W, H)
  if (!px) return null
  const svg = Buffer.from(
    `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>` +
    `<rect x="${px.left}" y="${px.top}" width="${px.width}" height="${px.height}" fill="white"/></svg>`,
  )
  return sharp(svg).png().toBuffer()
}
