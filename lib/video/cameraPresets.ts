// Presets de movimento de câmera arquitetônica. Independentes da cena —
// um mesmo movimento (ex: orbit) pode ser aplicado a fachada ou interior.
// O builder de prompt combina cena (lib/video/scenes) + movimento (este
// arquivo) num único prompt final.
//
// Para o modo "Câmera arquitetônica" (sem prompt do usuário), o usuário
// escolhe um destes presets diretamente. Para o modo "Animar imagem", o
// preset é sugerido automaticamente após a análise da imagem.

import type { SceneArchetype } from './scenes'

export type CameraMotionId =
  | 'dolly-in-soft'
  | 'dolly-out-soft'
  | 'lateral-tracking'
  | 'orbit-soft'
  | 'vertical-pan'
  | 'enter-room'
  | 'facade-reveal'
  | 'dolly-in-cinematic'
  | 'drone-soft'
  | 'zoom-editorial'
  | 'parallax-subtle'
  | 'walkthrough-interior'
  | 'static-ambient'
  | 'horizontal-pan'
  | 'institutional-reveal'
  | 'real-estate-soft'
  | 'social-loop'
  | 'lighting-reveal'
  | 'golden-hour'

// 4 níveis de intensidade expostos na UI como Sutil / Moderado /
// Cinematográfico / Dinâmico. 'cinematic' fica entre normal e pronounced —
// movimento com linguagem de cinema, mas ainda contido para archviz.
export type CameraIntensity = 'subtle' | 'normal' | 'cinematic' | 'pronounced'

