import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

const FAL_ENDPOINT   = 'fal-ai/nano-banana-pro/edit'
const FAL_TIMEOUT_MS = 90_000

// ── callFalForVista ───────────────────────────────────────────────────────────
// Submits an image-edit request to the Vega engine (Gemini 3 Pro Image) and
// returns the first output URL. Throws on timeout or missing output.

export async function callFalForVista(
  inputUrl: string,
  prompt:   string,
): Promise<{ outputUrl: string }> {
  const falInput = {
    prompt,
    image_urls:    [inputUrl],
    resolution:    '1K'    as const,
    num_images:    1,
    output_format: 'jpeg'  as const,
  }

  const result = await Promise.race([
    fal.subscribe(FAL_ENDPOINT, { input: falInput }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error('FAL_TIMEOUT'), { isFalTimeout: true })),
        FAL_TIMEOUT_MS,
      )
    ),
  ])

  const images = (result.data as { images: { url: string }[] }).images
  const url    = images?.[0]?.url
  if (!url) throw new Error('No output image returned by FAL')

  return { outputUrl: url }
}
