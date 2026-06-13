// lib/edit-v2/mask-refine.ts
//
// Refinamento EDGE-AWARE da máscara de superfície (Editar v2).
//
// Problema (diagnóstico 2026-06-12): a máscara do SAM acerta a REGIÃO mas não
// a BORDA — e o pós-processamento do v1 (blur+threshold 145) é morfologia
// cega: fecha buracos ao custo de ERODIR a borda toda, sem olhar a imagem.
// Resultado: falta um pedaço perto de rodapé/esquadria e sobra um fiapo
// invadindo o material vizinho.
//
// Solução clássica: GUIDED FILTER (He et al.) — re-estima a máscara usando a
// luminância da própria imagem como guia. Onde existe contraste visual
// (encontro de materiais, móvel, marcenaria), a borda da máscara "gruda" no
// contorno; em região lisa, o interior fica intacto. Depois: morfologia
// SIMÉTRICA (close sem erosão líquida) + open leve (remove fiapos do snap) +
// guard-rail de cobertura (snap degenerado → devolve a original).
//
// 100% local (sharp + TypeScript, integral images O(N)) — zero chamada paga,
// ~100–300ms em 1024px. Não toca em nada do v1.

import sharp from 'sharp'

const WORK_WIDTH = 1024
const GUIDED_RADIUS = 8       // raio do guided filter na escala de trabalho
const GUIDED_EPS = 1e-3       // regularização: menor = adere mais à borda
const CLOSE_RADIUS = 2        // fecha frestas (dilate→erode simétrico)
const OPEN_RADIUS = 1         // remove fiapos/ilhas (erode→dilate)
const BINARY_THRESHOLD = 0.5
/** Se o refino mudar a cobertura além disto (relativo), algo degenerou —
 *  preserva a máscara original. */
const MAX_RELATIVE_COVERAGE_DRIFT = 0.35

export interface RefineSurfaceV2Result {
  /** PNG P&B na resolução da imagem original. */
  mask: Buffer
  coverage: number
  /** false quando o guard-rail devolveu a máscara original. */
  refined: boolean
}

// ── Integral image helpers (Float64) ─────────────────────────────────────────

function integralOf(src: Float64Array, w: number, h: number): Float64Array {
  // (w+1)x(h+1) com borda zero — soma de retângulo em O(1).
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    const srcRow = y * w
    const outRow = (y + 1) * (w + 1)
    const prevRow = y * (w + 1)
    for (let x = 0; x < w; x++) {
      rowSum += src[srcRow + x]
      I[outRow + x + 1] = I[prevRow + x + 1] + rowSum
    }
  }
  return I
}

function boxMeanFactory(I: Float64Array, w: number, h: number, r: number) {
  const stride = w + 1
  return (x: number, y: number): number => {
    const x0 = Math.max(0, x - r)
    const y0 = Math.max(0, y - r)
    const x1 = Math.min(w - 1, x + r)
    const y1 = Math.min(h - 1, y + r)
    const area = (x1 - x0 + 1) * (y1 - y0 + 1)
    const sum =
      I[(y1 + 1) * stride + (x1 + 1)] -
      I[y0 * stride + (x1 + 1)] -
      I[(y1 + 1) * stride + x0] +
      I[y0 * stride + x0]
    return sum / area
  }
}

/** Guided filter q = meanA·I + meanB, guia = luminância, src = máscara 0..1. */
function guidedFilter(
  guide: Float64Array,
  src: Float64Array,
  w: number,
  h: number,
  r: number,
  eps: number,
): Float64Array {
  const n = w * h
  const guideSq = new Float64Array(n)
  const guideSrc = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    guideSq[i] = guide[i] * guide[i]
    guideSrc[i] = guide[i] * src[i]
  }
  const mI = boxMeanFactory(integralOf(guide, w, h), w, h, r)
  const mP = boxMeanFactory(integralOf(src, w, h), w, h, r)
  const mII = boxMeanFactory(integralOf(guideSq, w, h), w, h, r)
  const mIP = boxMeanFactory(integralOf(guideSrc, w, h), w, h, r)

  const a = new Float64Array(n)
  const b = new Float64Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const meanI = mI(x, y)
      const meanP = mP(x, y)
      const varI = mII(x, y) - meanI * meanI
      const covIP = mIP(x, y) - meanI * meanP
      const ai = covIP / (varI + eps)
      a[i] = ai
      b[i] = meanP - ai * meanI
    }
  }
  const mA = boxMeanFactory(integralOf(a, w, h), w, h, r)
  const mB = boxMeanFactory(integralOf(b, w, h), w, h, r)
  const q = new Float64Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      q[i] = mA(x, y) * guide[i] + mB(x, y)
    }
  }
  return q
}

