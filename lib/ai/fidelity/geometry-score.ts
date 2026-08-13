// lib/ai/fidelity/geometry-score.ts
//
// Validação estrutural pós-geração do modo render_only: compara o ORIGINAL
// (autoridade de geometria) com o RESULTADO gerado e devolve um geometry score
// 0..1. O score mede se contornos, aberturas, perspectiva e composição foram
// preservados — mudanças legítimas do render_only (materiais, texturas, luz,
// sombras, reflexos) devem passar; janela movida/redimensionada, porta
// removida, mobiliário trocado de lugar e câmera alterada devem derrubar o
// score.
//
// SERVER-ONLY: usa sharp (proibido em lib/ai/image-provider e lib/prompts —
// grafo client). Importar SOMENTE de rotas/API ou módulos server.
//
// Método (JS puro sobre pixels raw; sem dependência nova):
//   1. As duas imagens → grayscale + leve blur (suprime ruído de textura/JPEG)
//      + resize pro MESMO tamanho de análise derivado do aspecto do original.
//   2. Gradiente Sobel → mapa de magnitude de borda de cada imagem.
//   3. Bordas FORTES (percentil alto) ≈ arestas estruturais: contornos de
//      parede, esquadrias, marcenaria, mobiliário, linhas de fuga. Textura
//      nova (veios, grãos) gera borda fraca/dispersa e não domina o percentil.
//   4. edgeRecall: fração das bordas fortes do ORIGINAL que existem no
//      resultado (com tolerância de ±2px) — detecta remoção/deslocamento.
//      Adições (decoração, vegetação pedida) não penalizam o recall.
//   5. blockCorrelation + worstBlockDelta: grade de densidade de borda —
//      detecta redistribuição local (janela movida aparece como um bloco que
//      perdeu bordas e outro que ganhou) e mudança de câmera (correlação
//      global despenca).
//   6. aspectDelta: razão de aspecto do resultado vs original (drift de
//      enquadramento/formato).
//
// score = 0.55*recall + 0.30*blockCorr + 0.15*(1 − worstBlockDelta) − aspectPenalty

import sharp from 'sharp'

export interface GeometryScoreBreakdown {
  /** Score combinado 0..1 (maior = mais fiel à estrutura do original). */
  score: number
  /** Fração das bordas estruturais do original presentes no resultado (±2px). */
  edgeRecall: number
  /** Correlação de Pearson entre as grades de densidade de borda (0..1, clamp). */
  blockCorrelation: number
  /** Maior divergência local entre células da grade (0..1). */
  worstBlockDelta: number
  /** |aspecto_gerado − aspecto_original| / aspecto_original. */
  aspectDelta: number
  /** ΔE (Lab, CIE76) MÉDIO das células da grade — drift global de cor. O Sobel
   *  é cego a cor: parede repintada com a mesma luminância passa no edge
   *  recall. Score v2 (Fase 3): NÃO entra no `score`; telemetria sempre, gate
   *  opcional na rota (RENDER_FIDELITY_MAX_COLOR_DELTA). Em CGI→foto um ΔE
   *  médio moderado é esperado (a luz muda de natureza); o sinal de RECOLOR
   *  localizado é a pior célula destoando do médio. */
  meanColorDelta: number
  /** ΔE da PIOR célula da grade — recolor/troca de material localizado. */
  worstCellColorDelta: number
  analysisWidth: number
  analysisHeight: number
}

const ANALYSIS_LONG_SIDE = 384
const MIN_SIDE = 48
const STRONG_EDGE_PERCENTILE = 0.85
const EDGE_FLOOR = 12          // magnitude mínima (0..255) pra contar como borda
const DILATE_RADIUS = 2        // tolerância de alinhamento (px na análise)
const GRID = 12                // grade GRID×GRID pra densidade local
const EDGE_MAP_LONG_SIDE = 1024

// ── Pixels ────────────────────────────────────────────────────────────────────

async function grayResize(buf: Buffer, width: number, height: number): Promise<Float32Array> {
  // fit 'fill': o resultado é forçado às dimensões de análise do ORIGINAL.
  // Distorção por aspecto diferente é medida à parte (aspectDelta).
  const raw = await sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .blur(0.8)
    .raw()
    .toBuffer()
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = raw[i]
  return out
}