export interface CameraMotion {
  id:                    CameraMotionId
  label:                 string
  description:           string                  // copy do card
  promptFragment:        string                  // metadado legado; geração usa takePolicy
  recommendedFor:        SceneArchetype[]        // cenas onde brilha
  recommendedDuration:   string                  // ex: '8'
  recommendedAspectRatio:string                  // ex: '16:9'
  intensityHint:         CameraIntensity         // intensidade default
  group:                 'interior' | 'facade' | 'commercial' | 'social' | 'generic'
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

export const CAMERA_MOTIONS: Record<CameraMotionId, CameraMotion> = {
  'dolly-in-soft': {
    id:                     'dolly-in-soft',
    label:                  'Aproximação suave',
    description:            'Câmera avança devagar, ganhando intimidade com o ambiente.',
    promptFragment:
      'short slow straight dolly forward within the visible composition',
    recommendedFor:         ['interior', 'commercial'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'interior',
  },

  'dolly-out-soft': {
    id:                     'dolly-out-soft',
    label:                  'Afastamento suave',
    description:            'Câmera recua um pouco, mantendo a composição visível.',
    promptFragment:
      'short slow straight dolly backward retaining the visible composition',
    recommendedFor:         ['interior', 'facade', 'commercial'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'generic',
  },

  'lateral-tracking': {
    id:                     'lateral-tracking',
    label:                  'Travelling lateral',
    description:            'Câmera desliza um pouco, paralela ao ambiente visível.',
    promptFragment:
      'short stable lateral slide along the visible architecture',
    recommendedFor:         ['interior', 'facade', 'commercial'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'generic',
  },

  'orbit-soft': {
    id:                     'orbit-soft',
    label:                  'Orbit leve',
    description:            'Pequena rotação em torno do ponto focal — boa para mobiliário ou volumes.',
    promptFragment:
      'shallow local arc keeping the visible front face in view',
    recommendedFor:         ['interior', 'exterior'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'generic',
  },

  'vertical-pan': {
    id:                     'vertical-pan',
    label:                  'Panorâmica vertical',
    description:            'Pequeno giro vertical dentro da composição da imagem.',
    promptFragment:
      'small vertical tilt within the visible composition',
    recommendedFor:         ['facade', 'interior'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '9:16',
    intensityHint:          'normal',
    group:                  'generic',
  },

  'enter-room': {
    id:                     'enter-room',
    label:                  'Entrada no ambiente',
    description:            'Aproximação contida; outra vista pode orientar o frame final.',
    promptFragment:
      'short forward approach stopping before a visible threshold',
    recommendedFor:         ['interior'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'interior',
  },

  'facade-reveal': {
    id:                     'facade-reveal',
    label:                  'Reveal de fachada',
    description:            'Pequena subida ao longo da fachada já visível.',
    promptFragment:
      'small stable vertical rise along the already visible elevation',
    recommendedFor:         ['facade', 'exterior'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'normal',
    group:                  'facade',
  },

  'dolly-in-cinematic': {
    id:                     'dolly-in-cinematic',
    label:                  'Dolly-in cinematográfico',
    description:            'Aproximação contida com ritmo constante.',
    promptFragment:
      'short stable straight dolly forward with even pacing',
    recommendedFor:         ['interior', 'commercial'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'pronounced',
    group:                  'interior',
  },

  'drone-soft': {
    id:                     'drone-soft',
    label:                  'Drone suave',
    description:            'Deslocamento elevado contido, orientado pelas vistas do projeto.',
    promptFragment:
      'short stable elevated drift along the architecture visible in the supplied frames',
    recommendedFor:         ['facade', 'exterior'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'normal',
    group:                  'facade',
  },

  'zoom-editorial': {
    id:                     'zoom-editorial',
    label:                  'Zoom editorial',
    description:            'Push-in fechado em detalhe — boa para materiais e mobiliário.',
    promptFragment:
      'small optical zoom toward an already visible detail with fixed focus',
    recommendedFor:         ['interior'],
    recommendedDuration:    '5',
    recommendedAspectRatio: '1:1',
    intensityHint:          'subtle',
    group:                  'interior',
  },

  'parallax-subtle': {
    id:                     'parallax-subtle',
    label:                  'Parallax sutil',
    description:            'Movimento mínimo gerando profundidade — ótimo para redes sociais.',
    promptFragment:
      'minimal straight lateral translation with gentle local parallax',
    recommendedFor:         ['interior', 'social', 'commercial'],
    recommendedDuration:    '5',
    recommendedAspectRatio: '9:16',
    intensityHint:          'subtle',
    group:                  'social',
  },

  'walkthrough-interior': {
    id:                     'walkthrough-interior',
    label:                  'Walkthrough interno',
    description:            'Avanço curto na área visível; sem atravessar paredes ou móveis.',
    promptFragment:
      'short straight forward move in visible open space, stopping before obstacles',
    recommendedFor:         ['interior', 'commercial'],
    recommendedDuration:    '10',
    recommendedAspectRatio: '16:9',
    intensityHint:          'normal',
    group:                  'interior',
  },

  'static-ambient': {
    id:                     'static-ambient',
    label:                  'Quase estático',
    description:            'Sem translação — apenas leve respiração ambiental.',
    promptFragment:
      'locked-off tripod camera with zero translation, rotation or zoom',
    recommendedFor:         ['interior', 'facade', 'commercial'],
    recommendedDuration:    '5',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'social',
  },

  'horizontal-pan': {
    id:                     'horizontal-pan',
    label:                  'Panorâmica horizontal',
    description:            'Pequeno giro horizontal na composição visível.',
    promptFragment:
      'small horizontal rotation within the visible composition',
    recommendedFor:         ['exterior', 'facade'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'facade',
  },

  'institutional-reveal': {
    id:                     'institutional-reveal',
    label:                  'Reveal de recepção',
    description:            'Apresentação institucional — hospitalidade, premium.',
    promptFragment:
      'short straight approach to the already visible commercial space',
    recommendedFor:         ['commercial'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'commercial',
  },

  'real-estate-soft': {
    id:                     'real-estate-soft',
    label:                  'Imobiliário suave',
    description:            'Movimento sutil pensado para anúncio imobiliário.',
    promptFragment:
      'short straight drift toward the existing visible architecture',
    recommendedFor:         ['facade', 'interior'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'facade',
  },

  'social-loop': {
    id:                     'social-loop',
    label:                  'Loop para redes',
    description:            'Movimento curto e looável, ideal para Instagram/TikTok.',
    promptFragment:
      'minimal lateral drift returning along the same path to the starting composition',
    recommendedFor:         ['social', 'interior'],
    recommendedDuration:    '5',
    recommendedAspectRatio: '9:16',
    intensityHint:          'subtle',
    group:                  'social',
  },

  'lighting-reveal': {
    id:                     'lighting-reveal',
    label:                  'Reveal de iluminação',
    description:            'Variação suave de luz revelando o ambiente — fim de tarde ou amanhecer.',
    promptFragment:
      'locked-off camera with a small selected exposure change from existing light sources',
    recommendedFor:         ['interior', 'exterior'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'interior',
  },

  'golden-hour': {
    id:                     'golden-hour',
    label:                  'Fachada ao entardecer',
    description:            'Fachada banhada por luz quente — hero imobiliário premium.',
    promptFragment:
      'short lateral slide along the visible facade with a selected warm grade',
    recommendedFor:         ['facade'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'facade',
  },
}

// ── Agrupamentos para UI ─────────────────────────────────────────────────────

export const CAMERA_GROUPS: Record<CameraMotion['group'], { label: string; description: string; motionIds: CameraMotionId[] }> = {
  interior: {
    label:       'Interiores',
    description: 'Movimentos pensados para ambientes internos',
    motionIds: [
      'dolly-in-soft',
      'enter-room',
      'lateral-tracking',
      'zoom-editorial',
      'lighting-reveal',
      'walkthrough-interior',
      'dolly-in-cinematic',
    ],
  },
  facade: {
    label:       'Fachadas',
    description: 'Hero shots e revelação de elevação',
    motionIds: [
      'facade-reveal',
      'drone-soft',
      'horizontal-pan',
      'vertical-pan',
      'real-estate-soft',
      'golden-hour',
    ],
  },
  commercial: {
    label:       'Comercial / corporativo',
    description: 'Apresentação institucional',
    motionIds: [
      'institutional-reveal',
      'dolly-in-soft',
      'static-ambient',
      'lateral-tracking',
    ],
  },
  social: {
    label:       'Redes sociais',
    description: 'Movimentos curtos e looáveis',
    motionIds: [
      'parallax-subtle',
      'social-loop',
      'static-ambient',
    ],
  },
  generic: {
    label:       'Genéricos',
    description: 'Movimentos versáteis',
    motionIds: [
      'orbit-soft',
      'dolly-out-soft',
      'lateral-tracking',
      'vertical-pan',
    ],
  },
}

// ── Lista curada da superfície principal ─────────────────────────────────────
// Um movimento por intenção, com linguagem acessível para arquitetos —
// nada de jargão de cinema. O catálogo completo (18 movimentos agrupados)
// continua disponível nos Ajustes avançados.

export interface SimpleMotionChoice {
  id:          CameraMotionId
  label:       string          // pode divergir do label do catálogo (linguagem simplificada)
  description: string
}

export const SIMPLE_MOTION_CHOICES: SimpleMotionChoice[] = [
  { id: 'dolly-in-soft',      label: 'Aproximação suave',           description: 'A câmera avança devagar em direção ao ambiente.' },
  { id: 'dolly-out-soft',     label: 'Afastamento suave',           description: 'A câmera recua um pouco, mantendo a composição visível.' },
  { id: 'horizontal-pan',     label: 'Panorâmica lateral',          description: 'Giro suave revelando a composição ampla.' },
  { id: 'vertical-pan',       label: 'Movimento vertical',          description: 'Pequeno giro vertical dentro da composição visível.' },
  { id: 'lateral-tracking',   label: 'Travelling leve',             description: 'A câmera desliza em paralelo ao ambiente.' },
  { id: 'dolly-in-cinematic', label: 'Profundidade cinematográfica', description: 'Aproximação contida com ritmo constante.' },
  { id: 'static-ambient',     label: 'Câmera quase estática',       description: 'Sem deslocamento — só a luz e o ambiente respiram.' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCameraMotion(id: string): CameraMotion | undefined {
  return Object.hasOwn(CAMERA_MOTIONS, id) ? CAMERA_MOTIONS[id as CameraMotionId] : undefined
}

export function requireCameraMotion(id: string): CameraMotion {
  const m = getCameraMotion(id)
  if (!m) throw new Error(`Movimento de câmera desconhecido: ${id}`)
  return m
}

export function listCameraMotionsForArchetype(archetype: SceneArchetype): CameraMotion[] {
  return Object.values(CAMERA_MOTIONS).filter(m => m.recommendedFor.includes(archetype))
}

export function isCameraMotionId(id: string): id is CameraMotionId {
  return Object.hasOwn(CAMERA_MOTIONS, id)
}
