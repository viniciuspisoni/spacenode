// Rótulos e resumos do Animar.
//
// Existe porque a simplificação move os controles para dentro de folhas: a
// linha só é útil se souber dizer, em 30 caracteres, o que está valendo. Os
// resumos daqui são a única fonte desse texto — e a regra que os governa é a
// do contrato (docs/VIDRO-NO-APP.md §3.3): entra o que o usuário ESCOLHEU,
// não o que veio no default.
//
// Os NOMES dos movimentos saem de CAMERA_MOTIONS. Antes havia dois conjuntos
// (SIMPLE_MOTION_CHOICES rebatizava 4 dos 19: 'Travelling leve' era
// 'Travelling lateral', 'Movimento vertical' era 'Panorâmica vertical'), e o
// mesmo movimento aparecia com dois nomes conforme a lista. Agora
// SIMPLE_MOTION_CHOICES contribui só com a ORDEM dos mais usados.

import { summarize } from '@/components/app/glass'
import {
  CAMERA_MOTIONS,
  SIMPLE_MOTION_CHOICES,
  type CameraIntensity,
  type CameraMotion,
  type CameraMotionId,
} from '@/lib/video/cameraPresets'
import { SCENE_TYPES } from '@/lib/video/scenes'
import { listAvailableVideoModels, type VideoModel } from '@/lib/video/models'
import {
  VIDEO_TYPE_PRESETS,
  resolvePresetDefaults,
  type VideoTypeId,
} from '@/lib/video/videoPresets'
import type { FidelityMode } from '@/lib/video/promptBuilder'
import type { AnimateState } from '../_hooks/useAnimateState'

// ── Tipo de vídeo ────────────────────────────────────────────────────────────
// O label é o do catálogo (é o nome do produto, aparece no resultado e no
// histórico); a nota é microcópia de contexto — o `tagline` do preset é uma
// frase inteira e não cabe num cartão de 180px.
export const VIDEO_TYPE_NOTES: Record<VideoTypeId, string> = {
  cinematic:  'Portfólio',
  tour:       'Interiores',
  reels:      'Instagram · TikTok',
  commercial: 'Proposta ao cliente',
  detail:     'Materiais e texturas',
}

// ── Intensidade ──────────────────────────────────────────────────────────────
export const INTENSITY_ORDER: CameraIntensity[] = ['subtle', 'normal', 'cinematic', 'pronounced']

export const INTENSITY_LABELS: Record<CameraIntensity, string> = {
  subtle:     'Sutil',
  normal:     'Moderado',
  cinematic:  'Cinematográfico',
  pronounced: 'Dinâmico',
}

export const INTENSITY_HINTS: Record<CameraIntensity, string> = {
  subtle:     'Movimento quase imperceptível — o mais seguro para preservar o projeto.',
  normal:     'Movimento presente, ainda contido e elegante.',
  cinematic:  'Ritmo de cinema, com profundidade e presença.',
  pronounced: 'Mais energia — indicado para redes sociais.',
}

// ── Fidelidade ───────────────────────────────────────────────────────────────
export const FIDELITY_ORDER: FidelityMode[] = ['max', 'balanced', 'creative']

export const FIDELITY_LABELS: Record<FidelityMode, string> = {
  max:      'Máxima fidelidade',
  balanced: 'Equilíbrio',
  creative: 'Mais liberdade',
}

export const FIDELITY_NOTES: Record<FidelityMode, string> = {
  max:      'Geometria, materiais e mobiliário',
  balanced: 'Adapta luz e atmosfera',
  creative: 'Reinterpreta, mantendo a intenção',
}

// ── Atmosfera ────────────────────────────────────────────────────────────────
// O estado guarda o TEXTO cru (vai direto para o prompt), não o id do chip.
export const ATMOSPHERES: { label: string; value: string }[] = [
  { label: 'Sem ajuste',      value: ''                                          },
  { label: 'Fim de tarde',    value: 'golden hour warm light, long soft shadows' },
  { label: 'Luz da manhã',    value: 'morning soft natural light, cool tones'    },
  { label: 'Noturna',         value: 'night scene with warm interior lighting'   },
  { label: 'Neutra/nublada',  value: 'overcast diffuse natural light'            },
  { label: 'Aconchegante',    value: 'warm cozy atmosphere, soft ambient light'  },
]