/** Magnitude Sobel normalizada pra ~0..255. */
function sobelMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const a = gray[i - w - 1], b = gray[i - w], c = gray[i - w + 1]
      const d = gray[i - 1],                      f = gray[i + 1]
      const g = gray[i + w - 1], hh = gray[i + w], k = gray[i + w + 1]
      const gx = (c + 2 * f + k) - (a + 2 * d + g)
      const gy = (g + 2 * hh + k) - (a + 2 * b + c)
      mag[i] = Math.sqrt(gx * gx + gy * gy) / 4
    }
  }
  return mag
}

/** Limite de borda forte: percentil alto entre magnitudes ≥ EDGE_FLOOR (com
 *  piso). Percentil sobre não-zeros evita que uma imagem quase lisa (CAD
 *  chapado) binarize ruído. */
function strongEdgeThreshold(mag: Float32Array): number {
  const values: number[] = []
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] >= EDGE_FLOOR) values.push(mag[i])
  }
  if (values.length === 0) return EDGE_FLOOR
  values.sort((x, y) => x - y)
  const idx = Math.min(values.length - 1, Math.floor(values.length * STRONG_EDGE_PERCENTILE))
  return Math.max(EDGE_FLOOR, values[idx])
}

function binarize(mag: Float32Array, threshold: number): Uint8Array {
  const bin = new Uint8Array(mag.length)
  for (let i = 0; i < mag.length; i++) bin[i] = mag[i] >= threshold ? 1 : 0
  return bin
}

/** Dilatação Chebyshev (janela quadrada de raio r). */
function dilate(bin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(bin.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!bin[y * w + x]) continue
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r)
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r)
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) out[yy * w + xx] = 1
      }
    }
  }
  return out
}

/** Densidade média de magnitude por célula, normalizada pelo máximo da própria
 *  imagem (remove viés de contraste entre CAD chapado e foto). */
function blockDensities(mag: Float32Array, w: number, h: number): Float64Array {
  const cells = new Float64Array(GRID * GRID)
  const counts = new Float64Array(GRID * GRID)
  for (let y = 0; y < h; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y * GRID) / h))
    for (let x = 0; x < w; x++) {
      const gx = Math.min(GRID - 1, Math.floor((x * GRID) / w))
      const ci = gy * GRID + gx
      cells[ci] += mag[y * w + x]
      counts[ci]++
    }
  }
  let max = 0
  for (let i = 0; i < cells.length; i++) {
    cells[i] = counts[i] > 0 ? cells[i] / counts[i] : 0
    if (cells[i] > max) max = cells[i]
  }
  if (max > 0) for (let i = 0; i < cells.length; i++) cells[i] /= max
  return cells
}

// ── Cor (ΔE Lab por célula) ───────────────────────────────────────────────────

async function rgbResize(buf: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()
}

function srgbToLinear(c255: number): number {
  const s = c255 / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** RGB LINEAR médio → Lab (D65). A média é feita em linear (fisicamente
 *  correta) e a conversão pra Lab acontece uma vez por célula. */
function linearRgbToLab(r: number, g: number, b: number): [number, number, number] {
  // linear sRGB → XYZ (D65)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y =  0.2126729 * r + 0.7151522 * g + 0.072175  * b
  const z = (0.0193339 * r + 0.119192  * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x), fy = f(y), fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Lab médio por célula da grade GRID×GRID. */
function cellLabs(rgb: Buffer, w: number, h: number): Float64Array {
  const sums = new Float64Array(GRID * GRID * 3)
  const counts = new Float64Array(GRID * GRID)
  for (let y = 0; y < h; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y * GRID) / h))
    for (let x = 0; x < w; x++) {
      const gx = Math.min(GRID - 1, Math.floor((x * GRID) / w))
      const ci = gy * GRID + gx
      const p = (y * w + x) * 3
      sums[ci * 3]     += srgbToLinear(rgb[p])
      sums[ci * 3 + 1] += srgbToLinear(rgb[p + 1])
      sums[ci * 3 + 2] += srgbToLinear(rgb[p + 2])
      counts[ci]++
    }
  }
  const labs = new Float64Array(GRID * GRID * 3)
  for (let i = 0; i < GRID * GRID; i++) {
    const n = counts[i] || 1
    const [L, a, b] = linearRgbToLab(sums[i * 3] / n, sums[i * 3 + 1] / n, sums[i * 3 + 2] / n)
    labs[i * 3] = L; labs[i * 3 + 1] = a; labs[i * 3 + 2] = b
  }
  return labs
}

