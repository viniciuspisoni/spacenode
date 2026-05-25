import { getVideoDisplayLabel, getUpscaleDisplayLabel } from './renderLabels'

interface RenderForDisplay {
  ambient: string
  style: string
  lighting?: string | null
}

export function getRenderTitle(r: RenderForDisplay): string {
  if (r.ambient === 'upscale') return getUpscaleDisplayLabel(r.style, r.lighting)
  if (r.ambient === 'video')   return getVideoDisplayLabel(r.style, r.lighting)
  return 'Vista avulsa'
}
