// lib/spaces/preservation.ts
//
// Camada de INTENÇÃO do Spaces — traduz a ação do usuário (eixo) em um nível
// de preservação claro e nos parâmetros de comportamento daquele nível.
//
// Regra de produto (founder, 2026-06-23): a imagem upada é a autoridade do
// projeto. STRICT_SOURCE_LOCK é o PADRÃO de qualquer ação que não peça
// explicitamente uma nova câmera/vista. ARCHITECTURAL_DNA_LOCK só entra quando
// a ação é "nova vista do mesmo projeto" (eixo Ângulo). CONTROLLED_EXPLORATION
// nunca é padrão — fica reservado a um modo explicitamente experimental.

import type { Axis } from './types'

export type SpacesPreservationLevel =
  | 'STRICT_SOURCE_LOCK'
  | 'ARCHITECTURAL_DNA_LOCK'
  | 'CONTROLLED_EXPLORATION'

// Rótulo arquitetônico da ação (salvo em vistas.spaces_mode). É o "o quê" que o
// usuário pediu — orienta o bloco USER INTENT do prompt e a UI.
export type SpacesMode =
  | 'luz'        // iluminação
  | 'clima'      // céu/atmosfera/estação sem mexer em arquitetura
  | 'material'   // troca pontual de material
  | 'detalhe'    // aproximação/ênfase de uma região, sem redesenhar
  | 'cena'       // contexto/entorno/vegetação com controle
  | 'camera'     // nova vista do mesmo projeto

// Comportamento por nível — consumido pelo prompt builder e pela escolha de
// parâmetros do provider. NÃO é "criatividade": é o grau em que a câmera pode
// se mover. Geometria/volumetria/aberturas/materiais permanecem travados em
// STRICT e ARCH; só relaxam (de forma controlada) em EXPLORATION.
export interface PreservationProfile {
  level:               SpacesPreservationLevel
  // A câmera/enquadramento podem mudar? (true só para nova vista)
  allowCameraChange:   boolean
  // O modelo pode inferir uma perspectiva nova do mesmo edifício?
  allowNewPerspective: boolean
  // Intensidade de transformação desejada do provider (0..1). Quanto menor,
  // mais o resultado deve grudar na referência. Usado onde o provider expõe
  // algum controle; documentado como intenção quando não expõe.
  transformStrength:   number
}

export const PRESERVATION_PROFILES: Record<SpacesPreservationLevel, PreservationProfile> = {
  STRICT_SOURCE_LOCK: {
    level:               'STRICT_SOURCE_LOCK',
    allowCameraChange:   false,
    allowNewPerspective: false,
    transformStrength:   0.15,
  },
  ARCHITECTURAL_DNA_LOCK: {
    level:               'ARCHITECTURAL_DNA_LOCK',
    allowCameraChange:   true,
    allowNewPerspective: true,
    transformStrength:   0.45,
  },
  CONTROLLED_EXPLORATION: {
    level:               'CONTROLLED_EXPLORATION',
    allowCameraChange:   true,
    allowNewPerspective: true,
    transformStrength:   0.7,
  },
}

// ── Mapa eixo → modo + nível ──────────────────────────────────
//
// O eixo Ângulo (nova câmera) é o ÚNICO que sobe para ARCHITECTURAL_DNA_LOCK.
// Tudo o mais (luz, horário/clima, detalhe, material) é STRICT_SOURCE_LOCK.
// Eixos não mapeados caem em STRICT por segurança (default conservador).
const AXIS_MODE: Record<Axis, SpacesMode> = {
  iluminacao: 'luz',
  angulo:     'camera',
  horario:    'clima',
  detalhe:    'detalhe',
}

export function modeForAxis(axis: Axis): SpacesMode {
  return AXIS_MODE[axis] ?? 'luz'
}

export function levelForMode(mode: SpacesMode): SpacesPreservationLevel {
  // Só "camera" (nova vista) sobe para ARCH lock. O resto trava na fonte.
  return mode === 'camera' ? 'ARCHITECTURAL_DNA_LOCK' : 'STRICT_SOURCE_LOCK'
}

// Detalhe é o único modo STRICT que ainda permite o enquadramento FECHAR (crop/
// zoom da MESMA vista). Geometria, materiais, proporções e estilo continuam
// travados — só o recorte aproxima. Consumido pelo prompt builder e pelas
// validações (que não devem penalizar um crop como se fosse violação).
export function modeAllowsCloserCrop(mode: SpacesMode): boolean {
  return mode === 'detalhe'
}

export function levelForAxis(axis: Axis): SpacesPreservationLevel {
  return levelForMode(modeForAxis(axis))
}

export function profileForLevel(level: SpacesPreservationLevel): PreservationProfile {
  return PRESERVATION_PROFILES[level]
}

// Rótulo curto pra UI/logs.
export const MODE_LABEL: Record<SpacesMode, string> = {
  luz:      'Luz',
  clima:    'Clima',
  material: 'Material',
  detalhe:  'Detalhe',
  cena:     'Cena',
  camera:   'Câmera',
}

export const LEVEL_LABEL: Record<SpacesPreservationLevel, string> = {
  STRICT_SOURCE_LOCK:     'Trava de fonte',
  ARCHITECTURAL_DNA_LOCK: 'Trava de DNA arquitetônico',
  CONTROLLED_EXPLORATION: 'Exploração controlada',
}

export function isPreservationLevel(v: unknown): v is SpacesPreservationLevel {
  return v === 'STRICT_SOURCE_LOCK'
      || v === 'ARCHITECTURAL_DNA_LOCK'
      || v === 'CONTROLLED_EXPLORATION'
}
