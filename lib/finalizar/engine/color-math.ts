// lib/finalizar/engine/color-math.ts — matemática de cor e geometria do motor.
//
// Pura (sem WebGL): curva → LUT, white balance (modelo linear + inverso para o
// conta-gotas), correspondência de cor por referência, homografia da correção
// de perspectiva com auto-cobertura, histograma.

import type { CurvePoint, Geometry } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// Curva de luminosidade → LUT 256 (interpolação cúbica monótona Fritsch–Carlson)
// ═══════════════════════════════════════════════════════════════════════════

export function curveToLut(points: CurvePoint[], size = 256): Uint8Array {
  const pts = normalizeCurvePoints(points)
  const n = pts.length
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)

  // Tangentes monótonas
  const h: number[] = []
  const delta: number[] = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    delta.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  }
  const m: number[] = [delta[0]]
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) m.push(0)
    else m.push((delta[i - 1] + delta[i]) / 2)
  }
  m.push(delta[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / delta[i]
    const b = m[i + 1] / delta[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * delta[i]
      m[i + 1] = t * b * delta[i]
    }
  }

  const lut = new Uint8Array(size)
  let seg = 0
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1)
    while (seg < n - 2 && x > xs[seg + 1]) seg++
    const clampedX = Math.max(xs[0], Math.min(xs[n - 1], x))
    const t = (clampedX - xs[seg]) / h[seg]
    const t2 = t * t
    const t3 = t2 * t
    const y =
      ys[seg] * (2 * t3 - 3 * t2 + 1)
      + m[seg] * h[seg] * (t3 - 2 * t2 + t)
      + ys[seg + 1] * (-2 * t3 + 3 * t2)
      + m[seg + 1] * h[seg] * (t3 - t2)
    lut[i] = Math.round(Math.max(0, Math.min(1, y)) * 255)
  }
  return lut
}

