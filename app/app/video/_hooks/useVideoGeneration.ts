'use client'

// Hook que dispara a geração de vídeo via /api/video.
// Envia a configuração completa do fluxo novo (preset, movimento resolvido,
// formato explícito, intensidade, fidelidade, atmosfera, sem-pessoas,
// frame final). O endpoint aceita tudo opcionalmente e degrada para o
// caminho legacy se faltarem campos.

import { useCallback } from 'react'
import { resolveMotion, type AnimateState, type AnimateDispatch } from './useAnimateState'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { jsonOrNull } from '@/lib/http/fetch-json'

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
      // Imagens sobem direto pro Storage (sem passar pela Vercel — teto de
      // 4,5 MB de body não se aplica); a rota recebe as keys.
      const { key: sourceKey } = await uploadDirect(state.imageFile, 'animar-source', {}, { confirm: false })
      let endKey: string | undefined
      if (state.endImageFile) {
        const end = await uploadDirect(state.endImageFile, 'animar-source', {}, { confirm: false })
        endKey = end.key
      }

      const res = await fetch('/api/video', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceKey,
          engine:       state.modelId,
          duration:     state.duration,
          scene:        state.sceneType,
          intensity:    state.intensity,
          prompt:       state.userPrompt,
          cameraMotion: motion.id,
          fidelity:     state.fidelityMode,
          videoType:    state.videoType,
          // Formato agora é escolha explícita do usuário — 'auto' mantém a
          // proporção da imagem. (Antes era derivado do preset de movimento,
          // o que podia gerar um 9:16 inesperado.)
          aspectRatio:  state.aspectRatio,
          ...(state.avoidPeople ? { avoidPeople: '1' } : {}),
          ...(state.atmosphere ? { atmosphere: state.atmosphere } : {}),
          ...(endKey ? { endKey } : {}),
        }),
      })
      const data = ((await jsonOrNull(res)) ?? {}) as unknown as GenerateResponse

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
      dispatch({
        type:    'generationError',
        message: err instanceof Error && err.message ? err.message : 'Falha de conexão. Tente novamente.',
      })
    }
  }, [state, dispatch, nodeCost])

  return { generate }
}
