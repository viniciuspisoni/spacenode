'use client'

// Estado compartilhado entre os 3 modos do AnimateClient. Mantemos tudo
// em um único hook para evitar prop drilling e Context boilerplate.
// Os 3 modos consomem o mesmo state — mudar de modo só altera quais
// affordances aparecem no painel direito; a imagem e os parâmetros
// continuam preenchidos.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  DEFAULT_VIDEO_MODEL_ID,
  getNodeCost,
  requireVideoModel,
  type VideoModel,
} from '@/lib/video/models'
import { SCENE_TYPES, type SceneTypeId } from '@/lib/video/scenes'
import { CAMERA_MOTIONS, type CameraIntensity, type CameraMotionId } from '@/lib/video/cameraPresets'
import type { FidelityMode } from '@/lib/video/promptBuilder'
import type { VideoReferenceAnalysis } from '@/lib/video/analyzeReference'

export type AnimateMode = 'animate' | 'camera' | 'guided'

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
  motionId?:    CameraMotionId
  sceneType?:   SceneTypeId
  createdAt:    number
}

export interface AnimateState {
  mode:             AnimateMode

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
  modelId:          string
  duration:         string
  sceneType:        SceneTypeId
  cameraMotion:     CameraMotionId
  intensity:        CameraIntensity
  fidelityMode:     FidelityMode
  atmosphere:       string
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
  | { type: 'setMode';            mode: AnimateMode }
  | { type: 'setImage';           file: File | null; preview: string | null; wasCropped: boolean }
  | { type: 'setEndImage';        file: File | null; preview: string | null }
  | { type: 'startAnalyzing' }
  | { type: 'analysisDone';       analysis: VideoReferenceAnalysis; inputUrl: string }
  | { type: 'analysisFailed';     message: string }
  | { type: 'setModel';           modelId: string }
  | { type: 'setDuration';        duration: string }
  | { type: 'setScene';           sceneType: SceneTypeId }
  | { type: 'setCameraMotion';   motionId: CameraMotionId }
  | { type: 'setIntensity';       intensity: CameraIntensity }
  | { type: 'setFidelity';        fidelityMode: FidelityMode }
  | { type: 'setAtmosphere';      atmosphere: string }
  | { type: 'setUserPrompt';      userPrompt: string }
  | { type: 'startGenerating' }
  | { type: 'generationSuccess'; result: GenerationResult; newCredits: number }
  | { type: 'generationError';   message: string }
  | { type: 'tickElapsed' }
  | { type: 'reset' }
  | { type: 'resetResult' }
  | { type: 'setCredits';         credits: number }

function initialState(credits: number): AnimateState {
  const model  = requireVideoModel(DEFAULT_VIDEO_MODEL_ID)
  const motion = CAMERA_MOTIONS['dolly-in-soft']
  return {
    mode:            'animate',
    imageFile:       null,
    imagePreview:    null,
    imageWasCropped: false,
    endImageFile:    null,
    endImagePreview: null,
    cachedInputUrl:  null,
    analysis:        null,
    analysisError:   null,
    modelId:         model.id,
    duration:        model.supportedDurations[model.supportedDurations.length - 1],
    sceneType:       'living',
    cameraMotion:    motion.id,
    intensity:       'subtle',
    fidelityMode:    'max',
    atmosphere:      '',
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
    case 'setMode':
      return { ...state, mode: action.mode }

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
        status:          action.file ? 'idle' : 'idle',
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
      return {
        ...state,
        status:         'ready',
        analysis:       a,
        cachedInputUrl: action.inputUrl,
        // Aplica sugestões só onde o usuário ainda não tocou.
        sceneType:      a.sceneType,
        cameraMotion:   a.suggestedCameraMotion,
        modelId:        a.suggestedModelId,
        duration:       a.suggestedDuration,
        // Prompt só sobrescreve se está vazio
        userPrompt:     state.userPrompt || a.suggestedPrompt,
      }
    }

    case 'analysisFailed':
      return { ...state, status: 'ready', analysisError: action.message }

    case 'setModel': {
      const m = requireVideoModel(action.modelId)
      // Se a duração atual não é suportada pelo novo modelo, ajusta.
      const dur = m.supportedDurations.includes(state.duration)
        ? state.duration
        : m.supportedDurations[m.supportedDurations.length - 1]
      return { ...state, modelId: action.modelId, duration: dur }
    }

    case 'setDuration':
      return { ...state, duration: action.duration }

    case 'setScene':
      return { ...state, sceneType: action.sceneType }

    case 'setCameraMotion':
      return { ...state, cameraMotion: action.motionId }

    case 'setIntensity':
      return { ...state, intensity: action.intensity }

    case 'setFidelity':
      return { ...state, fidelityMode: action.fidelityMode }

    case 'setAtmosphere':
      return { ...state, atmosphere: action.atmosphere }

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
    nodeCost,
    canGenerate,
  }
}

export type AnimateDispatch = ReturnType<typeof useAnimateState>['dispatch']
