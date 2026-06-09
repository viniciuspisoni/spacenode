// Crop inteligente por máscara (server-side, via sharp).
//
// Fluxo (orquestrado em edit-pipeline.ts):
//   1. detecta a bounding box da área branca da máscara;
//   2. adiciona padding e (opcional) limita a MP (custo do flux-kontext-lora é
//      por MP — recortar derruba o custo direto);
//   3. recorta imagem + máscara para essa região;
//   4. envia o crop ao endpoint;
//   5. recompõe o resultado SOBRE a imagem original usando a máscara como alpha
//      → tudo fora da área branca fica idêntico ao original ("preservar a
//      imagem original").
//
// sharp só roda no servidor (a rota /api/edits é Route Handler Node).

import sharp from 'sharp'

export interface CropRegion {
  left:   number
  top:    number
  width:  number
  height: number
}

export interface CropPlan {
  region:         CropRegion
  /** Fator de redução aplicado ao crop (≤1) para respeitar maxMegapixels. */
  scale:          number
  /** Dimensões efetivas enviadas ao endpoint. */
  outWidth:       number
  outHeight:      number
  outMegapixels:  number
}

/** Baixa uma imagem (URL pública) como Buffer. */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch image failed (${res.status}) ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Megapixels da imagem (largura*altura/1e6). */
export async function imageMegapixels(buffer: Buffer): Promise<number> {
  const m = await sharp(buffer).metadata()
  const w = m.width ?? 0
  const h = m.height ?? 0
  return (w * h) / 1_000_000
}

// ── Padding por ASPECTO (flux-kontext-lora/inpaint) ──────────────────────────────
// A FAL devolve 422 (erro ENGANOSO "Unsupported LoRA weights") quando o aspecto do
// input passa de ~2:1 — comum em renders arquitetônicos largos, onde o crop da
// máscara (ex.: piso) fica muito largo. Padding traz o crop pro limite SEM
// distorcer (a FAL preserva o aspecto no output). Entra edge-copy na imagem e
// PRETO na máscara (= preservado, não editado); é removido do resultado antes do
// recompose. Verificado empiricamente: ≤2:1 OK, ≥2.29:1 falha.
export const INPAINT_MAX_ASPECT = 2.0
const INPAINT_PAD_TARGET = 1.9

/** Endpoints de inpaint com limite de aspecto ~2:1 que precisam de padding. */
export const ASPECT_LIMITED_ENDPOINTS = new Set<string>([
  'fal-ai/flux-kontext-lora/inpaint',
  'vertex/imagen-edit',
])

export interface InpaintPad {
  image:        Buffer
  mask:         Buffer
  left:         number
  top:          number
  origWidth:    number
  origHeight:   number
  paddedWidth:  number
  paddedHeight: number
}

/** Pad imagem+máscara pra trazer o aspecto pra ≤ INPAINT_MAX_ASPECT. null se já ok. */
export async function padForInpaintAspect(imgBuf: Buffer, maskBuf: Buffer): Promise<InpaintPad | null> {
  const meta = await sharp(imgBuf).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (!w || !h) return null
  const ratio = w / h
  let left = 0, top = 0, right = 0, bottom = 0
  if (ratio > INPAINT_MAX_ASPECT) {                // largo demais → adiciona altura
    const padH = Math.ceil(w / INPAINT_PAD_TARGET) - h
    top = Math.floor(padH / 2); bottom = padH - top
  } else if (1 / ratio > INPAINT_MAX_ASPECT) {     // alto demais → adiciona largura
    const padW = Math.ceil(h / INPAINT_PAD_TARGET) - w
    left = Math.floor(padW / 2); right = padW - left
  } else {
    return null
  }
  const [image, mask] = await Promise.all([
    sharp(imgBuf).extend({ top, bottom, left, right, extendWith: 'copy' }).toBuffer(),
    sharp(maskBuf).extend({ top, bottom, left, right, background: { r: 0, g: 0, b: 0 } }).png().toBuffer(),
  ])
  return { image, mask, left, top, origWidth: w, origHeight: h, paddedWidth: w + left + right, paddedHeight: h + top + bottom }
}

