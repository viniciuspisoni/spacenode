// Nomes de produto independentes dos modelos e providers.
export type VideoEngineId = 'orbit' | 'lyra' | 'nebula' | 'astra'

export const VIDEO_ENGINES = [
  { id: 'orbit', label: 'Orbit', note: 'Kling', description: 'Três versões para animar seu projeto.' },
  { id: 'lyra', label: 'Lyra', note: 'Veo', description: 'Lite, Fast e Pro para diferentes entregas.' },
  { id: 'nebula', label: 'Nebula', note: 'Seedance', description: 'Uma opção econômica e uma versão Pro.' },
  { id: 'astra', label: 'Astra', note: 'Luma', description: 'Vídeo em 720p ou 1080p.' },
] as const satisfies readonly { id: VideoEngineId; label: string; note: string; description: string }[]
