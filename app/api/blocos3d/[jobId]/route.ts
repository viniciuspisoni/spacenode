// GET /api/blocos3d/[jobId] — poll + finalização do job Blocos 3D.
//
// O cliente consulta a cada poucos segundos enquanto status = 'processing'.
// Este endpoint é quem TRANSICIONA o job (o poll é a fonte de verdade):
//
//   succeeded → re-hospeda modelos/thumbnail no bucket `spacenode-media`
//               (as URLs dos providers expiram) e marca completed.
//   failed    → marca failed + refund VERIFICADO (uma única vez — o claim é
//               um UPDATE condicional em status='processing').
//   demais    → atualiza progress (best-effort) e devolve o estado.
//
// Corrida entre polls concorrentes (duas abas): o UPDATE condicional
// `.eq('status','processing')` garante que só um request faz a transição; o
// perdedor relê a linha e devolve o estado já transicionado. Pior caso é um
// arquivo duplicado órfão no Storage (inócuo).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { getProviderTask, TaskGoneError } from '@/lib/blocos3d/provider'
import { rehostProviderOutputs } from '@/lib/blocos3d/rehost'
import { BLOCOS3D_JOB_COLUMNS, toJobView, type Blocos3DJobRow } from '@/lib/blocos3d/view'
import type { Blocos3DProvider } from '@/lib/blocos3d/types'

// Finalização baixa+sobe até 4 modelos (dezenas de MB) — folga pra Vercel Pro.
export const maxDuration = 300

// Job preso em processing além disso → failed + refund (provider em limbo).
const STALE_JOB_MS = 60 * 60 * 1000

type Params = { params: Promise<{ jobId: string }> }

type JobRowWithMeta = Blocos3DJobRow & {
  user_id:          string
  provider:         Blocos3DProvider
  engine:           string
  provider_task_id: string | null
  refunded:         boolean
  charged:          boolean
}

const ROW_COLUMNS = `${BLOCOS3D_JOB_COLUMNS}, user_id, provider, engine, provider_task_id, refunded, charged`

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Client user-scoped: RLS já restringe ao dono; o service-role entra só nas
  // transições e na assinatura das URLs.
  const { data, error } = await supabase
    .from('blocos3d_jobs')
    .select(ROW_COLUMNS)
    .eq('id', jobId)
    .maybeSingle()

  if (error) {
    console.error('[blocos3d/poll] read error:', error)
    return NextResponse.json({ error: 'Falha ao consultar o job' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })

  const job = data as unknown as JobRowWithMeta
  const admin = createAdminClient()

  // ── Terminal: só emite ─────────────────────────────────────────────────────
  if (job.status !== 'processing') {
    return NextResponse.json({ job: await toJobView(admin, job) })
  }

  // ── Sem task no provider (não deveria acontecer) → failed + refund ─────────
  if (!job.provider_task_id) {
    await failJob(admin, job, 'Job sem task no provider')
    return NextResponse.json({ job: await toJobView(admin, await reread(admin, job.id) ?? job) })
  }

  try {
    const task = await getProviderTask(job.provider, job.engine, job.provider_task_id)

    if (task.status === 'succeeded') {
      // Re-hospeda ANTES da transição (idempotente; falha parcial mantém a URL
      // do provider como fallback — nunca perde o output).
      const { modelKeys, thumbnailKey } = await rehostProviderOutputs(admin, {
        userId:       job.user_id,
        jobId:        job.id,
        modelUrls:    task.modelUrls,
        thumbnailUrl: task.thumbnailUrl,
      })

      await admin
        .from('blocos3d_jobs')
        .update({
          status:         'completed',
          progress:       100,
          model_glb_key:  modelKeys.glb  ?? null,
          model_fbx_key:  modelKeys.fbx  ?? null,
          model_obj_key:  modelKeys.obj  ?? null,
          model_usdz_key: modelKeys.usdz ?? null,
          thumbnail_key:  thumbnailKey,
          provider_model_urls: {
            ...task.modelUrls,
            ...(task.thumbnailUrl ? { thumbnail: task.thumbnailUrl } : {}),
          },
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'processing')

      // Ganhando ou perdendo a corrida, o estado fresco é a resposta certa.
      const fresh = await reread(admin, job.id)
      return NextResponse.json({ job: await toJobView(admin, fresh ?? job) })
    }

    if (task.status === 'failed') {
      await failJob(admin, job, task.errorMessage || 'Geração falhou no provider')
      const fresh = await reread(admin, job.id)
      return NextResponse.json({ job: await toJobView(admin, fresh ?? job) })
    }

    // ── Ainda processando ────────────────────────────────────────────────────
    if (Date.now() - new Date(job.created_at).getTime() > STALE_JOB_MS) {
      await failJob(admin, job, 'Tempo limite de geração excedido')
      const fresh = await reread(admin, job.id)
      return NextResponse.json({ job: await toJobView(admin, fresh ?? job) })
    }

    // Progress best-effort (não transiciona status — sem corrida com o claim).
    const progress = task.progress
    if (typeof progress === 'number' && progress > (job.progress ?? 0)) {
      await admin
        .from('blocos3d_jobs')
        .update({ progress })
        .eq('id', job.id)
        .eq('status', 'processing')
    }

    return NextResponse.json({
      job: await toJobView(admin, { ...job, progress: Math.max(job.progress ?? 0, progress ?? 0) }),
    })
  } catch (err: unknown) {
    if (err instanceof TaskGoneError) {
      // Task sumiu do provider — sem o que esperar.
      await failJob(admin, job, 'Task não encontrada no provider')
      const fresh = await reread(admin, job.id)
      return NextResponse.json({ job: await toJobView(admin, fresh ?? job) })
    }
    // Erro transitório (rede/5xx do provider): NÃO transiciona — devolve o
    // estado atual e o cliente continua o polling.
    console.error('[blocos3d/poll] provider error (transitório):', (err as Error)?.message ?? err)
    return NextResponse.json({ job: await toJobView(admin, job) })
  }
}

async function reread(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
): Promise<JobRowWithMeta | null> {
  const { data } = await admin
    .from('blocos3d_jobs')
    .select(ROW_COLUMNS)
    .eq('id', jobId)
    .maybeSingle()
  return (data as unknown as JobRowWithMeta) ?? null
}

/** Transição pra failed com refund VERIFICADO uma única vez: o UPDATE
 *  condicional em status='processing' é o claim — só quem ganhou estorna. */
async function failJob(
  admin: ReturnType<typeof createAdminClient>,
  job: JobRowWithMeta,
  message: string,
) {
  const { data: claimed } = await admin
    .from('blocos3d_jobs')
    .update({
      status:        'failed',
      error_message: message,
      refunded:      true,
      completed_at:  new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'processing')
    .select('id')

  if (claimed && claimed.length > 0 && job.charged && !job.refunded && (job.nodes_cost ?? 0) > 0) {
    await refundNodes(admin, job.user_id, job.nodes_cost ?? 0, {
      module:   'blocos3d',
      jobTable: 'blocos3d_jobs',
      jobId:    job.id,
    })
  }
}
