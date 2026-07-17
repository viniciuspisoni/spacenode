// GET /api/blocos3d/[jobId] — poll + finalização do job Blocos 3D.
//
// O cliente consulta a cada poucos segundos enquanto status = 'processing'.
// Este endpoint é quem TRANSICIONA o job (o poll é a fonte de verdade):
//
//   succeeded → re-hospeda modelos/thumbnail no bucket `spacenode-media`
//               (as URLs dos providers expiram) e marca completed.
//   failed    → marca failed; o claim (UPDATE condicional em
//               status='processing') garante UM estorno, e `refunded` só vira
//               true DEPOIS do refund confirmado pelo banco — refund que falha
//               fica findável (status='failed' AND charged AND NOT refunded).
//   demais    → atualiza progress (best-effort) e devolve o estado.
//
// Corrida entre polls concorrentes (duas abas): o rehost usa keys
// determinísticas com upsert (os dois gravam os mesmos bytes) e o UPDATE
// condicional garante que só um request transiciona; o perdedor relê a linha
// e devolve o estado já transicionado.

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

type Admin = ReturnType<typeof createAdminClient>

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params
  // uuid inválido viraria 22P02 no PostgREST → 500 + ruído de log; é 404.
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
  }

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
    return emitFresh(admin, job)
  }

  try {
    const task = await getProviderTask(job.provider, job.engine, job.provider_task_id)

    if (task.status === 'succeeded') {
      // Re-hospeda ANTES da transição (keys determinísticas + upsert →
      // idempotente entre retries/abas; falha parcial mantém a URL do provider
      // como fallback — nunca perde o output).
      const { modelKeys, thumbnailKey } = await rehostProviderOutputs(admin, {
        userId:       job.user_id,
        jobId:        job.id,
        modelUrls:    task.modelUrls,
        thumbnailUrl: task.thumbnailUrl,
      })

      const { data: updated } = await admin
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
        .select(ROW_COLUMNS)

      const winner = (updated?.[0] as unknown as JobRowWithMeta) ?? null
      if (winner) return NextResponse.json({ job: await toJobView(admin, winner) })
      // Outro poll transicionou primeiro — devolve o estado dele.
      return emitFresh(admin, job)
    }

    if (task.status === 'failed') {
      await failJob(admin, job, task.errorMessage || 'Geração falhou no provider')
      return emitFresh(admin, job)
    }

    // ── Ainda processando ────────────────────────────────────────────────────
    if (Date.now() - new Date(job.created_at).getTime() > STALE_JOB_MS) {
      await failJob(admin, job, 'Tempo limite de geração excedido')
      return emitFresh(admin, job)
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
      return emitFresh(admin, job)
    }
    // Erro transitório (rede/5xx do provider): NÃO transiciona — devolve o
    // estado atual e o cliente continua o polling.
    console.error('[blocos3d/poll] provider error (transitório):', (err as Error)?.message ?? err)
    return NextResponse.json({ job: await toJobView(admin, job) })
  }
}

/** Relê a linha e emite — pra caminhos onde outro request pode ter ganho a
 *  transição (o estado fresco do banco é sempre a resposta certa). */
async function emitFresh(admin: Admin, job: JobRowWithMeta): Promise<NextResponse> {
  const { data } = await admin
    .from('blocos3d_jobs')
    .select(ROW_COLUMNS)
    .eq('id', job.id)
    .maybeSingle()
  const fresh = (data as unknown as JobRowWithMeta) ?? job
  return NextResponse.json({ job: await toJobView(admin, fresh) })
}

/** Transição pra failed com refund VERIFICADO uma única vez: o UPDATE
 *  condicional em status='processing' é o claim — só quem ganhou estorna.
 *  `refunded` vira true só DEPOIS do refund confirmado; se o RPC falhar, a
 *  linha fica findável em reconciliação (failed AND charged AND NOT refunded)
 *  além do log "FALHA NO REFUND" do helper. */
async function failJob(admin: Admin, job: JobRowWithMeta, message: string) {
  const { data: claimed } = await admin
    .from('blocos3d_jobs')
    .update({
      status:        'failed',
      error_message: message,
      completed_at:  new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'processing')
    .select('id')

  const won = !!claimed && claimed.length > 0
  if (!won || !job.charged || job.refunded || (job.nodes_cost ?? 0) <= 0) return

  const ok = await refundNodes(admin, job.user_id, job.nodes_cost ?? 0, {
    module:   'blocos3d',
    jobTable: 'blocos3d_jobs',
    jobId:    job.id,
  })
  if (ok) {
    await admin.from('blocos3d_jobs').update({ refunded: true }).eq('id', job.id)
  }
}
