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

export type CameraIntensity = 'subtle' | 'normal' | 'pronounced'

export interface CameraMotion {
  id:                    CameraMotionId
  label:                 string
  description:           string                  // copy do card
  promptFragment:        string                  // fragmento injetado no prompt final
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
      'very slow dolly forward, gentle parallax between foreground and background, ' +
      'controlled and restrained motion',
    recommendedFor:         ['interior', 'commercial'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'interior',
  },

  'lateral-tracking': {
    id:                     'lateral-tracking',
    label:                  'Travelling lateral',
    description:            'Câmera desliza paralela ao ambiente, revelando o espaço.',
    promptFragment:
      'slow lateral tracking shot, gentle parallax between foreground elements and background, ' +
      'anamorphic cinematic feel, controlled and restrained motion',
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
      'gentle subtle orbit around the focal point, slow arc motion, ' +
      'parallax between foreground subject and background, controlled and restrained',
    recommendedFor:         ['interior', 'exterior'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'generic',
  },

  'vertical-pan': {
    id:                     'vertical-pan',
    label:                  'Panorâmica vertical',
    description:            'Pan vertical do chão ao teto — destaca verticalidade da arquitetura.',
    promptFragment:
      'slow vertical pan from foreground floor up to ceiling or sky, ' +
      'revealing architectural verticality, controlled and restrained',
    recommendedFor:         ['facade', 'interior'],
    recommendedDuration:    '6',
    recommendedAspectRatio: '9:16',
    intensityHint:          'normal',
    group:                  'generic',
  },

  'enter-room': {
    id:                     'enter-room',
    label:                  'Entrada no ambiente',
    description:            'Câmera entra de um ambiente para outro — ótimo para sequências.',
    promptFragment:
      'very slow dolly forward entering the room through a doorway or threshold, ' +
      'gentle parallax revealing the interior beyond, anamorphic cinematic feel',
    recommendedFor:         ['interior'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'interior',
  },

  'facade-reveal': {
    id:                     'facade-reveal',
    label:                  'Reveal de fachada',
    description:            'Crane revelando a elevação principal — hero shot imobiliário.',
    promptFragment:
      'slow gentle crane up from human eye-level, revealing the full architectural elevation ' +
      'against the sky, golden hour atmospheric light, parallax between foreground landscape ' +
      'and architecture, cinematic real estate hero shot',
    recommendedFor:         ['facade', 'exterior'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'normal',
    group:                  'facade',
  },

  'dolly-in-cinematic': {
    id:                     'dolly-in-cinematic',
    label:                  'Dolly-in cinematográfico',
    description:            'Aproximação mais marcada, com ritmo de cinema.',
    promptFragment:
      'cinematic dolly forward with pronounced depth, parallax between foreground and background, ' +
      'shallow depth of field, dramatic pacing, anamorphic feel',
    recommendedFor:         ['interior', 'commercial'],
    recommendedDuration:    '8',
    recommendedAspectRatio: '16:9',
    intensityHint:          'pronounced',
    group:                  'interior',
  },

  'drone-soft': {
    id:                     'drone-soft',
    label:                  'Drone suave',
    description:            'Movimento aéreo lento, revela contexto e entorno.',
    promptFragment:
      'slow low-altitude aerial drone motion, approaching architecture from above, ' +
      'parallax revealing surroundings, controlled and restrained',
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
      'very slow push-in zoom on architectural detail, gentle focus pull effect, ' +
      'shallow depth of field highlighting materials and texture',
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
      'minimal subtle parallax shift between foreground and background layers, ' +
      'barely perceptible camera translation, contemplative pace',
    recommendedFor:         ['interior', 'social', 'commercial'],
    recommendedDuration:    '5',
    recommendedAspectRatio: '9:16',
    intensityHint:          'subtle',
    group:                  'social',
  },

  'walkthrough-interior': {
    id:                     'walkthrough-interior',
    label:                  'Walkthrough interno',
    description:            'Câmera atravessa o espaço como em uma visita guiada.',
    promptFragment:
      'continuous interior walkthrough motion, slow forward translation through the space, ' +
      'gentle natural sway as if held by a steady operator, anamorphic cinematic feel',
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
      'static locked-off camera with no translation or rotation. Subtle environmental life only — ' +
      'soft natural light shifts, gentle ambient atmosphere',
    recommendedFor:         ['interior', 'facade', 'commercial'],
    recommendedDuration:    '5',
    recommendedAspectRatio: '16:9',
    intensityHint:          'subtle',
    group:                  'social',
  },

  'horizontal-pan': {
    id:                     'horizontal-pan',
    label:                  'Panorâmica horizontal',
    description:            'Pan suave revelando vista ampla.',
    promptFragment:
      'slow horizontal pan revealing the landscape or wide composition, ' +
      'parallax between architectural foreground and distant horizon, ' +
      'cinematic outdoor reveal',
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
      'slow institutional reveal of the reception or hospitality space, ' +
      'controlled forward motion, premium hospitality mood, soft directional lighting',
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
      'subtle real estate presentation motion, gentle forward drift with restrained parallax, ' +
      'warm welcoming light, controlled and restrained',
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
      'short subtle camera motion designed to loop seamlessly, gentle parallax, ' +
      'minimal translation, contemplative pace',
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
      'subtle camera motion combined with a soft natural lighting shift, ' +
      'sunset or sunrise atmosphere progression, warm light wash revealing materials',
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
      'slow gentle motion across a facade bathed in golden hour warm light, ' +
      'long soft shadows, anamorphic cinematic feel, premium real estate atmosphere',
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
      'lateral-tracking',
      'vertical-pan',
    ],
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCameraMotion(id: string): CameraMotion | undefined {
  return CAMERA_MOTIONS[id as CameraMotionId]
}

export function requireCameraMotion(id: string): CameraMotion {
  const m = CAMERA_MOTIONS[id as CameraMotionId]
  if (!m) throw new Error(`Movimento de câmera desconhecido: ${id}`)
  return m
}

export function listCameraMotionsForArchetype(archetype: SceneArchetype): CameraMotion[] {
  return Object.values(CAMERA_MOTIONS).filter(m => m.recommendedFor.includes(archetype))
}

export function isCameraMotionId(id: string): id is CameraMotionId {
  return id in CAMERA_MOTIONS
}
