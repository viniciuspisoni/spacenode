import sharp from 'sharp'
import { normalizeMaterialInventory } from '@/lib/ai/material-inventory'

/** Pixel crops from the original only: no recoloring, generated swatches or guessed materials. */
export async function buildMaterialRegionSheet(original: Buffer, raw: unknown): Promise<{
  png: Buffer
  surfaces: string[]
} | null> {
  const entries = normalizeMaterialInventory(raw).filter(item => item.region).slice(0, 4)
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
  return { png, surfaces }
}
