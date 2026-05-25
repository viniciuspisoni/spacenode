// Análise da imagem de referência para o módulo Animar.
// Reaproveita o fidelity-engine (Claude 3.5 Sonnet via fal vision) e
// traduz o briefing arquitetônico em sugestões prontas para o usuário:
// cena, movimento de câmera, modelo, duração e proporção sugeridos.
//
// Sempre tem fallback heurístico — se a análise falhar, retorna defaults
// razoáveis. Se a flag NEXT_PUBLIC_ENABLE_AUTO_VIDEO_ANALYSIS estiver
// desligada, pula a chamada de IA e usa só fallback.

import { VIDEO_FLAGS } from './flags'
import { analyzeImage } from '@/lib/fidelity-engine'
import type { BriefingArquitetonico } from '@/lib/prompts'
import {
  detectSceneFromText,
  SCENE_TYPES,
  type SceneTypeId,
  type SceneArchetype,
} from './scenes'
import {
  CAMERA_MOTIONS,
  listCameraMotionsForArchetype,
  type CameraMotionId,
} from './cameraPresets'
import {
  recommendModelFor,
  DEFAULT_VIDEO_MODEL_ID,
  type VideoRecommendation,
} from './models'

export interface VideoReferenceAnalysis {
  sceneType:              SceneTypeId
  architectureType:       SceneArchetype
  suggestedCameraMotion:  CameraMotionId
  suggestedPrompt:        string
  suggestedModelId:       string
  suggestedDuration:      string
  suggestedAspectRatio:   string
  fidelityNotes:          string[]
  warnings:               string[]
  briefing?:              BriefingArquitetonico
  source:                 'ai' | 'fallback' | 'disabled'
}

// ── Fallback heurístico ─────────────────────────────────────────────────────

function fallbackAnalysis(reason: 'disabled' | 'failed'): VideoReferenceAnalysis {
  const sceneType = 'living'
  const scene     = SCENE_TYPES[sceneType]
  const motion    = CAMERA_MOTIONS[scene.defaultMotionId as CameraMotionId]

  return {
    sceneType,
    architectureType:      scene.archetype,
    suggestedCameraMotion: motion.id,
    suggestedPrompt:
      'Câmera avançando lentamente pela cena, preservando geometria, materiais e iluminação originais.',
    suggestedModelId:      DEFAULT_VIDEO_MODEL_ID,
    suggestedDuration:     motion.recommendedDuration,
    suggestedAspectRatio:  motion.recommendedAspectRatio,
    fidelityNotes:         ['preservar geometria, materiais, layout e aberturas da imagem'],
    warnings:              reason === 'disabled'
      ? ['Análise automática desativada — usando sugestões padrão']
      : ['Análise automática indisponível agora — usando sugestões padrão'],
    source: reason === 'disabled' ? 'disabled' : 'fallback',
  }
}

// ── Mapeamento briefing → sugestões ──────────────────────────────────────────

function archetypeToRecommendation(archetype: SceneArchetype): VideoRecommendation {
  if (archetype === 'interior')   return 'interior'
  if (archetype === 'exterior')   return 'exterior'
  if (archetype === 'facade')     return 'facade'
  if (archetype === 'commercial') return 'commercial'
  return 'social'
}

function pickCameraMotion(archetype: SceneArchetype, defaultMotionId: string): CameraMotionId {
  const all = listCameraMotionsForArchetype(archetype)
  if (all.length === 0) return defaultMotionId as CameraMotionId
  // Prioriza o default do scene; se não estiver no conjunto, pega o primeiro.
  const match = all.find(m => m.id === defaultMotionId)
  return (match ?? all[0]).id
}

function deriveFidelityNotes(briefing: BriefingArquitetonico): string[] {
  const notes: string[] = []
  if (briefing.materiais_aparentes) {
    notes.push(`preservar materiais visíveis: ${briefing.materiais_aparentes}`)
  }
  if (briefing.aberturas) {
    notes.push(`preservar aberturas: ${briefing.aberturas}`)
  }
  if (briefing.geometria_principal) {
    notes.push(`preservar geometria: ${briefing.geometria_principal}`)
  }
  if (briefing.elementos_preservar?.length) {
    const top = briefing.elementos_preservar.slice(0, 3).join(', ')
    notes.push(`preservar ${top}`)
  }
  return notes
}

function buildSuggestedPrompt(briefing: BriefingArquitetonico, sceneType: SceneTypeId): string {
  const scene = SCENE_TYPES[sceneType]
  const tipo  = briefing.tipo_projeto || scene.label.toLowerCase()
  return (
    `Movimento de câmera contido em ${tipo}, ` +
    'preservando geometria, materiais, mobiliário e iluminação originais.'
  )
}

// ── Função principal ────────────────────────────────────────────────────────

export async function analyzeVideoReferenceImage(
  imageUrl: string,
): Promise<VideoReferenceAnalysis> {
  if (!VIDEO_FLAGS.enableAutoVideoAnalysis) {
    return fallbackAnalysis('disabled')
  }

  try {
    const briefing = await analyzeImage(imageUrl)

    const sceneTypeFromTipo  = detectSceneFromText(briefing.tipo_projeto ?? '')
    const sceneTypeFromAmbient =
      briefing.geometria_principal
        ? detectSceneFromText(briefing.geometria_principal)
        : sceneTypeFromTipo
    const sceneType = sceneTypeFromTipo === 'living' ? sceneTypeFromAmbient : sceneTypeFromTipo
    const scene     = SCENE_TYPES[sceneType]

    const motionId = pickCameraMotion(scene.archetype, scene.defaultMotionId)
    const motion   = CAMERA_MOTIONS[motionId]

    const recommendation = archetypeToRecommendation(scene.archetype)
    const model          = recommendModelFor(recommendation)

    return {
      sceneType,
      architectureType:      scene.archetype,
      suggestedCameraMotion: motionId,
      suggestedPrompt:       buildSuggestedPrompt(briefing, sceneType),
      suggestedModelId:      model.id,
      suggestedDuration:     motion.recommendedDuration,
      suggestedAspectRatio:  motion.recommendedAspectRatio,
      fidelityNotes:         deriveFidelityNotes(briefing),
      warnings:              [],
      briefing,
      source:                'ai',
    }
  } catch (err) {
    console.error('[video/analyzeReference] falhou:', (err as Error).message)
    return fallbackAnalysis('failed')
  }
}
