import { fal } from '@fal-ai/client'
import { buildFalInput, extractVideoUrl, falEndpointForModel } from '../adapters/falAdapter'
import type { VideoGenerationRequest } from '../adapters/types'

function configure() {
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY não configurada')
  fal.config({ credentials: process.env.FAL_KEY })
}

export async function submitVideoTask(request: VideoGenerationRequest) {
  configure()
  const endpoint = falEndpointForModel(request.modelId)
  const { request_id } = await fal.queue.submit(endpoint, { input: buildFalInput(request) })
  if (!request_id) throw new Error('Fal não retornou request_id')
  return { endpoint, requestId: request_id }
}

export async function getVideoTask(endpoint: string, requestId: string): Promise<
  { status: 'processing' } | { status: 'completed'; outputUrl: string } | { status: 'failed'; message: string }
> {
  configure()
  let status: Awaited<ReturnType<typeof fal.queue.status>>
  try {
    status = await fal.queue.status(endpoint, { requestId, logs: false })
  } catch (error) {
    const e = error as { status?: number; message?: string }
    if (e.status && [400, 401, 403, 422].includes(e.status)) {
      return { status: 'failed', message: e.message ?? 'Geração recusada pelo provider' }
    }
    throw error
  }
  if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') return { status: 'processing' }
  try {
    const { data } = await fal.queue.result(endpoint, { requestId })
    const outputUrl = extractVideoUrl(data)
    if (!outputUrl) return { status: 'failed', message: 'Motor não retornou um vídeo' }
    return { status: 'completed', outputUrl }
  } catch (error) {
    const e = error as { status?: number; message?: string }
    // Rede, 404 temporário após COMPLETED, rate limit e 5xx: poll novamente.
    if (!e.status || e.status === 404 || e.status === 429 || e.status >= 500) throw error
    return { status: 'failed', message: e.message ?? 'Geração recusada pelo provider' }
  }
}