/** Desfaz o padding no resultado do provider: alinha às dims pad e extrai a região original. */
export async function unpadInpaintResult(editedBuf: Buffer, pad: InpaintPad): Promise<Buffer> {
  return sharp(editedBuf)
    .resize(pad.paddedWidth, pad.paddedHeight, { fit: 'fill' })
    .extract({ left: pad.left, top: pad.top, width: pad.origWidth, height: pad.origHeight })
    .toBuffer()
}

// ── Camada de SUPERFÍCIE (segmentação SAM2, Fase 1) ──────────────────────────────
// Converte o blob pintado na máscara da superfície inteira. samplePointsFromMask
// deriva os seeds; o SAM2 (engine sam2-segment.ts) devolve a máscara; e
// refineSurfaceMask sanitiza + faz fallback DURO pro blob quando o SAM falha.

/** Amostra pontos-seed (full-res) espalhados na área branca do blob, pra alimentar
 *  o SAM2 (multi-seed cobre superfícies fragmentadas melhor que 1 ponto só). */
export async function samplePointsFromMask(maskBuf: Buffer, maxPoints = 6): Promise<{ x: number; y: number }[]> {
  const meta = await sharp(maskBuf).metadata()
  const W = meta.width ?? 0, H = meta.height ?? 0
  if (!W || !H) return []
  const SCAN = 200
  const scale = Math.max(W, H) / SCAN
  const sw = Math.max(1, Math.round(W / scale)), sh = Math.max(1, Math.round(H / scale))
  const data = await sharp(maskBuf).resize(sw, sh, { fit: 'fill' }).greyscale().raw().toBuffer()
  let minX = sw, minY = sh, maxX = -1, maxY = -1
  const white: Array<[number, number]> = []
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (data[y * sw + x] > 127) {
        white.push([x, y])
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (white.length === 0) return []
  // grid 3×2 sobre a bbox; o branco mais perto do centro de cada célula
  const cols = 3, rows = 2
  const bw = (maxX - minX + 1), bh = (maxY - minY + 1)
  const picks: { x: number; y: number }[] = []
  const seen = new Set<string>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (picks.length >= maxPoints) break
      const cx = minX + (c + 0.5) * bw / cols, cy = minY + (r + 0.5) * bh / rows
      let best: [number, number] | null = null, bestD = Infinity
      for (const [wx, wy] of white) {
        const d = (wx - cx) ** 2 + (wy - cy) ** 2
        if (d < bestD) { bestD = d; best = [wx, wy] }
      }
      if (best) {
        const px = Math.round(best[0] * scale), py = Math.round(best[1] * scale)
        const k = `${px},${py}`
        if (!seen.has(k)) { seen.add(k); picks.push({ x: px, y: py }) }
      }
    }
  }
  return picks
}

export interface SurfaceRefineResult { mask: Buffer; usedFallback: boolean; surfaceRatio: number }

/** Sanitiza a máscara do SAM2 vs o blob: fallback DURO pro blob se o SAM for
 *  absurdo (>75%), vazio, fora do pintado (overlap<30%) ou menor que o pintado.
 *  Senão, união (cobre pelo menos o pintado) + close leve (suaviza borda ripada). */