// ── Morfologia binária separável (min/max em janela) ─────────────────────────

function morphPass(src: Uint8Array, w: number, h: number, r: number, isMax: boolean): Uint8Array {
  const tmp = new Uint8Array(src.length)
  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let v = isMax ? 0 : 255
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      for (let k = x0; k <= x1; k++) {
        const s = src[row + k]
        v = isMax ? (s > v ? s : v) : (s < v ? s : v)
      }
      tmp[row + x] = v
    }
  }
  const out = new Uint8Array(src.length)
  // vertical
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = isMax ? 0 : 255
      const y0 = Math.max(0, y - r)
      const y1 = Math.min(h - 1, y + r)
      for (let k = y0; k <= y1; k++) {
        const s = tmp[k * w + x]
        v = isMax ? (s > v ? s : v) : (s < v ? s : v)
      }
      out[y * w + x] = v
    }
  }
  return out
}

const dilate = (m: Uint8Array, w: number, h: number, r: number) => morphPass(m, w, h, r, true)
const erode = (m: Uint8Array, w: number, h: number, r: number) => morphPass(m, w, h, r, false)

// ── API ───────────────────────────────────────────────────────────────────────

export async function refineSurfaceMaskV2(args: {
  imageBuffer: Buffer
  maskBuffer: Buffer
}): Promise<RefineSurfaceV2Result> {
  const meta = await sharp(args.imageBuffer).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (!W || !H) {
    return { mask: args.maskBuffer, coverage: 0, refined: false }
  }

  const w = Math.min(WORK_WIDTH, W)
  const h = Math.max(1, Math.round((H / W) * w))

  const [guideRaw, maskRaw] = await Promise.all([
    sharp(args.imageBuffer).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer(),
    sharp(args.maskBuffer).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer(),
  ])

  const n = w * h
  const guide = new Float64Array(n)
  const src = new Float64Array(n)
  let inCount = 0
  for (let i = 0; i < n; i++) {
    guide[i] = guideRaw[i] / 255
    const on = maskRaw[i] > 127
    src[i] = on ? 1 : 0
    if (on) inCount++
  }
  const coverageIn = inCount / n
  if (coverageIn === 0) {
    return { mask: args.maskBuffer, coverage: 0, refined: false }
  }

  // 1) snap edge-aware
  const q = guidedFilter(guide, src, w, h, GUIDED_RADIUS, GUIDED_EPS)

  // 2) binariza
  let bin: Uint8Array = new Uint8Array(n)
  for (let i = 0; i < n; i++) bin[i] = q[i] > BINARY_THRESHOLD ? 255 : 0

  // 3) close simétrico (fecha frestas SEM encolher) + 4) open leve (tira fiapos)
  bin = erode(dilate(bin, w, h, CLOSE_RADIUS), w, h, CLOSE_RADIUS)
  bin = dilate(erode(bin, w, h, OPEN_RADIUS), w, h, OPEN_RADIUS)

  let outCount = 0
  for (let i = 0; i < n; i++) if (bin[i] > 127) outCount++
  const coverageOut = outCount / n

  // 5) guard-rail: snap degenerado → preserva a original
  const drift = Math.abs(coverageOut - coverageIn) / coverageIn
  if (coverageOut === 0 || drift > MAX_RELATIVE_COVERAGE_DRIFT) {
    return { mask: args.maskBuffer, coverage: coverageIn, refined: false }
  }

  // 6) volta à resolução natural com borda limpa
  const refined = await sharp(Buffer.from(bin), { raw: { width: w, height: h, channels: 1 } })
    .resize(W, H, { fit: 'fill' })
    .threshold(128)
    .png()
    .toBuffer()

  return { mask: refined, coverage: coverageOut, refined: true }
}
