import sharp from 'sharp'
import { normalizeMaterialInventory, type MaterialObservation } from '@/lib/ai/material-inventory'

const SOURCE_GRID: { surface: string; region: NonNullable<MaterialObservation['region']> }[] = [
  { surface: 'original top-left quadrant [0,0,0.5,0.5]', region: [0, 0, .5, .5] },
  { surface: 'original top-right quadrant [0.5,0,1,0.5]', region: [.5, 0, 1, .5] },
  { surface: 'original bottom-left quadrant [0,0.5,0.5,1]', region: [0, .5, .5, 1] },
  { surface: 'original bottom-right quadrant [0.5,0.5,1,1]', region: [.5, .5, 1, 1] },
]

/** Pixel crops from the original only: no recoloring, generated swatches or guessed materials. */
export async function buildMaterialRegionSheet(original: Buffer, raw: unknown, opts?: {
  /** Explicit correction only. Spatial regions, never guessed surface identities. */
  allowSourceGrid?: boolean
}): Promise<{
  png: Buffer
  surfaces: string[]
  source: 'inventory' | 'original_grid'
} | null> {
  const inventory = normalizeMaterialInventory(raw).filter(item => item.region).slice(0, 4)
  const source = inventory.length ? 'inventory' as const : 'original_grid' as const
  const entries = inventory.length ? inventory : opts?.allowSourceGrid ? SOURCE_GRID : []
  if (!entries.length) return null
  const normalized = await sharp(original).rotate().png().toBuffer()
  const meta = await sharp(normalized).metadata()
  if (!meta.width || !meta.height) return null
  const layers: sharp.OverlayOptions[] = []
  const surfaces: string[] = []
  for (const entry of entries) {
    const [x1, y1, x2, y2] = entry.region!
    const left = Math.floor(x1 * meta.width)
    const top = Math.floor(y1 * meta.height)
    const width = Math.min(meta.width - left, Math.ceil(x2 * meta.width) - left)
    const height = Math.min(meta.height - top, Math.ceil(y2 * meta.height) - top)
    if (width < 2 || height < 2) continue
    const input = await sharp(normalized).extract({ left, top, width, height })
      .resize(512, 352, { fit: 'contain', background: '#202020' }).png().toBuffer()
    const row = surfaces.length
    layers.push({ input, left: 0, top: row * 384 + 32 })
    // Static labels only; model-provided surface names never enter SVG markup.
    layers.push({ input: Buffer.from(`<svg width="512" height="32"><text x="12" y="24" fill="white" font-size="22">${row + 1}</text></svg>`), left: 0, top: row * 384 })
    surfaces.push(entry.surface)
  }
  if (!surfaces.length) return null
  const png = await sharp({ create: { width: 512, height: surfaces.length * 384, channels: 3, background: '#202020' } })
    .composite(layers).png().toBuffer()
  return { png, surfaces, source }
}
