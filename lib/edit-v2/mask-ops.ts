// lib/edit-v2/mask-ops.ts
//
// Operações puras de máscara para a SELEÇÃO POR INTENÇÃO (Trocar material v2).
// A região marcada pelo usuário é APROXIMADA — estas funções a transformam em
// restrição espacial e combinam com a máscara semântica do evf-sam/SAM2.
// 100% local (sharp). Sem rede, sem custo. Não toca no v1 (só reusa, por
// import read-only, detectMaskBoundingBox de edit-crop).

import sharp from 'sharp'
import { detectMaskBoundingBox } from '@/lib/spaces/edit-crop'

/** Interseção binária (branco = branco em AMBAS). Alinha dims pela 1ª. */
export async function intersectMasks(aBuf: Buffer, bBuf: Buffer): Promise<Buffer> {
  const m = await sharp(aBuf).metadata()
  const W = m.width ?? 0
  const H = m.height ?? 0
  if (!W || !H) return aBuf
  const [a, b] = await Promise.all([
    sharp(aBuf).greyscale().raw().toBuffer(),
    sharp(bBuf).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer(),
  ])
  const out = Buffer.alloc(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] > 127 && b[i] > 127 ? 255 : 0
  return sharp(out, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
}

/** Região permitida = bounding box do traço EXPANDIDO por uma margem (fração do
 *  maior lado da bbox). Generoso o bastante para o traço aproximado cobrir a
 *  superfície inteira que ele toca, mas ainda excluindo material parecido em
 *  outra parte da imagem (parede oposta, etc.). Retângulo preenchido (branco). */
export async function expandedRegionMask(regionBuf: Buffer, marginRatio = 0.12): Promise<Buffer> {
  const meta = await sharp(regionBuf).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (!W || !H) return regionBuf
  const bbox = await detectMaskBoundingBox(regionBuf)
  if (!bbox) return regionBuf
  const margin = Math.round(Math.max(bbox.width, bbox.height) * marginRatio)
  const x0 = Math.max(0, bbox.left - margin)
  const y0 = Math.max(0, bbox.top - margin)
  const x1 = Math.min(W, bbox.left + bbox.width + margin)
  const y1 = Math.min(H, bbox.top + bbox.height + margin)
  const svg = Buffer.from(
    `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>` +
    `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="white"/></svg>`,
  )
  return sharp(svg).png().toBuffer()
}

/** bbox normalizado (0–1) do traço — vira box_prompt do SAM2 no fallback. */
export async function regionBoundingBoxNorm(
  regionBuf: Buffer,
): Promise<{ x_min: number; y_min: number; x_max: number; y_max: number } | null> {
  const meta = await sharp(regionBuf).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (!W || !H) return null
  const bbox = await detectMaskBoundingBox(regionBuf)
  if (!bbox) return null
  return {
    x_min: bbox.left,
    y_min: bbox.top,
    x_max: bbox.left + bbox.width,
    y_max: bbox.top + bbox.height,
  }
}

/** Centro do traço em px (ponto-semente para o SAM2). */
export async function regionCenterPx(regionBuf: Buffer): Promise<{ x: number; y: number } | null> {
  const bbox = await detectMaskBoundingBox(regionBuf)
  if (!bbox) return null
  return { x: Math.round(bbox.left + bbox.width / 2), y: Math.round(bbox.top + bbox.height / 2) }
}

/** Fração da área branca de `regionBuf` que também está branca em `candidateBuf`.
 *  Usado para decidir se o candidato cobre bem a região (senão, fallback). */
export async function overlapRatio(candidateBuf: Buffer, regionBuf: Buffer): Promise<number> {
  const meta = await sharp(regionBuf).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (!W || !H) return 0
  const S = 256
  const sc = Math.max(W, H) / S
  const sw = Math.max(1, Math.round(W / sc))
  const sh = Math.max(1, Math.round(H / sc))
  const [c, r] = await Promise.all([
    sharp(candidateBuf).resize(sw, sh, { fit: 'fill' }).greyscale().raw().toBuffer(),
    sharp(regionBuf).resize(sw, sh, { fit: 'fill' }).greyscale().raw().toBuffer(),
  ])
  let reg = 0
  let both = 0
  for (let i = 0; i < r.length; i++) {
    if (r[i] > 127) {
      reg++
      if (c[i] > 127) both++
    }
  }
  return reg > 0 ? both / reg : 0
}

/** Imagem com a região do usuário tingida de verde — entrada visual para o
 *  Gemini "ver" o que foi circulado. */
export async function regionOverlay(imageBuf: Buffer, regionBuf: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuf).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (!W || !H) return imageBuf
  const reg = await sharp(regionBuf).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer()
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < reg.length; i++) {
    const on = reg[i] > 127
    const j = i * 4
    rgba[j] = 48
    rgba[j + 1] = 209
    rgba[j + 2] = 88
    rgba[j + 3] = on ? 150 : 0
  }
  const overlay = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  return sharp(imageBuf).composite([{ input: overlay }]).png().toBuffer()
}