export function atmosphereLabel(value: string): string {
  return ATMOSPHERES.find(a => a.value.trim() === value.trim())?.label ?? 'Personalizada'
}

// ── Formato ──────────────────────────────────────────────────────────────────
export const FORMAT_OPTIONS: { id: string; label: string; note: string }[] = [
  { id: 'auto', label: 'Original', note: 'Proporção da imagem' },
  { id: '16:9', label: '16:9',     note: 'Apresentações' },
  { id: '9:16', label: '9:16',     note: 'Reels · Stories' },
  { id: '1:1',  label: '1:1',      note: 'Feed' },
]

/** Só formatos que ALGUM motor disponível entrega de verdade. */
export function offeredFormats(): typeof FORMAT_OPTIONS {
  const offered = new Set(listAvailableVideoModels().flatMap(m => m.supportedAspectRatios))
  return FORMAT_OPTIONS.filter(o => offered.has(o.id))
}

export function formatLabel(aspectRatio: string): string {
  return FORMAT_OPTIONS.find(o => o.id === aspectRatio)?.label ?? aspectRatio
}

// ── Movimentos ───────────────────────────────────────────────────────────────
/** Os 7 mais usados, na ordem curada — com o nome do catálogo. */
export const QUICK_MOTION_IDS: CameraMotionId[] = SIMPLE_MOTION_CHOICES.map(c => c.id)

export const AUTO_MOTION_LABEL = 'Automático'

/** Pílulas trafegam pelo rótulo; aqui volta o id. Rótulos são únicos. */
export function motionIdByLabel(label: string): CameraMotionId | undefined {
  return (Object.keys(CAMERA_MOTIONS) as CameraMotionId[]).find(
    id => CAMERA_MOTIONS[id].label === label,
  )
}

export function motionLabels(ids: readonly CameraMotionId[]): string[] {
  return ids.map(id => CAMERA_MOTIONS[id].label)
}

// ── A configuração mais barata que existe ────────────────────────────────────
// O cadastro dá 80 nodes e o preset default custa 280: sem esta conta a conta
// gratuita bate em "Saldo insuficiente" sem saber que existe saída. É a razão
// de o motor ter subido do bloco recolhido para a folha "Formato e custo".
export function cheapestFit(credits: number): { label: string; duration: string; cost: number } | null {
  let best: { label: string; duration: string; cost: number } | null = null
  for (const m of listAvailableVideoModels()) {
    for (const d of m.supportedDurations) {
      const cost = m.costInNodes[d]
      if (typeof cost !== 'number' || cost > credits) continue
      if (!best || cost < best.cost) best = { label: m.label, duration: d, cost }
    }
  }
  return best
}

// ── Resumos das três linhas ──────────────────────────────────────────────────

export function cameraSummary(state: AnimateState, resolvedMotion: CameraMotion): string {
  // Com 'Automático' o movimento continua sendo um valor concreto — mostrar
  // "Automático" esconderia justamente o que a linha existe para revelar.
  return summarize([resolvedMotion.label, INTENSITY_LABELS[state.intensity]])
}

export function outputSummary(state: AnimateState, model: VideoModel, nodeCost: number): string {
  return summarize([
    formatLabel(state.aspectRatio),
    `${state.duration}s`,
    model.label,
    `${nodeCost} nodes`,
  ])
}

export function directionSummary(state: AnimateState): string {
  const preset = resolvePresetDefaults(VIDEO_TYPE_PRESETS[state.videoType])
  // A cena base é a que a análise detectou (useAnimateState:'analysisDone'
  // sobrescreve sceneType). Ela não é desvio: o usuário não a escolheu.
  const baseScene = state.analysis?.sceneType ?? 'living'

  const parts = [
    state.userPrompt.trim()                  ? 'Direção escrita' : '',
    state.fidelityMode !== preset.fidelityMode ? FIDELITY_LABELS[state.fidelityMode] : '',
    state.sceneType !== baseScene            ? SCENE_TYPES[state.sceneType].label : '',
    state.atmosphere.trim()                  ? atmosphereLabel(state.atmosphere) : '',
    state.avoidPeople                        ? 'Sem pessoas' : '',
    state.endImagePreview                    ? 'Frame final' : '',
  ]

  return summarize(parts) || 'Padrão do preset'
}
