// lib/finalizar/export.ts — exportação em resolução total (client-side).
//
// Re-renderiza o documento numa instância dedicada do motor na resolução
// NATURAL da base (limitada pelo hardware), aplica corte/proporção/redimensão
// e codifica PNG/JPG/WebP. Nada disso usa Nodes.

import type { ExportFormat, FinalizeDoc } from './types'
import { FinalizeRenderer } from './engine/renderer'

// Reaproveita o helper de download já existente no app (revoga a object URL).
export { downloadBlob } from '@/lib/apresentar/svg-to-png'

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

export function mimeFor(format: ExportFormat): string {
  return MIME[format] ?? 'image/png'
}

/** Nome de arquivo amigável: <slug>-<data>.<ext> (slug editável na UI). */
export function exportFilename(name: string, format: ExportFormat): string {
  const slug = slugify(name) || 'composicao'
  const date = new Date().toISOString().slice(0, 10)
  return `${slug}-${date}.${format}`
}

export function slugify(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

export type ExportScale = 'original' | '2k' | '4k'

export const EXPORT_SCALES: { id: ExportScale; label: string; longSide: number | null }[] = [
  { id: 'original', label: 'Original', longSide: null },
  { id: '2k', label: '2K', longSide: 2048 },
  { id: '4k', label: '4K', longSide: 4096 },
]

export interface ExportSettings {
  format: ExportFormat
  /** 0..1 — só JPG/WebP. */
  quality: number
  scale: ExportScale
  /** Proporção adicional de corte central no export (null = corte do documento). */
  aspectRatio: number | null
}

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  /** Formato REAL do arquivo — difere do pedido quando o navegador não
   *  codifica o formato (ex.: WebP no Safari vira PNG). */
  format: ExportFormat
  /** true se a resolução foi limitada pelo hardware (limite de textura). */
  capped: boolean
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível carregar uma das imagens (CORS?).'))
    img.src = url
  })
}

/** Renderiza o documento em resolução de exportação e codifica o arquivo. */
export async function renderExport(doc: FinalizeDoc, settings: ExportSettings): Promise<ExportResult> {
  const baseImg = await loadImage(doc.baseUrl)
  // Pré-carrega elementos para o render único (o motor também carrega sozinho,
  // mas aqui precisamos de todos prontos ANTES do frame).
  await Promise.all(
    doc.elements.filter((e) => e.visible).map((e) => loadImage(e.url).catch(() => null)),
  )

  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const renderer = new FinalizeRenderer(canvas)
  if (!renderer.isSupported()) {
    renderer.dispose()
    throw new Error('Exportação indisponível: WebGL2 não suportado neste navegador.')
  }

  try {
    const maxTex = Math.min(renderer.maxTextureSize(), 8192)
    const natW = baseImg.naturalWidth || doc.width
    const natH = baseImg.naturalHeight || doc.height
    const hardCap = Math.min(1, maxTex / Math.max(natW, natH))
    const capped = hardCap < 1
    const renderW = Math.max(2, Math.round(natW * hardCap))
    const renderH = Math.max(2, Math.round(natH * hardCap))

    canvas.width = renderW
    canvas.height = renderH
    renderer.setBaseImage(baseImg, natW, natH)

    // Elementos: espera o próprio motor sinalizar carga (já pré-carregados acima,
    // o cache do browser resolve o segundo load imediatamente).
    const ok = await renderWhenReady(renderer, doc)
    if (!ok) throw new Error('Falha ao renderizar a exportação.')

    // 1. corte do documento
    const crop = doc.geometry.crop
    let sx = 0
    let sy = 0
    let sw = renderW
    let sh = renderH
    if (crop) {
      sx = Math.round(crop.x * renderW)
      sy = Math.round(crop.y * renderH)
      sw = Math.max(2, Math.round(crop.w * renderW))
      sh = Math.max(2, Math.round(crop.h * renderH))
    }

    // 2. proporção adicional (corte central)
    if (settings.aspectRatio && settings.aspectRatio > 0) {
      const target = settings.aspectRatio
      const cur = sw / sh
      if (cur > target) {
        const newW = Math.round(sh * target)
        sx += Math.round((sw - newW) / 2)
        sw = newW
      } else if (cur < target) {
        const newH = Math.round(sw / target)
        sy += Math.round((sh - newH) / 2)
        sh = newH
      }
    }

    // 3. redimensão
    const scaleDef = EXPORT_SCALES.find((s) => s.id === settings.scale)
    let outW = sw
    let outH = sh
    if (scaleDef?.longSide) {
      const k = scaleDef.longSide / Math.max(sw, sh)
      outW = Math.max(2, Math.round(sw * k))
      outH = Math.max(2, Math.round(sh * k))
    }

    const out = document.createElement('canvas')
    out.width = outW
    out.height = outH
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível.')
    if (settings.format === 'jpg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, outW, outH)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outW, outH)

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob(resolve, mimeFor(settings.format), settings.quality),
    )
    if (!blob) throw new Error('Falha ao codificar a imagem (CORS?).')
    // toBlob ignora silenciosamente formatos sem encoder (Safari + WebP → PNG).
    const actualFormat: ExportFormat = blob.type === 'image/webp'
      ? 'webp'
      : blob.type === 'image/jpeg' ? 'jpg' : 'png'
    return { blob, width: outW, height: outH, format: actualFormat, capped }
  } finally {
    renderer.dispose()
  }
}

/** Renderiza aguardando os elementos assíncronos do motor (poucos frames). */
async function renderWhenReady(renderer: FinalizeRenderer, doc: FinalizeDoc): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const ok = renderer.render(doc)
    if (!ok) return false
    // Todos os elementos visíveis com textura pronta?
    const pending = doc.elements.some((e) => e.visible && !renderer.elementImageSize(e.url))
    if (!pending) return true
    await new Promise((r) => setTimeout(r, 120))
  }
  return true // segue com o que carregou (elemento com falha fica de fora)
}

/** Resumo curto dos ajustes de um documento (histórico de versões). */
export function adjustmentsSummary(doc: FinalizeDoc): string {
  const parts: string[] = []
  const a = doc.adjust
  const label: Record<string, string> = {
    exposure: 'exposição', contrast: 'contraste', highlights: 'realces', shadows: 'sombras',
    whites: 'brancos', blacks: 'pretos', temperature: 'temperatura', tint: 'matiz',
    saturation: 'saturação', vibrance: 'vibração', clarity: 'clareza', sharpen: 'nitidez',
    noiseReduction: 'ruído',
  }
  for (const [k, v] of Object.entries(a)) {
    if (v !== 0) parts.push(`${label[k] ?? k} ${v > 0 ? '+' : ''}${v}`)
  }
  if (doc.curve.length > 2) parts.push('curva')
  if (Object.values(doc.hsl).some((b) => b.hue !== 0 || b.sat !== 0 || b.lum !== 0)) parts.push('HSL')
  if (doc.colorMatch) parts.push('correspondência de cor')
  if (doc.locals.length > 0) parts.push(`${doc.locals.length} máscara${doc.locals.length > 1 ? 's' : ''}`)
  if (doc.elements.length > 0) parts.push(`${doc.elements.length} elemento${doc.elements.length > 1 ? 's' : ''}`)
  if (doc.geometry.crop) parts.push('corte')
  if (doc.geometry.perspV !== 0 || doc.geometry.perspH !== 0 || doc.geometry.rotate !== 0) parts.push('perspectiva')
  if (parts.length === 0) return 'Sem ajustes'
  const text = parts.slice(0, 6).join(' · ')
  return parts.length > 6 ? `${text} · +${parts.length - 6}` : text
}
