// lib/finalizar/engine/masks.ts — rasterização de máscaras (CPU → textura).
//
// Traços são VETORIAIS no documento (normalizados 0–1) e viram bitmap aqui.
// Semântica sequencial fiel (pintar → apagar → repintar funciona): dois canvases
// alfa por máscara — "add" (traços de pincel; borracha remove) e "erase"
// (borracha acumula; pincel remove) — combinados num RGBA (R=add, G=erase)
// que o shader lê como: m = clamp(forma + R) · (1 − G).
//
// Dureza do pincel = blur de filtro aplicado no traço inteiro (um stroke() por
// traço — segmentos do mesmo traço não acumulam); fluxo = alpha do traço.

import type { ElementLayer, LocalAdjustment, MaskStroke } from '../types'

export interface LiveStroke {
  points: { x: number; y: number }[]
  sizeImagePx: number
  hardness: number
  flow: number
  erase: boolean
}

/** Resolução das máscaras relativa à imagem base (½ é indistinguível na prática). */
export const MASK_SCALE = 0.5

// ── Rasterização de um traço ─────────────────────────────────────────────────

function drawStrokePath(
  ctx: CanvasRenderingContext2D,
  stroke: MaskStroke | LiveStroke,
  w: number,
  h: number,
  scale: number,
) {
  const size = Math.max(1.5, stroke.sizeImagePx * scale)
  const blur = size * (1 - Math.max(0, Math.min(1, stroke.hardness))) * 0.30
  ctx.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : 'none'
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, size - blur * 1.5)

  const pts = stroke.points
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0].x * w, pts[0].y * h, Math.max(0.75, (size - blur * 1.5) / 2), 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(pts[0].x * w, pts[0].y * h)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h)
    ctx.stroke()
  }
  ctx.filter = 'none'
}

/** Aplica um traço aos dois canvases alfa respeitando a ordem (fluxo = alpha). */
function applyStroke(
  addCtx: CanvasRenderingContext2D,
  eraseCtx: CanvasRenderingContext2D,
  stroke: MaskStroke | LiveStroke,
  w: number,
  h: number,
  scale: number,
) {
  // Buffer do traço: o traço inteiro vira UMA passada (fluxo não acumula em si).
  const buf = document.createElement('canvas')
  buf.width = w
  buf.height = h
  const bctx = buf.getContext('2d')
  if (!bctx) return
  drawStrokePath(bctx, stroke, w, h, scale)

  const flow = Math.max(0.02, Math.min(1, stroke.flow))
  if (stroke.erase) {
    eraseCtx.globalAlpha = flow
    eraseCtx.globalCompositeOperation = 'source-over'
    eraseCtx.drawImage(buf, 0, 0)
    addCtx.globalAlpha = flow
    addCtx.globalCompositeOperation = 'destination-out'
    addCtx.drawImage(buf, 0, 0)
  } else {
    addCtx.globalAlpha = flow
    addCtx.globalCompositeOperation = 'source-over'
    addCtx.drawImage(buf, 0, 0)
    eraseCtx.globalAlpha = flow
    eraseCtx.globalCompositeOperation = 'destination-out'
    eraseCtx.drawImage(buf, 0, 0)
  }
  addCtx.globalAlpha = 1
  addCtx.globalCompositeOperation = 'source-over'
  eraseCtx.globalAlpha = 1
  eraseCtx.globalCompositeOperation = 'source-over'
}

// ── Máscara de ajuste local → canvas RGBA (R=add, G=erase) ───────────────────

interface MaskCacheEntry {
  key: string
  canvas: HTMLCanvasElement
}

export class MaskRasterizer {
  private cache = new Map<string, MaskCacheEntry>()
  /** Imagens carregadas (bakedUrl / maskUrl legado). */
  private images = new Map<string, HTMLImageElement | 'loading' | 'failed'>()
  onImageLoaded: (() => void) | null = null