function normalizeCurvePoints(points: CurvePoint[]): CurvePoint[] {
  const pts = [...points]
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x)
  // Garante extremos e espaçamento mínimo em x (evita divisão por ~0).
  if (pts.length === 0 || pts[0].x > 0.0001) pts.unshift({ x: 0, y: pts[0]?.y ?? 0 })
  if (pts[pts.length - 1].x < 0.9999) pts.push({ x: 1, y: pts[pts.length - 1].y })
  const out: CurvePoint[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]
    if (pts[i].x - prev.x < 0.004) continue
    out.push(pts[i])
  }
  if (out.length < 2) return [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// White balance — modelo linear compartilhado com o shader
// ═══════════════════════════════════════════════════════════════════════════
// t = temperature/100 (positivo = mais quente), g = tint/100 (positivo = magenta).
// O MESMO modelo vive no GLSL — mudanças aqui exigem mudança lá.

export function wbGains(temperature: number, tint: number): [number, number, number] {
  const t = temperature / 100
  const g = tint / 100
  return [
    1 + 0.30 * t + 0.12 * g,
    1 - 0.16 * g,
    1 - 0.30 * t + 0.12 * g,
  ]
}

/** Conta-gotas de cinza: dado um pixel (0..1) que DEVERIA ser neutro, resolve
 *  temperature/tint que o neutralizam sob o modelo linear acima. */
export function solveNeutral(r: number, gCh: number, b: number): { temperature: number; tint: number } | null {
  // r·gainR = g·gainG   e   b·gainB = g·gainG  →  sistema 2×2 em (t, g)
  //  0.30 r t + (0.12 r + 0.16 g) gt = g − r
  // −0.30 b t + (0.12 b + 0.16 g) gt = g − b
  const a11 = 0.30 * r
  const a12 = 0.12 * r + 0.16 * gCh
  const b1 = gCh - r
  const a21 = -0.30 * b
  const a22 = 0.12 * b + 0.16 * gCh
  const b2 = gCh - b
  const det = a11 * a22 - a12 * a21
  if (Math.abs(det) < 1e-6) return null
  const t = (b1 * a22 - a12 * b2) / det
  const g = (a11 * b2 - b1 * a21) / det
  return {
    temperature: Math.max(-100, Math.min(100, Math.round(t * 100))),
    tint: Math.max(-100, Math.min(100, Math.round(g * 100))),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Correspondência de cor por imagem de referência (média/desvio por canal)
// ═══════════════════════════════════════════════════════════════════════════

export interface ChannelStats { mean: [number, number, number]; std: [number, number, number] }

export function imageStats(source: CanvasImageSource, w: number, h: number): ChannelStats {
  const c = document.createElement('canvas')
  const dim = 96
  c.width = dim
  c.height = dim
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { mean: [0.5, 0.5, 0.5], std: [0.2, 0.2, 0.2] }
  ctx.drawImage(source, 0, 0, w, h, 0, 0, dim, dim)
  const data = ctx.getImageData(0, 0, dim, dim).data
  const sum = [0, 0, 0]
  const sq = [0, 0, 0]
  const n = dim * dim
  for (let i = 0; i < data.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const v = data[i + ch] / 255
      sum[ch] += v
      sq[ch] += v * v
    }
  }
  const mean = sum.map((s) => s / n) as [number, number, number]
  const std = sq.map((s, ch) => Math.sqrt(Math.max(1e-6, s / n - mean[ch] * mean[ch]))) as [number, number, number]
  return { mean, std }
}

/** gain/offset por canal para levar `src` à distribuição de `ref` (clampado —
 *  correção discreta, nunca "filtro"). Aplicado no shader: c' = c·gain + offset. */
export function computeColorMatch(src: ChannelStats, ref: ChannelStats): {
  gain: [number, number, number]
  offset: [number, number, number]
} {
  const gain = src.std.map((s, i) => clampRange(ref.std[i] / Math.max(1e-4, s), 0.6, 1.7)) as [number, number, number]
  const offset = src.mean.map((mSrc, i) => clampRange(ref.mean[i] - mSrc * gain[i], -0.30, 0.30)) as [number, number, number]
  return { gain, offset }
}

// ═══════════════════════════════════════════════════════════════════════════
// Geometria: homografia inversa + escala de cobertura automática
// ═══════════════════════════════════════════════════════════════════════════
// Convenção (idêntica ao shader):
//   c    = (uv − 0.5) · (aspect, 1) / coverScale      — coords centradas do OUTPUT
//   c'   = c · (1 + lensK · |c|²)                     — correção de lente
//   s    = invH · (c', 1);  src = s.xy / s.z          — homografia inversa
//   uvSrc = src / (aspect, 1) + 0.5

export interface GeometryUniforms {
  /** Matriz inversa (rotação + keystone), column-major para o GLSL. */
  invH: Float32Array
  lensK: number
  coverScale: number
  identity: boolean
}

const PERSP_STRENGTH = 0.42
const LENS_STRENGTH = 0.28

export function geometryUniforms(g: Geometry, aspect: number): GeometryUniforms {
  const uni = geometryUniformsRowMajor(g, aspect)
  if (!uni) return { invH: mat3Identity(), lensK: 0, coverScale: 1, identity: true }
  return { invH: mat3ToColumnMajor(uni.invH), lensK: uni.lensK, coverScale: uni.coverScale, identity: false }
}

/** Menor escala ≥ 1 tal que os 4 cantos do output caem dentro da imagem fonte
 *  (sem bordas vazias). Busca binária sobre a própria transformação do shader. */
function solveCoverScale(invH: Mat3, lensK: number, aspect: number): number {
  const inside = (scale: number): boolean => {
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]
    for (const [u, v] of corners) {
      let cx = (u - 0.5) * aspect / scale
      let cy = (v - 0.5) / scale
      const r2 = cx * cx + cy * cy
      cx *= 1 + lensK * r2
      cy *= 1 + lensK * r2
      const sx = invH[0] * cx + invH[1] * cy + invH[2]
      const sy = invH[3] * cx + invH[4] * cy + invH[5]
      const sw = invH[6] * cx + invH[7] * cy + invH[8]
      if (sw <= 1e-6) return false
      const px = sx / sw / aspect + 0.5
      const py = sy / sw + 0.5
      if (px < -0.001 || px > 1.001 || py < -0.001 || py > 1.001) return false
    }
    return true
  }
  if (inside(1)) return 1
  let lo = 1
  let hi = 3
  if (!inside(hi)) return hi
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inside(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/** Mapeia um ponto do espaço EXIBIDO (pós-geometria, normalizado y-para-baixo)
 *  de volta ao espaço da imagem FONTE — a mesma transformação do shader.
 *  Usado pela Limpeza IA: traços desenhados sobre a imagem corrigida precisam
 *  virar máscara nas coordenadas da imagem original. */
export function displayToSource(
  pt: { x: number; y: number },
  g: Geometry,
  aspect: number,
): { x: number; y: number } {
  const uni = geometryUniformsRowMajor(g, aspect)
  if (!uni) return pt
  const { invH, lensK, coverScale } = uni
  // doc (y baixo) → coords centradas do shader (y cima)
  const u = pt.x
  const v = 1 - pt.y
  let cx = (u - 0.5) * aspect / coverScale
  let cy = (v - 0.5) / coverScale
  const r2 = cx * cx + cy * cy
  cx *= 1 + lensK * r2
  cy *= 1 + lensK * r2
  const sx = invH[0] * cx + invH[1] * cy + invH[2]
  const sy = invH[3] * cx + invH[4] * cy + invH[5]
  const sw = invH[6] * cx + invH[7] * cy + invH[8]
  if (Math.abs(sw) < 1e-6) return pt
  const px = sx / sw / aspect + 0.5
  const py = sy / sw + 0.5
  return { x: px, y: 1 - py }
}

/** Núcleo compartilhado (matriz row-major p/ CPU; column-major sai em
 *  geometryUniforms) — null quando a geometria é identidade.
 *  Documento usa y PARA BAIXO (DOM); o shader trabalha em coords centradas com
 *  y PARA CIMA — espelhar y = negar rotação e keystone vertical. P projetiva
 *  tem os termos de keystone na ÚLTIMA LINHA (w' = h6·x + h7·y + 1). */
function geometryUniformsRowMajor(g: Geometry, aspect: number): { invH: Mat3; lensK: number; coverScale: number } | null {
  if (g.rotate === 0 && g.perspV === 0 && g.perspH === 0 && g.lens === 0) return null
  const theta = (-g.rotate * Math.PI) / 180
  const h6 = (g.perspH / 100) * PERSP_STRENGTH
  const h7 = (-g.perspV / 100) * PERSP_STRENGTH
  const lensK = (g.lens / 100) * LENS_STRENGTH
  const R = mat3Rotation(theta)
  const P: Mat3 = [1, 0, 0, 0, 1, 0, h6, h7, 1] // row-major [r0, r1, r2]
  const H = mat3Mul(P, R) // forward: rotação primeiro, keystone depois
  const invH = mat3Inverse(H)
  if (!invH) return null
  return { invH, lensK, coverScale: solveCoverScale(invH, lensK, aspect) }
}

// ── mat3 (row-major [m00,m01,m02, m10,m11,m12, m20,m21,m22]) ────────────────
type Mat3 = [number, number, number, number, number, number, number, number, number]

function mat3Identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
}

function mat3Rotation(theta: number): Mat3 {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3
  for (let r = 0; r < 3; r++) {
    for (let cIdx = 0; cIdx < 3; cIdx++) {
      out[r * 3 + cIdx] = a[r * 3] * b[cIdx] + a[r * 3 + 1] * b[3 + cIdx] + a[r * 3 + 2] * b[6 + cIdx]
    }
  }
  return out
}

function mat3Inverse(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-9) return null
  const inv = 1 / det
  return [
    A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv,
    B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv,
    C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv,
  ]
}

/** GLSL mat3 é column-major. */
function mat3ToColumnMajor(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]])
}

// ═══════════════════════════════════════════════════════════════════════════
// Histograma (a partir de um canvas já renderizado)
// ═══════════════════════════════════════════════════════════════════════════

export interface Histogram { luma: Uint32Array; max: number }

export function computeHistogram(source: CanvasImageSource, w: number, h: number): Histogram {
  const dim = 160
  const c = document.createElement('canvas')
  c.width = dim
  c.height = Math.max(1, Math.round((dim * h) / Math.max(1, w)))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const luma = new Uint32Array(256)
  if (!ctx) return { luma, max: 1 }
  ctx.drawImage(source, 0, 0, c.width, c.height)
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, c.width, c.height).data
  } catch {
    return { luma, max: 1 } // canvas contaminado (CORS) — histograma indisponível
  }
  for (let i = 0; i < data.length; i += 4) {
    const l = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
    luma[l]++
  }
  let max = 1
  for (let i = 1; i < 255; i++) max = Math.max(max, luma[i]) // ignora extremos saturados
  return { luma, max }
}

// ── util ─────────────────────────────────────────────────────────────────────
function clamp01(n: number): number { return Math.max(0, Math.min(1, n)) }
function clampRange(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)) }
