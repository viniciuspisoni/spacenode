const UPSCALE_MODEL_LABELS: Record<string, string> = {
  'fal-ai/clarity-upscaler': 'Alta definição',
  'fal-ai/aura-sr':          'Realce natural',
  'fal-ai/supir':            'Máximo detalhe',
  'fal-ai/esrgan':           'Geometria original',
}

export function getUpscaleDisplayLabel(modelId: string, scale?: string | null): string {
  const label      = UPSCALE_MODEL_LABELS[modelId] ?? 'Alta definição'
  const multiplier = scale ? scale.replace('x', '×') : '4×'
  return `Upscale ${multiplier} · ${label}`
}
