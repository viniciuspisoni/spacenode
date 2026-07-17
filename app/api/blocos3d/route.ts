// /api/blocos3d — módulo Blocos 3D (imagem → modelo 3D; providers fal + Meshy).
//
// POST — cria o job (padrão fila + polling, a evolução recomendada no /api/video):
//   1. valida body { sourceKey, quality, texturePrompt? } (a imagem já subiu
//      DIRETO pro Storage via uploadDirect, área blocos3d-source; o binário
//      não passa pela Vercel)
//   2. débito atômico ANTES da geração (consume_workspace_nodes; P0001 → 402)
//   3. cria a task no provider do motor com signed URL de TTL curto da imagem
//   4. insere blocos3d_jobs e devolve { jobId } — request dura poucos segundos;
//      o acompanhamento é via GET /api/blocos3d/[jobId]
//
// GET — lista os últimos jobs do usuário (histórico do módulo).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { DIRECT_UPLOAD_AREAS, verifyDirectUpload } from '@/lib/storage/direct-upload'
import { signStorageKey } from '@/lib/storage/signed'
import { getBlocos3DEngine, normalizeBlocos3DOptions } from '@/lib/blocos3d/config'
import { createProviderTask, engineAvailable } from '@/lib/blocos3d/provider'
import { MeshyError } from '@/lib/blocos3d/meshy'
import { BLOCOS3D_JOB_COLUMNS, toJobView, type Blocos3DJobRow } from '@/lib/blocos3d/view'

export const maxDuration = 60

// TTL da signed URL que o provider usa pra baixar a imagem de origem. Curto de
// propósito: o download acontece na criação da task.
const SOURCE_SIGNED_TTL_SECONDS = 60 * 60

const DEFAULT_LIMIT = 20
const MAX_LIMIT     = 50

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : ''
  const options = normalizeBlocos3DOptions(body)

  if (!sourceKey) return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
  if (!options)   return NextResponse.json({ error: 'Opções inválidas' }, { status: 400 })

  const engine = getBlocos3DEngine(options.quality)
  if (!engineAvailable(engine)) {
    return NextResponse.json(
      { error: `Qualidade ${engine.label} indisponível no momento.` },
      { status: 503 },
    )
  }

  // ── Origem: valida o upload direto (dono/área/limites) sem baixar o binário ─
  const area = DIRECT_UPLOAD_AREAS['blocos3d-source']
  const src = await verifyDirectUpload(admin, area, user.id, {}, sourceKey)
  if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })

  const nodesToCharge = engine.costInNodes

  // ── Débito atômico ANTES da geração (padrão do /api/video) ─────────────────
  // consume_workspace_nodes cobra a bolsa do PAGADOR (dono do workspace).
  // P0001 = saldo insuficiente → 402; outro erro → 500. Nada é criado no
  // provider sem débito confirmado.
  const { error: debitError } = await admin.rpc('consume_workspace_nodes', {
    user_id_input: user.id,
    amount:        nodesToCharge,
  })
  if (debitError) {
    if (debitError.code === 'P0001') {
      return NextResponse.json(
        { error: `Nodes insuficientes. Necessários: ${nodesToCharge}.` },
        { status: 402 },
      )
    }
    console.error('[blocos3d] consume_workspace_nodes RPC error:', debitError)
    return NextResponse.json({ error: 'Erro ao processar saldo.' }, { status: 500 })
  }

  try {
    // ── Signed URL da origem pro provider baixar ─────────────────────────────
    // signStorageKey (sem gate): funciona com o bucket público OU privado.
    const signedSourceUrl = await signStorageKey(admin, area.bucket, sourceKey, SOURCE_SIGNED_TTL_SECONDS)
    if (!signedSourceUrl) throw new Error('Falha ao assinar a imagem de origem')

    // ── Cria a task no provider do motor ─────────────────────────────────────
    const taskId = await createProviderTask(engine, signedSourceUrl, options)

    // ── Persiste o job ───────────────────────────────────────────────────────
    const { data: job, error: insertError } = await admin
      .from('blocos3d_jobs')
      .insert({
        user_id:          user.id,
        status:           'processing',
        provider:         engine.provider,
        engine:           engine.engine,
        provider_task_id: taskId,
        input_image_url:  src.url,
        quality:          options.quality,
        options: {
          texture_prompt: options.texturePrompt ?? null,
        },
        nodes_cost: nodesToCharge,
        charged:    true,
      })
      .select('id')
      .single()

    if (insertError || !job) {
      // Task criada no provider mas sem rastro no banco → estorna e loga LOUD
      // (a geração vai concluir no provider, mas o usuário não paga por algo
      // que não consegue ver).
      console.error('[blocos3d] DB INSERT FALHOU (task criada no provider — investigar):', {
        error: insertError, userId: user.id, engine: engine.engine, taskId,
      })
      throw new Error('Falha ao registrar o job')
    }

    // Saldo real pós-débito da BOLSA (dono do workspace) — é dela que saiu.
    const payerId = (await getPayerId(admin, user.id)) ?? user.id
    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance')
      .eq('user_id', payerId)
      .single()

    return NextResponse.json({
      jobId:        job.id,
      nodesCharged: nodesToCharge,
      credits:      balance?.plan_balance ?? undefined,
    })
  } catch (err: unknown) {
    // ── Refund VERIFICADO em qualquer falha pós-débito ─────────────────────────
    await refundNodes(admin, user.id, nodesToCharge, { module: 'blocos3d', jobTable: 'blocos3d_jobs' })

    if (err instanceof MeshyError) {
      console.error('[blocos3d] Meshy error:', err.status, err.message)
      // 402 da Meshy = créditos DO PROVIDER esgotados — problema nosso, não do
      // usuário. Mensagem genérica + log pra alertar operação.
      return NextResponse.json(
        { error: 'Serviço de geração 3D indisponível no momento. Tente novamente em instantes.' },
        { status: 502 },
      )
    }
    console.error('[blocos3d] ERROR:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'Erro ao iniciar a geração 3D. Tente novamente.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = (() => {
    const n = Number(limitParam)
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
    return Math.min(MAX_LIMIT, Math.floor(n))
  })()

  // Client user-scoped: RLS garante que só vêm os próprios jobs.
  const { data, error } = await supabase
    .from('blocos3d_jobs')
    .select(BLOCOS3D_JOB_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GET /api/blocos3d]', error)
    return NextResponse.json({ error: 'Falha ao carregar histórico' }, { status: 500 })
  }

  const admin = createAdminClient()
  const jobs = await Promise.all(
    ((data ?? []) as unknown as Blocos3DJobRow[]).map(row => toJobView(admin, row)),
  )
  return NextResponse.json({ jobs })
}
