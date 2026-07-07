'use client'

// Estado único do módulo Animar (fluxo single-page orientado a presets).
//
// Modelo mental:
//   1. usuário envia a imagem base;
//   2. escolhe o TIPO DE VÍDEO (preset de arquitetura) — que aplica defaults
//      de motor, movimento, duração, formato e intensidade;
//   3. ajusta o que quiser (movimento, formato, duração, intensidade, direção
//      criativa) — escolhas explícitas NUNCA são sobrescritas pela análise;
//   4. Ajustes avançados guardam o resto (fidelidade, cena, atmosfera,
//      frame final, catálogo completo de movimentos, motor).
//
// A análise automática (quando a flag estiver ligada) contribui com:
// tipo de cena detectado, prompt sugerido, notas de preservação e o
// movimento usado quando "Automático" está selecionado.

import { useEffect, useReducer, useRef } from 'react'
import {
  getNodeCost,
  requireVideoModel,
  type VideoModel,
} from '@/lib/video/models'
import { SCENE_TYPES, type SceneTypeId } from '@/lib/video/scenes'
import {
  CAMERA_MOTIONS,
  type CameraIntensity,
  type CameraMotion,
  type CameraMotionId,
} from '@/lib/video/cameraPresets'
import {
  DEFAULT_VIDEO_TYPE,
  VIDEO_TYPE_PRESETS,
  resolvePresetDefaults,
  type MotionChoice,
  type VideoTypeId,
} from '@/lib/video/videoPresets'
import type { FidelityMode } from '@/lib/video/promptBuilder'
import type { VideoReferenceAnalysis } from '@/lib/video/analyzeReference'

export type GenerationStatus =
  | 'idle'
  | 'analyzing'
  | 'ready'
  | 'generating'
  | 'success'
  | 'error'

export interface GenerationResult {
  outputUrl:    string
  inputUrl:     string
  modelId:      string
  duration:     string
  aspectRatio:  string
  intensity:    CameraIntensity
  videoType:    VideoTypeId
  motionId?:    CameraMotionId
  sceneType?:   SceneTypeId
  nodesCharged: number
  createdAt:    number
}

export interface AnimateState {
  // Mídia
  imageFile:        File   | null
  imagePreview:     string | null
  imageWasCropped:  boolean
  endImageFile:     File   | null
  endImagePreview:  string | null
  cachedInputUrl:   string | null    // fal.storage.upload result após análise

  // Análise automática
  analysis:         VideoReferenceAnalysis | null
  analysisError:    string | null

  // Parâmetros
  videoType:        VideoTypeId
  modelId:          string
  duration:         string
  aspectRatio:      string           // 'auto' = manter proporção original
  sceneType:        SceneTypeId
  motionChoice:     MotionChoice     // 'auto' | CameraMotionId explícito
  intensity:        CameraIntensity
  fidelityMode:     FidelityMode
  atmosphere:       string
  avoidPeople:      boolean
  userPrompt:       string

  // Geração
  status:           GenerationStatus
  elapsed:          number
  result:           GenerationResult | null
  error:            string | null

  // Saldo
  credits:          number
}

type Action =
  | { type: 'setImage';           file: File | null; preview: string | null; wasCropped: boolean }
  | { type: 'setEndImage';        file: File | null; preview: string | null }
  | { type: 'startAnalyzing' }
  | { type: 'analysisDone';       analysis: VideoReferenceAnalysis; inputUrl: string }
  | { type: 'analysisFailed';     message: string }
  | { type: 'applyPreset';        videoType: VideoTypeId }
  | { type: 'setModel';           modelId: string }
  | { type: 'setDuration';        duration: string }
  | { type: 'setAspectRatio';     aspectRatio: string }
  | { type: 'setScene';           sceneType: SceneTypeId }
  | { type: 'setMotionChoice';    motionChoice: MotionChoice }
  | { type: 'setIntensity';       intensity: CameraIntensity }
  | { type: 'setFidelity';        fidelityMode: FidelityMode }
  | { type: 'setAtmosphere';      atmosphere: string }
  | { type: 'setAvoidPeople';     avoidPeople: boolean }
  | { type: 'setUserPrompt';      userPrompt: string }
  | { type: 'startGenerating' }
  | { type: 'generationSuccess'; result: GenerationResult; newCredits: number }
  | { type: 'generationError';   message: string }
  | { type: 'tickElapsed' }
  | { type: 'reset' }
  | { type: 'resetResult' }
  | { type: 'setCredits';         credits: number }

function initialState(credits: number): AnimateState {
  const preset   = VIDEO_TYPE_PRESETS[DEFAULT_VIDEO_TYPE]
  const defaults = resolvePresetDefaults(preset)
  return {
    imageFile:       null,
    imagePreview:    null,
    imageWasCropped: false,
    endImageFile:    null,
    endImagePreview: null,
    cachedInputUrl:  null,
    analysis:        null,
    analysisError:   null,
    videoType:       preset.id,
    modelId:         defaults.modelId,
    duration:        defaults.duration,
    aspectRatio:     defaults.aspectRatio,
    sceneType:       'living',
    motionChoice:    defaults.motionId,
    intensity:       defaults.intensity,
    fidelityMode:    defaults.fidelityMode,
    atmosphere:      '',
    avoidPeople:     false,
    userPrompt:      '',
    status:          'idle',
    elapsed:         0,
    result:          null,
    error:           null,
    credits,
  }
}

