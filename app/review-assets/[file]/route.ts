import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isLandingReview } from '@/lib/landing-review'
import { projectById } from '@/components/landing/projectImageCatalog'

const studyImages = new Set(
  [...projectById.values()].flatMap(({ images }) => [images?.render, images?.base])
    .filter(url => url?.startsWith('/review-assets/'))
)

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  if (!isLandingReview() || !studyImages.has(`/review-assets/${file}`)) {
    return new Response(null, { status: 404 })
  }
  const image = await readFile(join(process.cwd(), 'marketing', 'landing-review', file))
  return new Response(new Uint8Array(image), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300' },
  })
}
