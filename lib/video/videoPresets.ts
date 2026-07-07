// Presets de "Tipo de vídeo" — o ponto de partida do módulo Animar.
// Cada preset traduz um objetivo real de arquitetura (apresentar projeto,
// reels, proposta comercial…) em defaults inteligentes: motor, movimento,
// duração, formato e intensidade. O usuário escolhe o objetivo; a
// SpaceNode resolve a técnica.
//
// Regras:
//   - defaults.motionId = 'auto' delega ao resolvedor (análise da imagem →
//     default da cena). Presets com identidade forte fixam o movimento.
//   - defaults sempre passam por resolvePresetDefaults(), que ajusta
//     duração/formato ao que o motor selecionado realmente suporta —
//     nunca enviamos parâmetro não suportado ao provider.

import { requireVideoModel } from './models'
import type { CameraIntensity, CameraMotionId } from './cameraPresets'
import type { FidelityMode } from './promptBuilder'

export type VideoTypeId =
  | 'cinematic'
  | 'tour'
  | 'reels'
  | 'commercial'
  | 'detail'

export type MotionChoice = 'auto' | CameraMotionId

export interface VideoTypePreset {
  id:          VideoTypeId
  label:       string
  tagline:     string          // 1 linha no card
  useCases:    string          // "Ideal para …"
  defaults: {
    modelId:      string
    motionId:     MotionChoice
    duration:     string
    aspectRatio:  string       // 'auto' = manter proporção original
    intensity:    CameraIntensity
    fidelityMode: FidelityMode
  }
}

const VEO = 'fal-ai/veo3.1/image-to-video'

export const VIDEO_TYPE_PRESETS: Record<VideoTypeId, VideoTypePreset> = {
  cinematic: {
    id:       'cinematic',
    label:    'Movimento Cinematográfico',
    tagline:  'Movimento sutil e elegante para dar vida ao render.',
    useCases: 'Portfólio, apresentações e redes profissionais',
    defaults: {
      modelId:      VEO,
      motionId:     'auto',
      duration:     '8',
      aspectRatio:  'auto',
      intensity:    'subtle',
      fidelityMode: 'max',
    },
  },

  tour: {
    id:       'tour',
    label:    'Tour de Ambiente',
    tagline:  'Passagem suave pelo espaço, como uma visita guiada.',
    useCases: 'Interiores, decorados e imóveis à venda',
    defaults: {
      modelId:      VEO,
      motionId:     'walkthrough-interior',
      duration:     '8',
      aspectRatio:  '16:9',
      intensity:    'normal',
      fidelityMode: 'max',
    },
  },

  reels: {
    id:       'reels',
    label:    'Reels de Projeto',
    tagline:  'Vertical e dinâmico, pronto para Instagram e TikTok.',
    useCases: 'Reels, Stories e tráfego pago',
    defaults: {
      modelId:      VEO,
      motionId:     'social-loop',
      duration:     '6',
      aspectRatio:  '9:16',
      intensity:    'cinematic',
      fidelityMode: 'max',
    },
  },

  commercial: {
    id:       'commercial',
    label:    'Apresentação Comercial',
    tagline:  'Sofisticado e limpo para apresentar ao cliente.',
    useCases: 'Propostas, reuniões e material de venda',
    defaults: {
      modelId:      VEO,
      motionId:     'auto',
      duration:     '8',
      aspectRatio:  '16:9',
      intensity:    'subtle',
      fidelityMode: 'max',
    },
  },

  detail: {
    id:       'detail',
    label:    'Detalhe Arquitetônico',
    tagline:  'Valoriza materiais, luz, texturas e mobiliário.',
    useCases: 'Marcenaria, acabamentos e closes de produto',
    defaults: {
      modelId:      VEO,
      motionId:     'zoom-editorial',
      duration:     '4',
      aspectRatio:  'auto',
      intensity:    'subtle',
      fidelityMode: 'max',
    },
  },
}

export const VIDEO_TYPE_ORDER: VideoTypeId[] = [
  'cinematic',
  'tour',
  'reels',
  'commercial',
  'detail',
]

export const DEFAULT_VIDEO_TYPE: VideoTypeId = 'cinematic'

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getVideoTypePreset(id: string): VideoTypePreset | undefined {
  return VIDEO_TYPE_PRESETS[id as VideoTypeId]
}

export function isVideoTypeId(id: string): id is VideoTypeId {
  return id in VIDEO_TYPE_PRESETS
}

// Ajusta os defaults do preset ao que o motor realmente suporta.
// Nunca devolve duração/formato fora do catálogo do modelo.
export function resolvePresetDefaults(preset: VideoTypePreset): VideoTypePreset['defaults'] {
  const d = preset.defaults
  const model = requireVideoModel(d.modelId)

  const duration = model.supportedDurations.includes(d.duration)
    ? d.duration
    : model.supportedDurations[model.supportedDurations.length - 1]

  const aspectRatio = model.supportedAspectRatios.includes(d.aspectRatio)
    ? d.aspectRatio
    : 'auto'

  return { ...d, duration, aspectRatio }
}
