// Taxonomia de cenas arquitetônicas. Cada cena traz:
//   - archetype:        agrupador macro (interior/exterior/facade/commercial/social)
//   - label:            copy curto exibido na UI
//   - description:      tooltip / detalhe
//   - promptFragment:   fragmento cinematográfico injetado no prompt final
//   - defaultMotionId:  movimento de câmera sugerido (referenciado em cameraPresets.ts)
//   - aliases:          rótulos comuns que a análise da imagem pode devolver
//
// Contexto descritivo apenas: câmera e luz são resolvidas pela política do take.

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
      'the living or dining space already shown in the reference',
    defaultMotionId: 'dolly-in-soft',
    aliases:         ['sala', 'estar', 'jantar', 'living', 'social', 'lounge'],
  },

  kitchen: {
    id:             'kitchen',
    archetype:      'interior',
    label:          'Cozinha',
    description:    'Cozinha, copa, ilha gourmet',
    promptFragment:
      'the kitchen already shown in the reference, keeping its existing cabinetry and appliances',
    defaultMotionId: 'dolly-in-soft',
    aliases:         ['cozinha', 'kitchen', 'gourmet', 'copa'],
  },

  bedroom: {
    id:             'bedroom',
    archetype:      'interior',
    label:          'Quarto',
    description:    'Dormitório, suíte, quarto principal',
    promptFragment:
      'the bedroom already shown in the reference',
    defaultMotionId: 'lateral-tracking',
    aliases:         ['quarto', 'dormitório', 'bedroom', 'suíte', 'suite'],
  },

  bathroom: {
    id:             'bathroom',
    archetype:      'interior',
    label:          'Banheiro',
    description:    'Lavabo, banheiro, spa',
    promptFragment:
      'the bathroom already shown in the reference, keeping its existing finishes and fixtures',
    defaultMotionId: 'parallax-subtle',
    aliases:         ['banheiro', 'lavabo', 'bathroom', 'spa', 'wc'],
  },

  office: {
    id:             'office',
    archetype:      'commercial',
    label:          'Escritório',
    description:    'Home office, sala comercial, coworking',
    promptFragment:
      'the workspace already shown in the reference',
    defaultMotionId: 'dolly-in-soft',
    aliases:         ['escritório', 'home office', 'office', 'workspace', 'estudio'],
  },

  commercial: {
    id:             'commercial',
    archetype:      'commercial',
    label:          'Comercial',
    description:    'Recepção, loja, restaurante, espaço corporativo',
    promptFragment:
      'the commercial space already shown in the reference',
    defaultMotionId: 'institutional-reveal',
    aliases:         ['comercial', 'loja', 'restaurante', 'recepção', 'showroom', 'hotel'],
  },

  facade: {
    id:             'facade',
    archetype:      'facade',
    label:          'Fachada',
    description:    'Elevação principal, vista frontal do edifício',
    promptFragment:
      'the visible architectural elevation already shown in the reference',
    defaultMotionId: 'facade-reveal',
    aliases:         ['fachada', 'facade', 'elevation', 'frente', 'frontal'],
  },

  terrace: {
    id:             'terrace',
    archetype:      'exterior',
    label:          'Varanda',
    description:    'Terraço, varanda, sacada com vista',
    promptFragment:
      'the terrace and visible view already shown in the reference',
    defaultMotionId: 'horizontal-pan',
    aliases:         ['varanda', 'terraço', 'sacada', 'terrace', 'balcony'],
  },

  exterior: {
    id:             'exterior',
    archetype:      'exterior',
    label:          'Área externa',
    description:    'Jardim, piscina, paisagismo, área de lazer',
    promptFragment:
      'the exterior area and landscape already shown in the reference',
    defaultMotionId: 'parallax-subtle',
    aliases:         ['externa', 'jardim', 'piscina', 'exterior', 'paisagismo', 'lazer'],
  },

  detail: {
    id:             'detail',
    archetype:      'interior',
    label:          'Detalhe',
    description:    'Close em material, mobiliário, elemento construtivo',
    promptFragment:
      'the architectural detail already shown in the reference, maintaining readable surface detail',
    defaultMotionId: 'zoom-editorial',
    aliases:         ['detalhe', 'detail', 'close', 'macro'],
  },

  static: {
    id:             'static',
    archetype:      'interior',
    label:          'Câmera fixa',
    description:    'Movimento ambiental sem translação de câmera',
    promptFragment:
      'the architectural composition already shown in the reference',
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
  return Object.hasOwn(SCENE_TYPES, id) ? SCENE_TYPES[id as SceneTypeId] : undefined
}

export function isSceneTypeId(id: string): id is SceneTypeId {
  return Object.hasOwn(SCENE_TYPES, id)
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
