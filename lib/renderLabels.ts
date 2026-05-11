const VIDEO_ENGINE_LABELS: Record<string, string> = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video':    'Rápido',
  'fal-ai/kling-video/v3/pro/image-to-video':             'Cinemático (legado)',
  'fal-ai/veo3.1/image-to-video':                         'Cinemático',
  'bytedance/seedance-2.0/image-to-video':                'Arquitetônico',
}

export function getVideoDisplayLabel(engineId: string, duration?: string | null): string {
  const label = VIDEO_ENGINE_LABELS[engineId] ?? 'Animação'
  const dur   = duration ?? '5s'
  return `Vídeo ${dur} · ${label}`
}

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
