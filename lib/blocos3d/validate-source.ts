import sharp from 'sharp'
import type { PositionedImages, ViewPosition } from './types'
import { VIEW_POSITION_LABEL } from './config'

type DownloadResult = { data: Blob | null; error: unknown }

/** Faz a checagem gratuita de todas as vistas antes do débito dos nodes. */
export async function validateBlocos3DImages(
  images: PositionedImages<string>,
  positions: ViewPosition[],
  download: (key: string) => Promise<DownloadResult>,
): Promise<{ status: number; error: string } | null> {
  const checks = await Promise.all(positions.map(async p => {
    const { data, error } = await download(images[p]!)
    if (error || !data) return { status: 503, error: `Não foi possível ler a foto (${VIEW_POSITION_LABEL[p]}). Envie-a novamente.` }
    try {
      const metadata = await sharp(Buffer.from(await data.arrayBuffer()), { failOn: 'error' }).metadata()
      if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 512 ||
          !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
        return { status: 400, error: 'Use fotos JPG, PNG ou WebP com pelo menos 512 px em cada lado.' }
      }
    } catch {
      return { status: 400, error: `Não foi possível abrir a foto (${VIEW_POSITION_LABEL[p]}). Envie outra.` }
    }
    return null
  }))
  return checks.find(result => result !== null) ?? null
}