/** ΔE76 médio e pior célula entre as grades Lab das duas imagens. */
function colorDeltas(labsO: Float64Array, labsG: Float64Array): { mean: number; worst: number } {
  let sum = 0
  let worst = 0
  const cells = GRID * GRID
  for (let i = 0; i < cells; i++) {
    const dL = labsO[i * 3] - labsG[i * 3]
    const da = labsO[i * 3 + 1] - labsG[i * 3 + 1]
    const db = labsO[i * 3 + 2] - labsG[i * 3 + 2]
    const dE = Math.sqrt(dL * dL + da * da + db * db)
    sum += dE
    if (dE > worst) worst = dE
  }
  return { mean: sum / cells, worst }
}

function pearson(a: Float64Array, b: Float64Array): number {
  const n = a.length
  let ma = 0, mb = 0
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i] }
  ma /= n; mb /= n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb
    num += xa * xb; da += xa * xa; db += xb * xb
  }
  if (da === 0 || db === 0) return 0
  return num / Math.sqrt(da * db)
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// ── API ───────────────────────────────────────────────────────────────────────

export async function computeGeometryScore(
  originalBuf: Buffer,
  generatedBuf: Buffer,
): Promise<GeometryScoreBreakdown> {
  const [om, gm] = await Promise.all([
    sharp(originalBuf).metadata(),
    sharp(generatedBuf).metadata(),
  ])
  if (!om.width || !om.height || !gm.width || !gm.height) {
    throw new Error('geometry-score: dimensões indisponíveis nas imagens')
  }

  const arOrig = om.width / om.height
  const arGen = gm.width / gm.height
  const aspectDelta = Math.abs(arGen - arOrig) / arOrig

  const w = arOrig >= 1
    ? ANALYSIS_LONG_SIDE
    : Math.max(MIN_SIDE, Math.round(ANALYSIS_LONG_SIDE * arOrig))
  const h = arOrig >= 1
    ? Math.max(MIN_SIDE, Math.round(ANALYSIS_LONG_SIDE / arOrig))
    : ANALYSIS_LONG_SIDE

  const [grayO, grayG, rgbO, rgbG] = await Promise.all([
    grayResize(originalBuf, w, h),
    grayResize(generatedBuf, w, h),
    rgbResize(originalBuf, w, h),
    rgbResize(generatedBuf, w, h),
  ])

  const magO = sobelMagnitude(grayO, w, h)
  const magG = sobelMagnitude(grayG, w, h)

  const binO = binarize(magO, strongEdgeThreshold(magO))
  const binG = binarize(magG, strongEdgeThreshold(magG))
  const dilatedG = dilate(binG, w, h, DILATE_RADIUS)

  let strongO = 0, found = 0
  for (let i = 0; i < binO.length; i++) {
    if (!binO[i]) continue
    strongO++
    if (dilatedG[i]) found++
  }
  const edgeRecall = strongO > 0 ? found / strongO : 1

  const cellsO = blockDensities(magO, w, h)
  const cellsG = blockDensities(magG, w, h)
  const blockCorrelation = clamp01(pearson(cellsO, cellsG))
  let worstBlockDelta = 0
  for (let i = 0; i < cellsO.length; i++) {
    const d = Math.abs(cellsO[i] - cellsG[i])
    if (d > worstBlockDelta) worstBlockDelta = d
  }

  // ΔE Lab por célula — telemetria de drift de cor/material (não entra no score).
  const { mean: meanColorDelta, worst: worstCellColorDelta } = colorDeltas(
    cellLabs(rgbO, w, h),
    cellLabs(rgbG, w, h),
  )

  // 2% de tolerância de aspecto (crop/pad de provider); acima disso penaliza
  // rápido — formato diferente = enquadramento alterado.
  const aspectPenalty = aspectDelta <= 0.02 ? 0 : Math.min(0.4, (aspectDelta - 0.02) * 4)

  const score = clamp01(
    0.55 * edgeRecall +
    0.30 * blockCorrelation +
    0.15 * (1 - Math.min(1, worstBlockDelta)) -
    aspectPenalty,
  )

  return {
    score,
    edgeRecall,
    blockCorrelation,
    worstBlockDelta,
    aspectDelta,
    meanColorDelta,
    worstCellColorDelta,
    analysisWidth: w,
    analysisHeight: h,
  }
}