  private getImage(url: string): HTMLImageElement | null {
    const cached = this.images.get(url)
    if (cached === 'loading' || cached === 'failed') return null
    if (cached) return cached
    this.images.set(url, 'loading')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.images.set(url, img)
      // A máscara que dependia desta imagem precisa re-rasterizar.
      for (const k of Array.from(this.cache.keys())) {
        if (this.cache.get(k)?.key.includes(url)) this.cache.delete(k)
      }
      this.onImageLoaded?.()
    }
    img.onerror = () => this.images.set(url, 'failed')
    img.src = url
    return null
  }

  private strokesKey(strokes: MaskStroke[]): string {
    let pts = 0
    for (const s of strokes) pts += s.points.length
    const last = strokes[strokes.length - 1]
    const lastSig = last
      ? `${last.points.length}:${last.points[0]?.x.toFixed(4)}:${last.erase ? 1 : 0}:${last.flow}:${last.hardness}:${last.sizeImagePx}`
      : ''
    return `${strokes.length}|${pts}|${lastSig}`
  }

  /** Máscara de um ajuste local, rasterizada em (w×h)·MASK_SCALE.
   *  `live` = traço em andamento (não persistido) aplicado por cima. */
  localMask(local: LocalAdjustment, imgW: number, imgH: number, live?: LiveStroke | null): HTMLCanvasElement {
    const w = Math.max(2, Math.round(imgW * MASK_SCALE))
    const h = Math.max(2, Math.round(imgH * MASK_SCALE))
    const baked = local.shape.kind === 'sky' ? local.shape.bakedUrl ?? '' : ''
    const key = `${w}x${h}|${baked}|${local.feather}|${this.strokesKey(local.strokes)}|${live ? `live${live.points.length}:${live.erase ? 1 : 0}` : ''}`
    const cacheId = `local:${local.id}`
    const hit = this.cache.get(cacheId)
    if (hit && hit.key === key) return hit.canvas

    const add = makeCanvas(w, h)
    const erase = makeCanvas(w, h)
    const addCtx = add.getContext('2d')!
    const eraseCtx = erase.getContext('2d')!

    if (baked) {
      const img = this.getImage(baked)
      if (img) {
        // PNG branco=selecionado → alfa via luminância
        addCtx.drawImage(alphaFromLuma(img, w, h), 0, 0)
      }
    }
    const scale = MASK_SCALE
    for (const s of local.strokes) applyStroke(addCtx, eraseCtx, s, w, h, scale)
    if (live && live.points.length > 0) applyStroke(addCtx, eraseCtx, live, w, h, scale)

    let out = combineRG(add, erase)
    // Feather da máscara inteira (pincel/céu): blur dos canais R/G.
    const featherPx = local.feather * MASK_SCALE
    if (featherPx > 0.5) {
      const blurred = makeCanvas(w, h)
      const bctx = blurred.getContext('2d')!
      bctx.fillStyle = '#000000'
      bctx.fillRect(0, 0, w, h)
      bctx.filter = `blur(${featherPx.toFixed(1)}px)`
      bctx.drawImage(out, 0, 0)
      bctx.filter = 'none'
      out = blurred
    }
    this.cache.set(cacheId, { key, canvas: out })
    return out
  }

  /** Máscara de elemento (alfa único no canal R; feather aplicado). */
  elementMask(el: ElementLayer, imgW: number, imgH: number, live?: LiveStroke | null): HTMLCanvasElement {
    const w = Math.max(2, Math.round(imgW * MASK_SCALE))
    const h = Math.max(2, Math.round(imgH * MASK_SCALE))
    const key = `${w}x${h}|${el.maskFill}|${el.maskUrl ?? ''}|${el.feather}|${this.strokesKey(el.maskStrokes)}|${live ? `live${live.points.length}:${live.erase ? 1 : 0}` : ''}`
    const cacheId = `el:${el.id}`
    const hit = this.cache.get(cacheId)
    if (hit && hit.key === key) return hit.canvas

    const add = makeCanvas(w, h)
    const erase = makeCanvas(w, h)
    const addCtx = add.getContext('2d')!
    const eraseCtx = erase.getContext('2d')!

    if (el.maskUrl) {
      const img = this.getImage(el.maskUrl)
      if (img) addCtx.drawImage(alphaFromLuma(img, w, h), 0, 0)
      else if (el.maskFill === 'full') fillWhite(addCtx, w, h)
    } else if (el.maskFill === 'full') {
      fillWhite(addCtx, w, h)
    }
    for (const s of el.maskStrokes) applyStroke(addCtx, eraseCtx, s, w, h, MASK_SCALE)
    if (live && live.points.length > 0) applyStroke(addCtx, eraseCtx, live, w, h, MASK_SCALE)

    // Resolve add/erase num único alfa e aplica feather.
    const solved = makeCanvas(w, h)
    const sctx = solved.getContext('2d')!
    sctx.drawImage(add, 0, 0)
    sctx.globalCompositeOperation = 'destination-out'
    sctx.drawImage(erase, 0, 0)
    sctx.globalCompositeOperation = 'source-over'

    let final = solved
    const featherPx = el.feather * MASK_SCALE
    if (featherPx > 0.5) {
      const blurred = makeCanvas(w, h)
      const bctx = blurred.getContext('2d')!
      bctx.filter = `blur(${featherPx.toFixed(1)}px)`
      bctx.drawImage(solved, 0, 0)
      bctx.filter = 'none'
      final = blurred
    }

    // Canal R = alfa (o shader de elemento lê .r)
    const out = makeCanvas(w, h)
    const octx = out.getContext('2d')!
    octx.fillStyle = '#ff0000'
    octx.fillRect(0, 0, w, h)
    octx.globalCompositeOperation = 'destination-in'
    octx.drawImage(final, 0, 0)
    octx.globalCompositeOperation = 'source-over'
    this.cache.set(cacheId, { key, canvas: out })
    return out
  }

  /** PNG persistível (branco=selecionado) da máscara resolvida de um local —
   *  usado para "bake" (ex.: céu) e para exportar a área da Limpeza IA. */
  solvedLocalMaskPng(local: LocalAdjustment, imgW: number, imgH: number, analytic?: HTMLCanvasElement | null): HTMLCanvasElement {
    const rg = this.localMask(local, imgW, imgH)
    const w = rg.width
    const h = rg.height
    const out = makeCanvas(w, h)
    const octx = out.getContext('2d', { willReadFrequently: true })!
    octx.fillStyle = '#000000'
    octx.fillRect(0, 0, w, h)
    if (analytic) octx.drawImage(analytic, 0, 0, w, h)
    const rgCtx = rg.getContext('2d', { willReadFrequently: true })!
    const rgData = rgCtx.getImageData(0, 0, w, h)
    const outData = octx.getImageData(0, 0, w, h)
    const d = rgData.data
    const o = outData.data
    for (let i = 0; i < d.length; i += 4) {
      const addV = d[i] * (d[i + 3] / 255)
      const eraseV = d[i + 1] * (d[i + 3] / 255)
      const base = o[i]
      const m = Math.min(255, base + addV) * (1 - eraseV / 255)
      const v = local.invert ? 255 - m : m
      o[i] = v; o[i + 1] = v; o[i + 2] = v; o[i + 3] = 255
    }
    octx.putImageData(outData, 0, 0)
    return out
  }

  invalidate(id: string): void {
    this.cache.delete(`local:${id}`)
    this.cache.delete(`el:${id}`)
  }

  clear(): void {
    this.cache.clear()
  }
}

