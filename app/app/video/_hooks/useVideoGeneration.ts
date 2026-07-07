'use client'

// Hook que dispara a geração de vídeo via /api/video.
// Envia a configuração completa do fluxo novo (preset, movimento resolvido,
// formato explícito, intensidade, fidelidade, atmosfera, sem-pessoas,
// frame final). O endpoint aceita tudo opcionalmente e degrada para o
// caminho legacy se faltarem campos.

import { useCallback } from 'react'
import { resolveMotion, type AnimateState, type AnimateDispatch } from './useAnimateState'

interface GenerateResponse {
  url:       string
  inputUrl:  string
  credits?:  number   // saldo real pós-débito (quando o servidor informa)
  error?:    string
}

export function useVideoGeneration(
  state:    AnimateState,
  dispatch: AnimateDispatch,
  nodeCost: number,
) {
  const generate = useCallback(async () => {
    if (!state.imageFile) return

    dispatch({ type: 'startGenerating' })

    const motion = resolveMotion(state)

    try {
      const body = new FormData()
      body.append('image',        state.imageFile)
      body.append('engine',       state.modelId)
      body.append('duration',     state.duration)
      body.append('scene',        state.sceneType)
      body.append('intensity',    state.intensity)
      body.append('prompt',       state.userPrompt)
      body.append('cameraMotion', motion.id)
      body.append('fidelity',     state.fidelityMode)
      body.append('videoType',    state.videoType)
      // Formato agora é escolha explícita do usuário — 'auto' mantém a
      // proporção da imagem. (Antes era derivado do preset de movimento,
      // o que podia gerar um 9:16 inesperado.)
      body.append('aspectRatio',  state.aspectRatio)
      if (state.avoidPeople)  body.append('avoidPeople', '1')
      if (state.atmosphere)   body.append('atmosphere', state.atmosphere)
      if (state.endImageFile) body.append('endImage',   state.endImageFile)

      const res = await fetch('/api/video', { method: 'POST', body })
      const data = (await res.json()) as GenerateResponse

      if (!res.ok || !data.url) {
        dispatch({ type: 'generationError', message: data.error ?? 'Erro ao gerar vídeo.' })
        return
      }

      dispatch({
        type:   'generationSuccess',
        result: {
          outputUrl:    data.url,
          inputUrl:     data.inputUrl,
          modelId:      state.modelId,
          duration:     state.duration,
          aspectRatio:  state.aspectRatio,
          intensity:    state.intensity,
          videoType:    state.videoType,
          motionId:     motion.id,
          sceneType:    state.sceneType,
          nodesCharged: nodeCost,
          createdAt:    Date.now(),
        },
        // Prefere o saldo real informado pelo servidor; senão estima local.
        newCredits: typeof data.credits === 'number'
          ? data.credits
          : Math.max(0, state.credits - nodeCost),
      })
    } catch (err) {
      console.error('[useVideoGeneration] falhou:', err)
      dispatch({ type: 'generationError', message: 'Falha de conexão. Tente novamente.' })
    }
  }, [state, dispatch, nodeCost])

  return { generate }
}