export async function refineSurfaceMask(samMaskBuf: Buffer, blobMaskBuf: Buffer): Promise<SurfaceRefineResult> {
  const meta = await sharp(blobMaskBuf).metadata()
  const W = meta.width ?? 0, H = meta.height ?? 0
  if (!W || !H) return { mask: blobMaskBuf, usedFallback: true, surfaceRatio: 0 }
  const S = 256
  const sc = Math.max(W, H) / S
  const sw = Math.max(1, Math.round(W / sc)), sh = Math.max(1, Math.round(H / sc))
  const [sam, blob] = await Promise.all([
    sharp(samMaskBuf).resize(sw, sh, { fit: 'fill' }).greyscale().raw().toBuffer(),
    sharp(blobMaskBuf).resize(sw, sh, { fit: 'fill' }).greyscale().raw().toBuffer(),
  ])
  let samC = 0, blobC = 0, both = 0
  for (let i = 0; i < sam.length; i++) {
    const s = sam[i] > 127, b = blob[i] > 127
    if (s) samC++
    if (b) blobC++
    if (s && b) both++
  }
  const total = sam.length || 1
  const samRatio = samC / total, blobRatio = blobC / total
  const overlap = blobC > 0 ? both / blobC : 0
  if (samRatio > 0.75 || samRatio < 1e-4 || overlap < 0.30 || samC < 0.6 * blobC) {
    return { mask: blobMaskBuf, usedFallback: true, surfaceRatio: blobRatio }
  }
  const samFull = await sharp(samMaskBuf).resize(W, H, { fit: 'fill' }).greyscale().toBuffer()
  const sigma = Math.max(1, Math.round(Math.min(W, H) * 0.004))
  // USA A MÁSCARA DO SAM SOZINHA — ela já é a superfície com os OBJETOS POR CIMA
  // excluídos (tapete, cama, móveis). NÃO unir com o blob pintado: se o usuário
  // pintou por cima do tapete, a união REINCLUÍA o tapete (bug "tapete"). O SAM
  // segmenta a partir do seed pintado, então a área pintada já está coberta.
  // blur+threshold(145) = close (fecha ripas/buracos pequenos) + ERODE leve da
  // borda externa → o material não vaza pra parede/rodapé/tapete vizinho.
  const refined = await sharp(samFull).blur(sigma).threshold(145).png().toBuffer()
  return { mask: refined, usedFallback: false, surfaceRatio: samRatio }
}

// Para detectar a bbox sem varrer milhões de pixels, reduzimos a máscara para
// no máximo SCAN_MAX px no maior lado, achamos a bbox lá e escalamos de volta.
const SCAN_MAX = 256
const WHITE_THRESHOLD = 110 // > isso conta como "branco" (área a editar)

/**
 * Bounding box (em px da resolução cheia) da área branca da máscara.
 * Retorna null se não houver pixel branco (nada pra editar).
 */
