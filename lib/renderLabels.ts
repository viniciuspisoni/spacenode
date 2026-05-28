const VIDEO_ENGINE_LABELS: Record<string, string> = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video':    'Rápido',
  'fal-ai/kling-video/v3/pro/image-to-video':             'Cinemático (legado)',
  'fal-ai/veo3.1/image-to-video':                         'Cinemático',
  'bytedance/seedance-2.0/image-to-video':                'Arquitetônico',
}

// motionLabel é opcional — o histórico legado (renders sem coluna de motion)
// só passa engineId + duration. Renders novos podem incluir o label do
// movimento para exibição enriquecida.
export function getVideoDisplayLabel(
  engineId:    string,
  duration?:   string | null,
  motionLabel?:string | null,
): string {
  const label = VIDEO_ENGINE_LABELS[engineId] ?? 'Animação'
  const dur   = duration ?? '5s'
  const parts = [`Vídeo ${dur}`, label]
  if (motionLabel) parts.push(motionLabel)
  return parts.join(' · ')
}

// Labels do histórico. Aceitamos dois shapes para compat:
//   - Novo (v2):  style = `upscale:<provider>`  (topaz, clarity, nafnet-*, photo-restoration)
//   - Legado:     style = `fal-ai/<modelo>`     (clarity-upscaler, supir, etc.)
//                 style = `magnific`            (já descontinuado mas pode existir no histórico)
const UPSCALE_PROVIDER_LABELS: Record<string, string> = {
  // v2 — keys = style do banco
  'upscale:topaz':             'Alta Fidelidade',
  'upscale:clarity':           'Recuperar / Melhoria Inteligente',
  'upscale:nafnet-denoise':    'Limpar Ruído',
  'upscale:nafnet-deblur':     'Corrigir Desfoque',
  'upscale:photo-restoration': 'Restaurar Imagem',

  // Legado — mantido para histórico antigo continuar legível
  'fal-ai/clarity-upscaler':   'Alta definição',
  'fal-ai/aura-sr':            'Realce natural',
  'fal-ai/supir':              'Máximo detalhe',
  'fal-ai/esrgan':             'Geometria original',
  'magnific':                  'Premium (legado)',
}

export function getUpscaleDisplayLabel(modelId: string, scale?: string | null): string {
  const label = UPSCALE_PROVIDER_LABELS[modelId] ?? 'Alta definição'

  // Escala pode vir como '2x' / '4x' / '8x' / 'ultra' / 'none' / '4'/'4x'
  // ou null. Formatamos pra exibição amigável.
  let scaleLabel: string
  if (!scale)                  scaleLabel = '4×'
  else if (scale === 'none')   scaleLabel = 'sem aumento'
  else if (scale === 'ultra')  scaleLabel = 'Ultra'
  else                         scaleLabel = scale.replace('x', '×')

  return scale === 'none'
    ? `Aprimorar · ${label}`
    : `Upscale ${scaleLabel} · ${label}`
}
