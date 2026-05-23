// Taxonomia de cenas arquitetônicas. Cada cena traz:
//   - archetype:        agrupador macro (interior/exterior/facade/commercial/social)
//   - label:            copy curto exibido na UI
//   - description:      tooltip / detalhe
//   - promptFragment:   fragmento cinematográfico injetado no prompt final
//   - defaultMotionId:  movimento de câmera sugerido (referenciado em cameraPresets.ts)
//   - aliases:          rótulos comuns que a análise da imagem pode devolver
//
// Os fragmentos preservam o estilo dos prompts que estavam em route.ts —
// movimento contido, parallax, profundidade rasa, sensação anamórfica.

export type SceneArchetype = 'interior' | 'exterior' | 'facade' | 'commercial' | 'social'

export type SceneTypeId =
  | 'living'
  | 'kitchen'
  | 'bedroom'
  | 'bathroom'
  | 'office'
  | 'commercial'
  | 'facade'
  | 'terrace'
  | 'exterior'
  | 'detail'
  | 'static'

export interface SceneType {
  id:              SceneTypeId
  archetype:       SceneArchetype
  label:           string
  description:     string
  promptFragment:  string
  defaultMotionId: string                // referencia lib/video/cameraPresets
  aliases:         string[]
}

export const SCENE_TYPES: Record<SceneTypeId, SceneType> = {
  living: {
    id:             'living',
    archetype:      'interior',
    label:          'Sala',
    description:    'Estar, jantar, área social interna',
    promptFragment:
      'living room interior, gentle parallax between foreground furniture and background wall, ' +
      'soft natural light wash from windows, shallow depth of field on foreground objects, ' +
      'anamorphic cinematic feel',
    defaultMotionId: 'dolly-in-soft',
    aliases:         ['sala', 'estar', 'jantar', 'living', 'social', 'lounge'],
  },

  kitchen: {
    id:             'kitchen',
    archetype:      'interior',
    label:          'Cozinha',
    description:    'Cozinha, copa, ilha gourmet',
    promptFragment:
      'kitchen interior with island and pendant lights, soft natural light from windows, ' +
      'shallow depth of field on foreground chairs and table, anamorphic cinematic feel',
    defaultMotionId: 'enter-room',
    aliases:         ['cozinha', 'kitchen', 'gourmet', 'copa'],
  },

  bedroom: {
    id:             'bedroom',
    archetype:      'interior',
    label:          'Quarto',
    description:    'Dormitório, suíte, quarto principal',
    promptFragment:
      'bedroom interior, soft warm ambient light, intimate and contemplative atmosphere, ' +
      'shallow depth of field, anamorphic cinematic feel',
    defaultMotionId: 'lateral-tracking',
    aliases:         ['quarto', 'dormitório', 'bedroom', 'suíte', 'suite'],
  },

  bathroom: {
    id:             'bathroom',
    archetype:      'interior',
    label:          'Banheiro',
    description:    'Lavabo, banheiro, spa',
    promptFragment:
      'bathroom interior, soft diffuse lighting, polished surfaces and tilework, ' +
      'shallow depth of field, contemplative pace',
    defaultMotionId: 'parallax-subtle',
    aliases:         ['banheiro', 'lavabo', 'bathroom', 'spa', 'wc'],
  },

  office: {
    id:             'office',
    archetype:      'commercial',
    label:          'Escritório',
    description:    'Home office, sala comercial, coworking',
    promptFragment:
      'office interior with desk and shelving, soft natural light, focused contemplative mood, ' +
      'shallow depth of field, professional pacing',
    defaultMotionId: 'dolly-in-soft',
    aliases:         ['escritório', 'home office', 'office', 'workspace', 'estudio'],
  },

  commercial: {
    id:             'commercial',
    archetype:      'commercial',
    label:          'Comercial',
    description:    'Recepção, loja, restaurante, espaço corporativo',
    promptFragment:
      'commercial interior, premium hospitality atmosphere, soft directional light, ' +
      'institutional but warm tone, anamorphic cinematic feel',
    defaultMotionId: 'institutional-reveal',
    aliases:         ['comercial', 'loja', 'restaurante', 'recepção', 'showroom', 'hotel'],
  },

  facade: {
    id:             'facade',
    archetype:      'facade',
    label:          'Fachada',
    description:    'Elevação principal, vista frontal do edifício',
    promptFragment:
      'architectural facade, golden hour atmospheric light, parallax between foreground ' +
      'landscape and architecture, cinematic real estate hero shot',
    defaultMotionId: 'facade-reveal',
    aliases:         ['fachada', 'facade', 'elevation', 'frente', 'frontal'],
  },

  terrace: {
    id:             'terrace',
    archetype:      'exterior',
    label:          'Varanda',
    description:    'Terraço, varanda, sacada com vista',
    promptFragment:
      'terrace with open view, parallax between architectural foreground and distant horizon, ' +
      'golden atmospheric light, cinematic outdoor reveal',
    defaultMotionId: 'horizontal-pan',
    aliases:         ['varanda', 'terraço', 'sacada', 'terrace', 'balcony'],
  },

  exterior: {
    id:             'exterior',
    archetype:      'exterior',
    label:          'Área externa',
    description:    'Jardim, piscina, paisagismo, área de lazer',
    promptFragment:
      'exterior landscape area with vegetation, soft natural light, gentle ambient atmosphere, ' +
      'shallow depth of field on foreground elements',
    defaultMotionId: 'drone-soft',
    aliases:         ['externa', 'jardim', 'piscina', 'exterior', 'paisagismo', 'lazer'],
  },

  detail: {
    id:             'detail',
    archetype:      'interior',
    label:          'Detalhe',
    description:    'Close em material, mobiliário, elemento construtivo',
    promptFragment:
      'architectural detail close framing, gentle focus pull effect, intimate framing, ' +
      'shallow depth of field highlighting materials and texture, contemplative pace',
    defaultMotionId: 'zoom-editorial',
    aliases:         ['detalhe', 'detail', 'close', 'macro'],
  },

  static: {
    id:             'static',
    archetype:      'interior',
    label:          'Câmera fixa',
    description:    'Movimento ambiental sem translação de câmera',
    promptFragment:
      'static locked-off composition. Subtle environmental life only — soft natural light shifts, ' +
      'gentle ambient atmosphere. Contemplative architectural composition.',
    defaultMotionId: 'static-ambient',
    aliases:         ['fixa', 'estática', 'static', 'parada'],
  },
}

export const SCENE_TYPE_ORDER: SceneTypeId[] = [
  'living',
  'kitchen',
  'bedroom',
  'bathroom',
  'office',
  'commercial',
  'facade',
  'terrace',
  'exterior',
  'detail',
  'static',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getSceneType(id: string): SceneType | undefined {
  return SCENE_TYPES[id as SceneTypeId]
}

export function isSceneTypeId(id: string): id is SceneTypeId {
  return id in SCENE_TYPES
}

// Best-effort: dado um texto livre (briefing.tipo_projeto), tenta deduzir
// a cena. Usado pela análise automática como fallback antes de pedir
// ao usuário.
export function detectSceneFromText(text: string): SceneTypeId {
  const t = text.toLowerCase()
  for (const id of SCENE_TYPE_ORDER) {
    const scene = SCENE_TYPES[id]
    if (scene.aliases.some(alias => t.includes(alias))) return id
  }
  // Sem match — escolhe interior genérico
  return 'living'
}
