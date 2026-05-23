'use client'

// Hook que dispara a análise da imagem de referência via /api/video/analyze.
// Não trava o fluxo — se a análise falhar ou estiver desativada via flag,
// o cliente continua e o usuário pode preencher os parâmetros manualmente.

import { useCallback } from 'react'
import type { VideoReferenceAnalysis } from '@/lib/video/analyzeReference'
import type { AnimateDispatch } from './useAnimateState'

interface AnalyzeResponse {
  inputUrl: string
  analysis: VideoReferenceAnalysis
}

export function useReferenceAnalysis(dispatch: AnimateDispatch) {
  const analyze = useCallback(async (imageFile: File) => {
    dispatch({ type: 'startAnalyzing' })
    try {
      const body = new FormData()
      body.append('image', imageFile)
      const res = await fetch('/api/video/analyze', { method: 'POST', body })

      if (!res.ok) {
        dispatch({ type: 'analysisFailed', message: 'Análise indisponível agora.' })
        return
      }

      const data = (await res.json()) as AnalyzeResponse
      if (!data?.analysis || !data?.inputUrl) {
        dispatch({ type: 'analysisFailed', message: 'Resposta de análise inválida.' })
        return
      }

      dispatch({
        type:     'analysisDone',
        analysis: data.analysis,
        inputUrl: data.inputUrl,
      })
    } catch (err) {
      console.error('[useReferenceAnalysis] falhou:', err)
      dispatch({ type: 'analysisFailed', message: 'Falha de conexão na análise.' })
    }
  }, [dispatch])

  return { analyze }
}
