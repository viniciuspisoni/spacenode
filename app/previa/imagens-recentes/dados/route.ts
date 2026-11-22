import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isLandingReview } from '@/lib/landing-review'

export async function GET() {
  if (!isLandingReview()) return new Response(null, { status: 404 })
  const bytes = await readFile(path.join(process.cwd(), 'marketing/landing-review/curadoria-20261122/imagens.bin'))
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  })
}
