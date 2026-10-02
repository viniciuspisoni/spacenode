// lib/ai/fidelity/native-edge.ts
//
// Edge map NATIVO do plugin SketchUp (hidden-line da mesma câmera, 1.9.0):
// validação barata antes de virar condicionamento estrutural. Um mapa
// desalinhado (aspecto diferente, key reaproveitada da imagem errada) ou que
// não é desenho de linhas viraria condicionamento ATIVO contra a geometria,
// em silêncio. Confere:
//   - aspecto: ±1 % do source (quando o source é conhecido);
//   - tinta: 0,2–45 % de pixel escuro (branco puro = estilo sem arestas;
//     escuro demais = não é lineart);
//   - bimodalidade: lineart não tem meio-tom em massa (≤ 35 %).
//
// Toda redução aqui é por MÍNIMO de bloco (min-pool), nunca por reamostragem:
// medido com o sharp, `kernel: 'nearest'` a fator 2 descarta TODAS as linhas
// de 1 px (nenhum pixel preto sobra) e os filtros de média (lanczos) as
// diluem em cinza claro. O mínimo mantém a linha preta onde ela existe —
// serve tanto pra contar tinta quanto pra reduzir o mapa a ≤ 2048 px antes
// de hospedar (menos upload e tokens, sem apagar aresta).
//
// SERVER-ONLY (sharp).

import sharp from 'sharp'

export type NativeEdgeCheck = { ok: true; png: Buffer } | { ok: false; reason: string }

export const NATIVE_EDGE_MAX_EDGE_PX = 2048
export const NATIVE_EDGE_MIN_INK = 0.002
export const NATIVE_EDGE_MAX_INK = 0.45
export const NATIVE_EDGE_MAX_MIDTONE = 0.35
const ANALYSIS_EDGE_PX = 384

/** Reduz um buffer greyscale por mínimo de bloco `factor × factor`. */
export function minPool(grey: Buffer, width: number, height: number, factor: number): { data: Buffer; width: number; height: number } {
  if (factor <= 1) return { data: grey, width, height }
  const outW = Math.ceil(width / factor)
  const outH = Math.ceil(height / factor)
  const out = Buffer.alloc(outW * outH, 255)
  for (let y = 0; y < height; y++) {
    const oy = Math.floor(y / factor) * outW
    const row = y * width
    for (let x = 0; x < width; x++) {
      const v = grey[row + x]
      const oi = oy + Math.floor(x / factor)
      if (v < out[oi]) out[oi] = v
    }
  }
  return { data: out, width: outW, height: outH }
}

export async function validateNativeEdgeMap(
  buf: Buffer,
  source: { width: number; height: number } | null,
): Promise<NativeEdgeCheck> {
  const { data: grey, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true })
  const width = info.width
  const height = info.height
  if (!width || !height) return { ok: false, reason: 'sem dimensões' }
  if (source && source.width > 0 && source.height > 0) {
    const a = width / height
    const b = source.width / source.height
    if (Math.abs(a - b) / b > 0.01) return { ok: false, reason: `aspecto ${a.toFixed(3)} ≠ source ${b.toFixed(3)}` }
  }

  const longest = Math.max(width, height)
  const small = minPool(grey, width, height, Math.max(1, Math.ceil(longest / ANALYSIS_EDGE_PX)))
  let dark = 0
  let mid = 0
  for (let i = 0; i < small.data.length; i++) {
    const v = small.data[i]
    if (v < 96) dark++
    else if (v < 192) mid++
  }
  const n = small.data.length || 1
  const ink = dark / n
  if (ink < NATIVE_EDGE_MIN_INK) return { ok: false, reason: `sem tinta (${(ink * 100).toFixed(2)} % escuro)` }
  if (ink > NATIVE_EDGE_MAX_INK) return { ok: false, reason: `escuro demais pra lineart (${(ink * 100).toFixed(0)} %)` }
  if (mid / n > NATIVE_EDGE_MAX_MIDTONE) return { ok: false, reason: `não é lineart (${((mid / n) * 100).toFixed(0)} % de meio-tom)` }

  if (longest > NATIVE_EDGE_MAX_EDGE_PX) {
    const shrunk = minPool(grey, width, height, Math.ceil(longest / NATIVE_EDGE_MAX_EDGE_PX))
    const png = await sharp(shrunk.data, { raw: { width: shrunk.width, height: shrunk.height, channels: 1 } }).png().toBuffer()
    return { ok: true, png }
  }
  return { ok: true, png: info.format === 'png' ? buf : await sharp(buf).png().toBuffer() }
}
