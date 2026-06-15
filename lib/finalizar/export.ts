// lib/finalizar/export.ts — utilitários de exportação (client-side, sem Nodes).
//
// O achatamento dos pixels acontece no CanvasStage (que detém os canvases das
// camadas). Aqui ficam só: helpers de nome de arquivo, gatilho de download e o
// SEAM para exportação PSD futura (não implementada no MVP).

import type { ExportFormat } from './types'

// Reaproveita o helper de download já existente no app (revoga a object URL).
export { downloadBlob } from '@/lib/apresentar/svg-to-png'

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
}

export function mimeFor(format: ExportFormat): string {
  return MIME[format] ?? 'image/png'
}

/** Nome de arquivo amigável: spacenode-finalizar-<slug>-<data>.<ext> */
export function exportFilename(projectName: string, format: ExportFormat): string {
  const slug = (projectName || 'composicao')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'composicao'
  const date = new Date().toISOString().slice(0, 10)
  return `spacenode-finalizar-${slug}-${date}.${format}`
}

/** Achata um <canvas> já composto para Blob no formato pedido. */
export function canvasToBlob(canvas: HTMLCanvasElement, format: ExportFormat, quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeFor(format), quality))
}

// ── SEAM futuro: exportação PSD ──────────────────────────────────────────────
// O MVP exporta PNG/JPG achatado. A exportação PSD com camadas preservadas
// exige um writer (ex.: `ag-psd`) e provavelmente um worker server-side. A
// assinatura abaixo fixa o contrato sem puxar dependência nem custo agora.
export interface PsdLayerInput {
  name: string
  /** Canvas RGBA já mascarado/composto da camada, na resolução base. */
  canvas: HTMLCanvasElement
  opacity: number
  hidden: boolean
}

export async function exportPsd(_layers: PsdLayerInput[], _width: number, _height: number): Promise<Blob> {
  // TODO(finalizar-v2): implementar via ag-psd em worker dedicado.
  throw new Error('A exportação PSD chega em uma próxima versão.')
}
