// Finalização compartilhada pelo poll do usuário e pelo cron. O job só é
// concluído depois de salvar um GLB válido; transições concorrentes usam
// status='processing' como claim para um único estorno.
import type { SupabaseClient } from '@supabase/supabase-js'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { getProviderTask, TaskGoneError } from './provider'
import { InvalidGlbError, rehostProviderOutputs } from './rehost'
import { BLOCOS3D_JOB_COLUMNS, type Blocos3DJobRow } from './view'
import type { Blocos3DProvider } from './types'

const STALE_JOB_MS = 60 * 60 * 1000

export type JobRowWithMeta = Blocos3DJobRow & {
  user_id: string
  provider: Blocos3DProvider
  engine: string
  provider_task_id: string | null
  charged: boolean
}

export const ROW_COLUMNS = `${BLOCOS3D_JOB_COLUMNS}, user_id, provider, engine, provider_task_id, charged`

function isStale(job: JobRowWithMeta): boolean {
  return Date.now() - new Date(job.created_at).getTime() > STALE_JOB_MS
}

async function readFresh(admin: SupabaseClient, job: JobRowWithMeta): Promise<JobRowWithMeta> {
  const { data, error } = await admin.from('blocos3d_jobs')
    .select(ROW_COLUMNS).eq('id', job.id).maybeSingle()
  if (error) throw error
  return (data as unknown as JobRowWithMeta) ?? job
}

async function failJob(admin: SupabaseClient, job: JobRowWithMeta, message: string): Promise<JobRowWithMeta> {
  const { data: claimed, error } = await admin.from('blocos3d_jobs')
    .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
    .eq('id', job.id).eq('status', 'processing').select('id')
  if (error) throw error

  if (claimed?.length && job.charged && !job.refunded && (job.nodes_cost ?? 0) > 0) {
    const ok = await refundNodes(admin, job.user_id, job.nodes_cost ?? 0, {
      module: 'blocos3d', jobTable: 'blocos3d_jobs', jobId: job.id,
    })
    if (ok) {
      const { error: markError } = await admin.from('blocos3d_jobs')
        .update({ refunded: true }).eq('id', job.id)
      if (markError) console.error('[blocos3d] refund confirmado, flag não atualizada:', job.id, markError)
    }
  }
  return readFresh(admin, job)
}

export async function reconcileBlocos3DJob(admin: SupabaseClient, job: JobRowWithMeta): Promise<JobRowWithMeta> {
  if (job.status !== 'processing') return job
  if (!job.provider_task_id) return failJob(admin, job, 'Job sem task no provider')

  try {
    const task = await getProviderTask(job.provider, job.engine, job.provider_task_id)
    if (task.status === 'succeeded') {
      const { modelKeys, thumbnailKey, originalGlbKey } = await rehostProviderOutputs(admin, {
        userId: job.user_id, jobId: job.id, modelUrls: task.modelUrls,
        thumbnailUrl: task.thumbnailUrl,
        optimizeForScenes: job.engine.startsWith('tripo3d/h3.1/'),
      })
      if (!modelKeys.glb) {
        if (isStale(job)) return failJob(admin, job, 'Não foi possível preparar o modelo 3D')
        return job
      }

      const { data: updated, error } = await admin.from('blocos3d_jobs')
        .update({
          status: 'completed', progress: 100,
          model_glb_key: modelKeys.glb,
          model_fbx_key: modelKeys.fbx ?? null,
          model_obj_key: modelKeys.obj ?? null,
          model_usdz_key: modelKeys.usdz ?? null,
          thumbnail_key: thumbnailKey,
          provider_model_urls: {
            ...task.modelUrls,
            ...(task.thumbnailUrl ? { thumbnail: task.thumbnailUrl } : {}),
          },
          options: {
            ...(job.options ?? {}),
            ...(originalGlbKey ? { original_glb_key: originalGlbKey } : {}),
          },
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id).eq('status', 'processing').select(ROW_COLUMNS)
      if (error) throw error
      return (updated?.[0] as unknown as JobRowWithMeta) ?? readFresh(admin, job)
    }

    if (task.status === 'failed') {
      return failJob(admin, job, task.errorMessage || 'Geração falhou no provider')
    }
    if (isStale(job)) return failJob(admin, job, 'Tempo limite de geração excedido')

    const progress = task.progress
    if (typeof progress === 'number' && progress > (job.progress ?? 0)) {
      const { error } = await admin.from('blocos3d_jobs').update({ progress })
        .eq('id', job.id).eq('status', 'processing')
      if (error) console.warn('[blocos3d] progresso indisponível:', job.id, error)
    }
    return { ...job, progress: Math.max(job.progress ?? 0, progress ?? 0) }
  } catch (err) {
    if (err instanceof InvalidGlbError) return failJob(admin, job, 'O modelo veio incompleto.')
    if (err instanceof TaskGoneError) return failJob(admin, job, 'Task não encontrada no provider')
    // Rede/5xx: aguarda próxima tentativa, mas nunca deixa um débito preso
    // indefinidamente quando o provider continua indisponível.
    console.error('[blocos3d] falha transitória:', job.id, (err as Error)?.message ?? err)
    if (isStale(job)) return failJob(admin, job, 'Tempo limite de geração excedido')
    return job
  }
}