// ── Seleção automática de céu (heurística local, sem IA/Nodes) ───────────────

/** Detecta o céu por crescimento de região a partir do topo (cor/luminosidade).
 *  Retorna um canvas branco-onde-céu na resolução pedida, ou null se nada
 *  parecido com céu foi encontrado. Honesto: funciona bem em exteriores com
 *  céu visível no topo; refinável com o pincel. */
export function computeSkyMask(source: CanvasImageSource, srcW: number, srcH: number, outW: number, outH: number): HTMLCanvasElement | null {
  const w = 384
  const h = Math.max(8, Math.round((w * srcH) / Math.max(1, srcW)))
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, w, h)
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    return null
  }

  const skyLike = (i: number): boolean => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const blueish = b >= r - 12 && b >= g - 8 && l > 70
    const bright = l > 205 && Math.abs(r - g) < 28 && Math.abs(g - b) < 28 // nuvens/céu estourado
    return blueish || bright
  }

  const mask = new Uint8Array(w * h)
  const queue: number[] = []
  const seedRows = Math.max(2, Math.round(h * 0.12))
  for (let y = 0; y < seedRows; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (skyLike(p * 4)) {
        mask[p] = 1
        queue.push(p)
      }
    }
  }
  if (queue.length < w * seedRows * 0.05) return null // topo não parece céu

  const maxY = Math.round(h * 0.92)
  while (queue.length > 0) {
    const p = queue.pop()!
    const x = p % w
    const neighbors = [p - 1, p + 1, p - w, p + w]
    for (let k = 0; k < 4; k++) {
      const q = neighbors[k]
      if (q < 0 || q >= w * h) continue
      if (k === 0 && x === 0) continue
      if (k === 1 && x === w - 1) continue
      const qy = (q / w) | 0
      if (qy > maxY) continue
      if (mask[q]) continue
      if (!skyLike(q * 4)) continue
      // continuidade de cor com o vizinho (evita vazar por superfícies azuis)
      const di = p * 4
      const qi = q * 4
      const dist = Math.abs(data[di] - data[qi]) + Math.abs(data[di + 1] - data[qi + 1]) + Math.abs(data[di + 2] - data[qi + 2])
      if (dist > 110) continue
      mask[q] = 1
      queue.push(q)
    }
  }

  let count = 0
  for (let i = 0; i < mask.length; i++) count += mask[i]
  if (count < w * h * 0.015) return null

  // binário → canvas com suavização de borda
  const bin = makeCanvas(w, h)
  const bctx = bin.getContext('2d')!
  const id = bctx.createImageData(w, h)
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 255 : 0
    id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255
  }
  bctx.putImageData(id, 0, 0)

  const out = makeCanvas(outW, outH)
  const octx = out.getContext('2d')!
  octx.filter = `blur(${Math.max(1, outW / 300).toFixed(1)}px)`
  octx.drawImage(bin, 0, 0, outW, outH)
  octx.filter = 'none'
  return out
}