function reducer(state: AnimateState, action: Action): AnimateState {
  switch (action.type) {
    case 'setImage':
      return {
        ...state,
        imageFile:       action.file,
        imagePreview:    action.preview,
        imageWasCropped: action.wasCropped,
        cachedInputUrl:  null,           // nova imagem invalida o upload anterior
        analysis:        null,
        analysisError:   null,
        result:          null,
        error:           null,
        status:          'idle',
      }

    case 'setEndImage':
      return {
        ...state,
        endImageFile:    action.file,
        endImagePreview: action.preview,
      }

    case 'startAnalyzing':
      return { ...state, status: 'analyzing', analysisError: null }

    case 'analysisDone': {
      const a = action.analysis
      // A análise informa (cena, prompt sugerido, notas) mas não sobrescreve
      // escolhas do usuário: o preset é dono de motor/duração/formato; o
      // movimento sugerido só é usado quando 'Automático' está selecionado
      // (resolvido na geração); o prompt sugerido vira botão "Usar sugestão".
      return {
        ...state,
        status:         'ready',
        analysis:       a,
        cachedInputUrl: action.inputUrl,
        sceneType:      a.sceneType,
      }
    }

    case 'analysisFailed':
      return { ...state, status: 'ready', analysisError: action.message }

    case 'applyPreset': {
      const preset   = VIDEO_TYPE_PRESETS[action.videoType]
      const defaults = resolvePresetDefaults(preset)
      return {
        ...state,
        videoType:    preset.id,
        modelId:      defaults.modelId,
        duration:     defaults.duration,
        aspectRatio:  defaults.aspectRatio,
        motionChoice: defaults.motionId,
        intensity:    defaults.intensity,
        fidelityMode: defaults.fidelityMode,
      }
    }

    case 'setModel': {
      const m = requireVideoModel(action.modelId)
      // Se a duração/formato atuais não são suportados pelo novo motor, ajusta.
      const duration = m.supportedDurations.includes(state.duration)
        ? state.duration
        : m.supportedDurations[m.supportedDurations.length - 1]
      const aspectRatio = m.supportedAspectRatios.includes(state.aspectRatio)
        ? state.aspectRatio
        : 'auto'
      return { ...state, modelId: action.modelId, duration, aspectRatio }
    }

    case 'setDuration':
      return { ...state, duration: action.duration }

    case 'setAspectRatio':
      return { ...state, aspectRatio: action.aspectRatio }

    case 'setScene':
      return { ...state, sceneType: action.sceneType }

    case 'setMotionChoice':
      return { ...state, motionChoice: action.motionChoice }

    case 'setIntensity':
      return { ...state, intensity: action.intensity }

    case 'setFidelity':
      return { ...state, fidelityMode: action.fidelityMode }

    case 'setAtmosphere':
      return { ...state, atmosphere: action.atmosphere }

    case 'setAvoidPeople':
      return { ...state, avoidPeople: action.avoidPeople }

    case 'setUserPrompt':
      return { ...state, userPrompt: action.userPrompt }

    case 'startGenerating':
      return { ...state, status: 'generating', elapsed: 0, error: null, result: null }

    case 'generationSuccess':
      return {
        ...state,
        status:  'success',
        result:  action.result,
        credits: action.newCredits,
      }

    case 'generationError':
      return { ...state, status: 'error', error: action.message }

    case 'tickElapsed':
      return { ...state, elapsed: state.elapsed + 1 }

    case 'reset':
      return initialState(state.credits)

    case 'resetResult':
      return { ...state, status: state.imageFile ? 'ready' : 'idle', result: null, error: null }

    case 'setCredits':
      return { ...state, credits: action.credits }

    default:
      return state
  }
}

// ── Resolução do movimento "Automático" ──────────────────────────────────────
// Ordem: escolha explícita → sugestão da análise → default do preset →
// default do tipo de cena. Sempre devolve um movimento concreto.

export function resolveMotion(state: AnimateState): CameraMotion {
  if (state.motionChoice !== 'auto') {
    return CAMERA_MOTIONS[state.motionChoice]
  }
  if (state.analysis?.suggestedCameraMotion) {
    return CAMERA_MOTIONS[state.analysis.suggestedCameraMotion]
  }
  const presetMotion = VIDEO_TYPE_PRESETS[state.videoType].defaults.motionId
  if (presetMotion !== 'auto') {
    return CAMERA_MOTIONS[presetMotion]
  }
  return CAMERA_MOTIONS[SCENE_TYPES[state.sceneType].defaultMotionId as CameraMotionId]
}

// ── Hook principal ──────────────────────────────────────────────────────────

export function useAnimateState(initialCredits: number) {
  const [state, dispatch] = useReducer(reducer, initialCredits, initialState)

  // Tick de elapsed enquanto gerando
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (state.status !== 'generating') {
      if (elapsedInterval.current) clearInterval(elapsedInterval.current)
      return
    }
    elapsedInterval.current = setInterval(() => dispatch({ type: 'tickElapsed' }), 1000)
    return () => { if (elapsedInterval.current) clearInterval(elapsedInterval.current) }
  }, [state.status])

  // Derivados úteis
  const model: VideoModel = requireVideoModel(state.modelId)
  const resolvedMotion    = resolveMotion(state)
  const nodeCost = (() => {
    try { return getNodeCost(state.modelId, state.duration) }
    catch { return 0 }
  })()
  const canGenerate =
    !!state.imageFile &&
    state.credits >= nodeCost &&
    state.status !== 'generating' &&
    state.status !== 'analyzing'

  return {
    state,
    dispatch,
    model,
    resolvedMotion,
    nodeCost,
    canGenerate,
  }
}

export type AnimateDispatch = ReturnType<typeof useAnimateState>['dispatch']