// ── Mapa visual de diferenças estruturais (Fase 3) ────────────────────────────
//
// Overlay pro comparador: o original esmaecido em cinza com, EM VERMELHO, as
// bordas estruturais do original que NÃO foram encontradas no gerado (mesma
// lógica do edgeRecall, ±2px). Diferença de pixel cru seria inútil aqui —
// CGI→foto muda TODA textura legitimamente; o que importa (e o que o usuário
// precisa conferir) é estrutura que sumiu ou se moveu.

const DIFF_LONG_SIDE = 1024

export async function buildStructuralDiffPng(
  originalBuf: Buffer,
  generatedBuf: Buffer,
): Promise<Buffer> {
  const om = await sharp(originalBuf).metadata()
  if (!om.width || !om.height) {
    throw new Error('diff-map: dimensões indisponíveis no original')
  }
  const ar = om.width / om.height
  const w = ar >= 1 ? DIFF_LONG_SIDE : Math.max(MIN_SIDE, Math.round(DIFF_LONG_SIDE * ar))
  const h = ar >= 1 ? Math.max(MIN_SIDE, Math.round(DIFF_LONG_SIDE / ar)) : DIFF_LONG_SIDE

  const [grayO, grayG] = await Promise.all([
    grayResize(originalBuf, w, h),
    grayResize(generatedBuf, w, h),
  ])
  const magO = sobelMagnitude(grayO, w, h)
  const magG = sobelMagnitude(grayG, w, h)
  const binO = binarize(magO, strongEdgeThreshold(magO))
  const dilatedG = dilate(binarize(magG, strongEdgeThreshold(magG)), w, h, DILATE_RADIUS)

  const missing = new Uint8Array(w * h)
  for (let i = 0; i < missing.length; i++) {
    missing[i] = binO[i] && !dilatedG[i] ? 1 : 0
  }
  // Dilatação leve só pra legibilidade do traço vermelho.
  const missingBold = dilate(missing, w, h, 1)

  const px = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    if (missingBold[i]) {
      px[i * 3] = 235; px[i * 3 + 1] = 64; px[i * 3 + 2] = 52
    } else {
      const g = Math.round(grayO[i] * 0.5 + 24)
      px[i * 3] = g; px[i * 3 + 1] = g; px[i * 3 + 2] = g
    }
  }
  return sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer()
}

/** Lineart do original (bordas pretas sobre branco) pro condicionamento
 *  estrutural do retry — enviado como imagem extra ao modelo junto do
 *  STRUCTURAL CONSTRAINT MAP block. */
export async function buildEdgeMapPng(originalBuf: Buffer): Promise<Buffer> {
  const meta = await sharp(originalBuf).metadata()
  if (!meta.width || !meta.height) {
    throw new Error('geometry-score: dimensões indisponíveis no original')
  }
  const ar = meta.width / meta.height
  const w = ar >= 1 ? EDGE_MAP_LONG_SIDE : Math.max(MIN_SIDE, Math.round(EDGE_MAP_LONG_SIDE * ar))
  const h = ar >= 1 ? Math.max(MIN_SIDE, Math.round(EDGE_MAP_LONG_SIDE / ar)) : EDGE_MAP_LONG_SIDE

  const gray = await grayResize(originalBuf, w, h)
  const mag = sobelMagnitude(gray, w, h)
  const bin = dilate(binarize(mag, strongEdgeThreshold(mag)), w, h, 1)

  const px = new Uint8Array(w * h)
  for (let i = 0; i < px.length; i++) px[i] = bin[i] ? 0 : 255
  return sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer()
}
