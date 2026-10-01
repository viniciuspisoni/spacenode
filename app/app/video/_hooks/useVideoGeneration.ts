'use client'

import { useCallback, useEffect, useRef } from 'react'
import { resolveMotion, type AnimateState, type AnimateDispatch } from './useAnimateState'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { jsonOrNull } from '@/lib/http/fetch-json'
import type { VideoTypeId } from '@/lib/video/videoPresets'

interface JobView {
  id: string
  status: 'submitting' | 'processing' | 'completed' | 'failed'
  modelId: string
  duration: string
  aspectRatio: string
  motionId: string
  videoType: VideoTypeId
  inputUrl: string
  outputUrl: string | null
  nodesCharged: number
  credits: number | null
  createdAt: string
  error: string | null
}

export function useVideoGeneration(
  state: AnimateState,
  dispatch: AnimateDispatch,
  nodeCost: number,
) {
  const creditsRef = useRef(state.credits)
  const startedRef = useRef(false)
  useEffect(() => { creditsRef.current = state.credits }, [state.credits])
  useEffect(() => { if (state.imageFile) startedRef.current = true }, [state.imageFile])

  // Uma atualização da página pode reencontrar o job e seus nodes no servidor.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch('/api/video/jobs')
        if (!response.ok || !active || startedRef.current) return
        const data = (await jsonOrNull(response)) as { job?: JobView | null } | null
        if (data?.job && active && !startedRef.current) {
          dispatch({ type: 'resumeJob', jobId: data.job.id, inputUrl: data.job.inputUrl })
        }
      } catch { /* O histórico continua disponível se a retomada falhar. */ }
    })()
    return () => { active = false }
  }, [dispatch])

  useEffect(() => {
    if (!state.activeJobId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const jobId = state.activeJobId
    const poll = async () => {
      try {
        const response = await fetch(`/api/video/jobs/${jobId}`, { cache: 'no-store' })
        const data = (await jsonOrNull(response)) as { job?: JobView } | null
        if (!active) return
        const job = response.ok ? data?.job : null
        if (job?.status === 'completed' && job.outputUrl) {
          dispatch({
            type: 'generationSuccess',
            result: {
              outputUrl: job.outputUrl,
              inputUrl: job.inputUrl,
              modelId: job.modelId,
              duration: job.duration,
              aspectRatio: job.aspectRatio,
              intensity: 'subtle',
              videoType: job.videoType,
              motionId: job.motionId as ReturnType<typeof resolveMotion>['id'],
              nodesCharged: job.nodesCharged,
              createdAt: new Date(job.createdAt).getTime(),
            },
            newCredits: job.credits ?? creditsRef.current,
          })
          return
        }
        if (job?.status === 'failed') {
          if (typeof job.credits === 'number') dispatch({ type: 'setCredits', credits: job.credits })
          dispatch({ type: 'generationError', message: job.error ?? 'A geração falhou.' })
          return
        }
      } catch { /* Erro de rede transitório: o cron continua a reconciliar. */ }
      if (active) timer = setTimeout(poll, 4000)
    }
    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [state.activeJobId, dispatch])

  const generate = useCallback(async () => {
    if (!state.imageFile || state.status === 'generating') return
    startedRef.current = true
    dispatch({ type: 'startGenerating' })
    const motion = resolveMotion(state)
    try {
      const { key: sourceKey } = await uploadDirect(state.imageFile, 'animar-source', {}, { confirm: false })
      const requestId = crypto.randomUUID()
      const body = JSON.stringify({
        requestId,
        sourceKey,
        videoType: state.videoType,
        prompt: state.userPrompt,
        cameraMotion: motion.id,
        ...(state.analysis?.source === 'ai' ? { scene: state.analysis.sceneType } : {}),
      })
      // A mesma chave é reutilizada se o HTTP cair após o débito.
      let response: Response
      try {
        response = await fetch('/api/video/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        })
      } catch {
        response = await fetch('/api/video/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        })
      }
      const data = (await jsonOrNull(response)) as {
        jobId?: string; job?: JobView; nodesCharged?: number; error?: string
      } | null
      if (!response.ok || !data?.jobId) {
        throw new Error(data?.error ?? 'Falha ao iniciar a geração.')
      }
      dispatch({
        type: 'jobSubmitted', jobId: data.jobId,
        nodesCharged: data.job?.status === 'failed' ? 0 : data.nodesCharged ?? data.job?.nodesCharged ?? nodeCost,
        newCredits: data.job?.credits,
      })
    } catch (error) {
      console.error('[useVideoGeneration] falhou:', error)
      dispatch({
        type: 'generationError',
        message: error instanceof Error && error.message ? error.message : 'Falha de conexão. Tente novamente.',
      })
    }
  }, [state, dispatch, nodeCost])

  return { generate }
}
