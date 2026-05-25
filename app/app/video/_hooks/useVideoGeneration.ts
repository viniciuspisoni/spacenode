'use client'

// Hook que dispara a geração de vídeo via /api/video.
// Envia todos os parâmetros novos (cameraMotion, fidelity, atmosphere,
// endImage, aspectRatio) — o endpoint aceita opcionalmente e degrada
// para o caminho legacy se faltarem.

import { useCallback } from 'react'
import { CAMERA_MOTIONS } from '@/lib/video/cameraPresets'
import type { AnimateState, AnimateDispatch } from './useAnimateState'

interface GenerateResponse {
  url:      string
  inputUrl: string
}

export function useVideoGeneration(
  state:    AnimateState,
  dispatch: AnimateDispatch,
  nodeCost: number,
) {
  const generate = useCallback(async () => {
    if (!state.imageFile) return

    dispatch({ type: 'startGenerating' })

    try {
      const body = new FormData()
      body.append('image',        state.imageFile)
      body.append('engine',       state.modelId)
      body.append('duration',     state.duration)
      body.append('scene',        state.sceneType)
      body.append('intensity',    state.intensity)
      body.append('prompt',       state.userPrompt)
      body.append('cameraMotion', state.cameraMotion)
      body.append('fidelity',     state.fidelityMode)
      if (state.atmosphere)   body.append('atmosphere', state.atmosphere)
      if (state.endImageFile) body.append('endImage',   state.endImageFile)
      const motion = CAMERA_MOTIONS[state.cameraMotion]
      if (motion?.recommendedAspectRatio) {
        body.append('aspectRatio', motion.recommendedAspectRatio)
      }

      const res = await fetch('/api/video', { method: 'POST', body })
      const data = (await res.json()) as GenerateResponse & { error?: string }

      if (!res.ok || !data.url) {
        dispatch({ type: 'generationError', message: data.error ?? 'Erro ao gerar vídeo.' })
        return
      }

      dispatch({
        type:   'generationSuccess',
        result: {
          outputUrl: data.url,
          inputUrl:  data.inputUrl,
          modelId:   state.modelId,
          duration:  state.duration,
          motionId:  state.cameraMotion,
          sceneType: state.sceneType,
          createdAt: Date.now(),
        },
        newCredits: Math.max(0, state.credits - nodeCost),
      })
    } catch (err) {
      console.error('[useVideoGeneration] falhou:', err)
      dispatch({ type: 'generationError', message: 'Falha de conexão. Tente novamente.' })
    }
  }, [state, dispatch, nodeCost])

  return { generate }
}
