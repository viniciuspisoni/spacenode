import sharp from 'sharp'

export interface PlanLineScore {
  recall: number
  structuralPixels: number
  analysisWidth: number
  analysisHeight: number
}

/**
 * Diagnostic only: compare long, dark horizontal/vertical strokes at 1024 px.
 * Furniture and hatching may still confound this measure; never use it alone
 * to retry, reject or rank a humanized plan without a calibrated fixture set.
 */
export async function measurePlanLineRecall(source: Buffer, result: Buffer): Promise<PlanLineScore> {
  const meta = await sharp(source).metadata()
  if (!meta.width || !meta.height) throw new Error('Dimensões da planta indisponíveis')
  const ratio = meta.width / meta.height
  const width = ratio >= 1 ? 1024 : Math.round(1024 * ratio)
  const height = ratio >= 1 ? Math.round(1024 / ratio) : 1024
  const gray = async (bytes: Buffer) => sharp(bytes)
    .resize(width, height, { fit: 'fill' }).grayscale().raw().toBuffer()
  const [a, b] = await Promise.all([gray(source), gray(result)])
  const dark = (data: Buffer, p: number) => data[p] < 128
  const lines = new Uint8Array(width * height)
  let structuralPixels = 0
  const mark = (p: number) => {
    if (!lines[p]) { lines[p] = 1; structuralPixels++ }
  }
  // Discard short text, furniture details and speckles; keep long wall-like runs.
  const minRun = Math.max(12, Math.round(0.012 * Math.min(width, height)))
  for (let y = 0; y < height; y++) {
    let start = -1
    for (let x = 0; x <= width; x++) {
      const on = x < width && dark(a, y * width + x)
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        if (x - start >= minRun) for (let k = start; k < x; k++) mark(y * width + k)
        start = -1
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let start = -1
    for (let y = 0; y <= height; y++) {
      const on = y < height && dark(a, y * width + x)
      if (on && start < 0) start = y
      if (!on && start >= 0) {
        if (y - start >= minRun) for (let k = start; k < y; k++) mark(k * width + x)
        start = -1
      }
    }
  }
  let matched = 0
  for (let p = 0; p < lines.length; p++) {
    if (!lines[p]) continue
    const x = p % width
    const y = Math.floor(p / width)
    let found = false
    for (let dy = -2; dy <= 2 && !found; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < width && yy >= 0 && yy < height && dark(b, yy * width + xx)) {
          found = true
          break
        }
      }
    }
    if (found) matched++
  }
  return {
    recall: structuralPixels ? matched / structuralPixels : 1,
    structuralPixels, analysisWidth: width, analysisHeight: height,
  }
}
