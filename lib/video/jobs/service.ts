import type { SupabaseClient } from '@supabase/supabase-js'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { signStorageUrl } from '@/lib/storage/signed'
import { deliverGeneratedVideo, InvalidVideoError } from '../delivery'
import { getVideoTask } from './provider'

export interface VideoJobRow {
  id: string
  user_id: string
  status: 'submitting' | 'processing' | 'completed' | 'failed'
  model_id: string
  provider_endpoint: string
  provider_request_id: string | null
  duration: string
  aspect_ratio: string
  motion_id: string
  video_type: string
  input_url: string
  output_url: string | null
  provider_output_url: string | null
  storage_key: string | null
  render_id: string | null
  nodes_cost: number
  created_at: string
  completed_at: string | null
  error_message: string | null
}

type Admin = SupabaseClient
const SUBMIT_TIMEOUT_MS = 10 * 60_000
const GENERATION_TIMEOUT_MS = 60 * 60_000

export async function readVideoJob(admin: Admin, id: string): Promise<VideoJobRow> {
  const { data, error } = await admin.from('video_jobs').select('*').eq('id', id).single()
  if (error || !data) throw new Error('Job de vídeo não encontrado')
  return data as VideoJobRow
}

async function failJob(admin: Admin, job: VideoJobRow, reason: string): Promise<VideoJobRow> {
  const { error } = await admin.rpc('fail_video_job', { p_job_id: job.id, p_message: reason })
  if (error) {
    console.error('[video/jobs] estorno transacional falhou:', { jobId: job.id, error })
    throw new Error('Falha ao finalizar job de vídeo')
  }
  return readVideoJob(admin, job.id)
}

export async function syncVideoJob(admin: Admin, job: VideoJobRow): Promise<VideoJobRow> {
  if (job.status === 'completed' || job.status === 'failed') return job
  const age = Date.now() - new Date(job.created_at).getTime()
  if (job.status === 'submitting') {
    return age > SUBMIT_TIMEOUT_MS ? failJob(admin, job, 'Envio ao provider não confirmado') : job
  }
  if (!job.provider_request_id) return failJob(admin, job, 'Job sem request_id')

  try {
    const task = await getVideoTask(job.provider_endpoint, job.provider_request_id)
    if (task.status === 'failed') return failJob(admin, job, task.message)
    if (task.status === 'processing') {
      return age > GENERATION_TIMEOUT_MS ? failJob(admin, job, 'Tempo de geração excedido') : job
    }

    const delivery = await deliverGeneratedVideo(
      admin, task.outputUrl, job.user_id, fetch,
      `${job.user_id}/animar/${job.id}.mp4`,
    )
    const { error } = await admin.rpc('complete_video_job', {
      p_job_id: job.id,
      p_output_url: delivery.storedUrl ?? task.outputUrl,
      p_provider_url: task.outputUrl,
      p_storage_key: delivery.storageKey,
      p_delivery_status: delivery.status,
      p_output_bytes: delivery.bytes,
    })
    if (error) throw error
    return readVideoJob(admin, job.id)
  } catch (error) {
    // MP4 comprovadamente inválido: estorna. Rede, Storage ou fal 5xx:
    // preserva o job; próximo poll/cron retenta a finalização.
    if (error instanceof InvalidVideoError) return failJob(admin, job, error.message)
    console.error('[video/jobs] sincronização transitória:', { jobId: job.id, error })
    if (age > GENERATION_TIMEOUT_MS) return failJob(admin, job, 'Tempo de geração excedido')
    return job
  }
}

export async function videoJobView(admin: Admin, job: VideoJobRow) {
  const mediaUrl = job.storage_key
    ? `/api/media?bucket=spacenode-media&key=${encodeURIComponent(job.storage_key)}`
    : null
  const credits = (await getPayerBalance(admin, job.user_id)).totalBalance
  return {
    id: job.id,
    status: job.status,
    modelId: job.model_id,
    duration: job.duration,
    aspectRatio: job.aspect_ratio,
    motionId: job.motion_id,
    videoType: job.video_type,
    inputUrl: await signStorageUrl(admin, job.input_url),
    outputUrl: mediaUrl ?? job.output_url,
    nodesCharged: job.nodes_cost,
    renderId: job.render_id,
    credits,
    createdAt: job.created_at,
    error: job.status === 'failed' ? 'A geração falhou. Os nodes foram devolvidos.' : null,
  }
}
