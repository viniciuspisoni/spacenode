import { nearestSupportedAspectRatio } from './aspect-ratio'

export class RenderFormatError extends Error {}

/** Temporary canvas around the source. Never resize or crop source pixels. */
export function renderFrame(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid source dimensions')
  }
  const aspectRatio = nearestSupportedAspectRatio(width, height, Infinity)!
  const [rw, rh] = aspectRatio.split(':').map(Number)
  const unit = Math.ceil(Math.max(width / rw, height / rh))
  const canvasWidth = unit * rw
  const canvasHeight = unit * rh
  const left = Math.floor((canvasWidth - width) / 2)
  const top = Math.floor((canvasHeight - height) / 2)
  return { aspectRatio, width, height, canvasWidth, canvasHeight, left, top,
    right: canvasWidth - width - left, bottom: canvasHeight - height - top }
}

/** Only crop the known temporary margins, after validating the delivered canvas. */
export function renderFrameCrop(frame: ReturnType<typeof renderFrame>, width: number, height: number) {
  if (aspectDrift(frame.canvasWidth, frame.canvasHeight, width, height) > 0.02) {
    throw new RenderFormatError('O motor alterou o formato da imagem. Tente novamente.')
  }
  const left = Math.round(frame.left * width / frame.canvasWidth)
  const top = Math.round(frame.top * height / frame.canvasHeight)
  const cropWidth = Math.min(width - left, Math.round(frame.width * width / frame.canvasWidth))
  const cropHeight = Math.min(height - top, Math.round(frame.height * height / frame.canvasHeight))
  return { left, top, width: cropWidth, height: cropHeight }
}

export function aspectDrift(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  if (![sourceWidth, sourceHeight, width, height].every(v => Number.isFinite(v) && v > 0)) return Infinity
  return Math.abs((width / height) / (sourceWidth / sourceHeight) - 1)
}