export async function detectMaskBoundingBox(maskBuffer: Buffer): Promise<CropRegion | null> {
  const meta = await sharp(maskBuffer).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (W === 0 || H === 0) return null

  const scanScale = Math.min(1, SCAN_MAX / Math.max(W, H))
  const sw = Math.max(1, Math.round(W * scanScale))
  const sh = Math.max(1, Math.round(H * scanScale))

  const { data, info } = await sharp(maskBuffer)
    .resize(sw, sh, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const cols = info.width
  const rows = info.height
  let minX = cols, minY = rows, maxX = -1, maxY = -1

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (data[y * cols + x] > WHITE_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null // nenhuma área branca

  // Escala de volta pra resolução cheia.
  const left   = Math.floor(minX / scanScale)
  const top    = Math.floor(minY / scanScale)
  const right  = Math.ceil((maxX + 1) / scanScale)
  const bottom = Math.ceil((maxY + 1) / scanScale)

  return {
    left:   clampInt(left, 0, W - 1),
    top:    clampInt(top, 0, H - 1),
    width:  clampInt(right - left, 1, W - left),
    height: clampInt(bottom - top, 1, H - top),
  }
}

/**
 * Plano de crop: bbox + padding, clampado à imagem, com fator de redução pra
 * respeitar maxMegapixels. Retorna null se não houver o que recortar.
 */
export async function planCrop(args: {
  imageBuffer:    Buffer
  maskBuffer:     Buffer
  paddingRatio?:  number
  maxMegapixels?: number
}): Promise<CropPlan | null> {
  const { imageBuffer, maskBuffer, paddingRatio = 0.25, maxMegapixels } = args

  const meta = await sharp(imageBuffer).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (W === 0 || H === 0) return null

  const bbox = await detectMaskBoundingBox(maskBuffer)
  if (!bbox) return null

  // Padding proporcional ao maior lado da bbox. Generoso de propósito: crops
  // minúsculos dão pouco contexto e pioram o inpaint (sobretudo remoção). Mais
  // contexto custa pouco — o crop ainda é limitado por maxMegapixels.
  const pad = Math.max(32, Math.round(Math.max(bbox.width, bbox.height) * paddingRatio))
  const left   = clampInt(bbox.left - pad, 0, W - 1)
  const top    = clampInt(bbox.top - pad, 0, H - 1)
  const right  = clampInt(bbox.left + bbox.width + pad, left + 1, W)
  const bottom = clampInt(bbox.top + bbox.height + pad, top + 1, H)

  const region: CropRegion = { left, top, width: right - left, height: bottom - top }

  const regionMp = (region.width * region.height) / 1_000_000
  let scale = 1
  if (maxMegapixels && regionMp > maxMegapixels) {
    scale = Math.sqrt(maxMegapixels / regionMp)
  }
  const outWidth  = Math.max(1, Math.round(region.width * scale))
  const outHeight = Math.max(1, Math.round(region.height * scale))

  return {
    region,
    scale,
    outWidth,
    outHeight,
    outMegapixels: (outWidth * outHeight) / 1_000_000,
  }
}

/** Recorta `buffer` para a região do plano e reduz conforme o scale. */
export async function extractCrop(buffer: Buffer, plan: CropPlan): Promise<Buffer> {
  let s = sharp(buffer).extract(plan.region)
  if (plan.scale < 1) s = s.resize(plan.outWidth, plan.outHeight, { fit: 'fill' })
  return s.toBuffer()
}

/**
 * Recompõe o resultado editado SOBRE a imagem original, usando a máscara como
 * canal alpha. Garante que TUDO fora da área branca fica idêntico ao original:
 *   - alpha BINARIZADO (threshold, sem blur) → sem feather sangrando pra fora;
 *   - saída PNG (lossless) → fora da máscara = pixels exatos da original
 *     (JPEG re-encodava a imagem inteira e gerava o drift de ~9% reportado).
 * `maskBuffer` deve estar nas MESMAS dimensões da original (ver normalizeMaskToImage).
 */
export async function recomposeMasked(args: {
  originalBuffer:   Buffer
  editedCropBuffer: Buffer
  maskBuffer:       Buffer
  region:           CropRegion
  /** material/replace/add: borda SUAVE (feather) — o material se funde ao entorno
   *  em vez de virar um recorte literal da máscara pintada. remove/fix_detail
   *  usam borda DURA (preservação pixel-perfeita). */
  softEdges?:       boolean
}): Promise<Buffer> {
  const { originalBuffer, editedCropBuffer, maskBuffer, region, softEdges } = args
  const { width, height } = region

  // Alpha = máscara recortada na região. Dura (threshold) para preservar tudo
  // fora; SUAVE (blur) para mesclar a edição no entorno (material/replace/add).
  const grey = sharp(maskBuffer).extract(region).resize(width, height, { fit: 'fill' }).greyscale()
  const featherSigma = Math.max(2, Math.round(Math.min(width, height) * 0.012))
  const alphaRaw = await (softEdges ? grey.blur(featherSigma) : grey.threshold(WHITE_THRESHOLD))
    .raw()
    .toBuffer()

  // Resultado editado redimensionado à região. MATERIALIZAR (raw) antes do
  // joinChannel: o sharp é lazy e valida o raw alpha contra as dims de ENTRADA,
  // não as do resize. Se o provider devolveu OUTRO tamanho (nano-banana, fill,
  // gemini devolvem; o inpaint flux-kontext-lora preserva), o joinChannel
  // descartava o alpha → overlay 100% opaco → a imagem INTEIRA virava o output
  // do provider (drift ~89–100% fora da máscara). Materializar alinha as dims.
  const resizedEdited = await sharp(editedCropBuffer)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()
  const editedRGBA = await sharp(resizedEdited, { raw: { width, height, channels: 3 } })
    .joinChannel(alphaRaw, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()

  // PNG lossless: fora da máscara fica idêntico à original (sem recompressão).
  // keepMetadata() preserva o ICC/color profile da original — sem isso o sharp
  // re-encoda sem perfil, o browser interpreta as cores diferente (color
  // management) e a validação client-side acusava ~9% de "drift" fora da máscara
  // mesmo com os pixels (raw) idênticos.
  return sharp(originalBuffer)
    .composite([{ input: editedRGBA, left: region.left, top: region.top }])
    .keepMetadata()
    .png()
    .toBuffer()
}

/** Normaliza a máscara às dimensões da imagem (alinha crop/recompose). */
export async function normalizeMaskToImage(maskBuffer: Buffer, imageBuffer: Buffer): Promise<Buffer> {
  const im = await sharp(imageBuffer).metadata()
  const mm = await sharp(maskBuffer).metadata()
  if (mm.width === im.width && mm.height === im.height) return maskBuffer
  return sharp(maskBuffer)
    .resize(im.width ?? undefined, im.height ?? undefined, { fit: 'fill' })
    .png()
    .toBuffer()
}

/** Região cobrindo a imagem inteira (para recompose no caminho sem crop). */
export async function fullRegion(buffer: Buffer): Promise<CropRegion> {
  const m = await sharp(buffer).metadata()
  return { left: 0, top: 0, width: m.width ?? 0, height: m.height ?? 0 }
}

/**
 * Mede a fração de pixels FORA da máscara que mudaram (RMS por componente RGB
 * acima de THRESHOLD). Espelha a validação client-side, mas autoritativa no
 * servidor. `maskBuffer` deve estar nas dims da original. Retorna 0–1.
 */
export async function measureOutOfMaskDrift(args: {
  originalBuffer: Buffer
  resultBuffer:   Buffer
  maskBuffer:     Buffer
  /** material/replace/add: borda suave — expande a região "interna" do gate
   *  (blur na máscara) pra absorver o feather e não rejeitar a mescla. */
  softEdges?:     boolean
}): Promise<number> {
  const { originalBuffer, resultBuffer, maskBuffer, softEdges } = args
  const meta = await sharp(originalBuffer).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (W === 0 || H === 0) return 0

  const scale = Math.min(1, 512 / Math.max(W, H))
  const w = Math.max(1, Math.round(W * scale))
  const h = Math.max(1, Math.round(H * scale))

  const maskPipe = sharp(maskBuffer).resize(w, h, { fit: 'fill' }).greyscale()
  const [o, r, m] = await Promise.all([
    sharp(originalBuffer).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
    sharp(resultBuffer).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
    (softEdges ? maskPipe.blur(Math.max(3, Math.round(Math.min(w, h) * 0.03))) : maskPipe).raw().toBuffer(),
  ])

  const THRESHOLD = 12 // por componente (0-255), igual ao client
  let outside = 0
  let drift = 0
  for (let p = 0; p < m.length; p++) {
    if (m[p] > 32) continue // dentro da máscara
    outside++
    const i = p * 3
    if (
      Math.abs(o[i]     - r[i])     > THRESHOLD ||
      Math.abs(o[i + 1] - r[i + 1]) > THRESHOLD ||
      Math.abs(o[i + 2] - r[i + 2]) > THRESHOLD
    ) drift++
  }
  return outside > 0 ? drift / outside : 0
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}