// ── Máscara avulsa de traços (Limpeza IA) ────────────────────────────────────

/** Rasteriza traços num PNG preto/branco (branco = área marcada) nas dimensões
 *  EXATAS pedidas — o /api/edits exige máscara do tamanho da imagem. */
export function strokesMaskPngCanvas(strokes: MaskStroke[], outW: number, outH: number): HTMLCanvasElement {
  const w = Math.max(2, Math.round(outW * MASK_SCALE))
  const h = Math.max(2, Math.round(outH * MASK_SCALE))
  const add = makeCanvas(w, h)
  const erase = makeCanvas(w, h)
  const addCtx = add.getContext('2d')!
  const eraseCtx = erase.getContext('2d')!
  for (const s of strokes) applyStroke(addCtx, eraseCtx, s, w, h, MASK_SCALE)

  const solved = makeCanvas(w, h)
  const sctx = solved.getContext('2d')!
  sctx.drawImage(add, 0, 0)
  sctx.globalCompositeOperation = 'destination-out'
  sctx.drawImage(erase, 0, 0)
  sctx.globalCompositeOperation = 'source-over'

  const out = makeCanvas(outW, outH)
  const octx = out.getContext('2d')!
  octx.fillStyle = '#000000'
  octx.fillRect(0, 0, outW, outH)
  octx.drawImage(solved, 0, 0, outW, outH)
  return out
}

/** Fração aproximada da imagem coberta pelos traços (0..1) — estimativa para
 *  o preview de custo; o servidor re-mede a máscara real para cobrar. */
export function estimateStrokeCoverage(strokes: MaskStroke[], imgW: number, imgH: number): number {
  if (strokes.length === 0) return 0
  const w = 128
  const h = Math.max(8, Math.round((w * imgH) / Math.max(1, imgW)))
  const scale = w / Math.max(1, imgW)
  const add = makeCanvas(w, h)
  const erase = makeCanvas(w, h)
  const addCtx = add.getContext('2d')!
  const eraseCtx = erase.getContext('2d')!
  for (const s of strokes) applyStroke(addCtx, eraseCtx, s, w, h, scale)
  const solved = makeCanvas(w, h)
  const sctx = solved.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(add, 0, 0)
  sctx.globalCompositeOperation = 'destination-out'
  sctx.drawImage(erase, 0, 0)
  const data = sctx.getImageData(0, 0, w, h).data
  let sum = 0
  for (let i = 3; i < data.length; i += 4) sum += data[i]
  return sum / (255 * w * h)
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

function fillWhite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
}

/** PNG branco=selecionado → canvas com alfa proporcional à luminância. */
function alphaFromLuma(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  try {
    const id = ctx.getImageData(0, 0, w, h)
    const d = id.data
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255
      d[i + 3] = Math.round(lum * (d[i + 3] / 255))
    }
    ctx.putImageData(id, 0, 0)
  } catch {
    // CORS: usa como veio (melhor que nada)
  }
  return c
}

/** Combina add/erase em RGBA: R=add, G=erase (alfa 255). */
function combineRG(add: HTMLCanvasElement, erase: HTMLCanvasElement): HTMLCanvasElement {
  const w = add.width
  const h = add.height
  const out = makeCanvas(w, h)
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  const addCtx = add.getContext('2d', { willReadFrequently: true })!
  const eraseCtx = erase.getContext('2d', { willReadFrequently: true })!
  const a = addCtx.getImageData(0, 0, w, h).data
  const e = eraseCtx.getImageData(0, 0, w, h).data
  const id = ctx.getImageData(0, 0, w, h)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = a[i + 3]     // R = alfa do add
    d[i + 1] = e[i + 3] // G = alfa do erase
    d[i + 2] = 0
    d[i + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return out
}
