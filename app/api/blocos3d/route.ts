// /api/blocos3d — módulo Blocos 3D (imagem → modelo 3D; motores via fal).
//
// POST — cria o job (padrão fila + polling, a evolução recomendada no /api/video):
//   1. valida body { sourceKeys: { front, left?, back?, right? }, quality,
//      texturePrompt? } (as imagens já subiram DIRETO pro Storage via
//      uploadDirect, área blocos3d-source; o binário não passa pela Vercel)
//   2. débito atômico ANTES da geração (consume_workspace_nodes; P0001 → 402)
//   3. cria a task no provider do motor com signed URLs de TTL curto
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
import {
  getBlocos3DEngine,
  normalizeBlocos3DOptions,
  normalizeSourceKeys,
  countImages,
  VIEW_POSITION_ORDER,
} from '@/lib/blocos3d/config'
import { createProviderTask, engineAvailable } from '@/lib/blocos3d/provider'
import { MeshyError } from '@/lib/blocos3d/meshy'
import { BLOCOS3D_JOB_COLUMNS, toJobView, type Blocos3DJobRow } from '@/lib/blocos3d/view'
import type { PositionedImages } from '@/lib/blocos3d/types'

export const maxDuration = 60

// TTL das signed URLs que o provider usa pra baixar as imagens de origem.
// Curto de propósito: o download acontece na criação da task.
const SOURCE_SIGNED_TTL_SECONDS = 60 * 60

const DEFAULT_LIMIT = 20
const MAX_LIMIT     = 50

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const sourceKeys = normalizeSourceKeys(body)
  const options = normalizeBlocos3DOptions(body)

  if (!sourceKeys) return NextResponse.json({ error: 'Imagem da frente obrigatória' }, { status: 400 })
  if (!options)    return NextResponse.json({ error: 'Opções inválidas' }, { status: 400 })

  const engine = getBlocos3DEngine(options.quality)
  if (!engineAvailable(engine)) {
    return NextResponse.json(
      { error: `Qualidade ${engine.label} indisponível no momento.` },
      { status: 503 },
    )
  }
  if (countImages(sourceKeys) > engine.maxImages) {
    return NextResponse.json(
      { error: `O motor ${engine.label} aceita até ${engine.maxImages} ângulos.` },
      { status: 400 },
    )
  }

  // ── Origem: valida cada upload direto (dono/área/limites) sem baixar ───────
  const area = DIRECT_UPLOAD_AREAS['blocos3d-source']
  const positions = VIEW_POSITION_ORDER.filter(p => sourceKeys[p])
  const verified = await Promise.all(
    positions.map(async p => ({ p, res: await verifyDirectUpload(admin, area, user.id, {}, sourceKeys[p]!) })),
  )
  const bad = verified.find(v => !v.res.ok)
  if (bad && !bad.res.ok) {
    return NextResponse.json({ error: bad.res.message }, { status: bad.res.status })
  }
  const frontPublicUrl = (verified[0].res as { ok: true; url: string }).url

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
    // ── Signed URLs das origens pro provider baixar ──────────────────────────
    // signStorageKey (sem gate): funciona com o bucket público OU privado.
    const signedEntries = await Promise.all(
      positions.map(async p => {
        const url = await signStorageKey(admin, area.bucket, sourceKeys[p]!, SOURCE_SIGNED_TTL_SECONDS)
        if (!url) throw new Error(`Falha ao assinar a imagem (${p})`)
        return [p, url] as const
      }),
    )
    const signedImages = Object.fromEntries(signedEntries) as unknown as PositionedImages<string>

    // ── Cria a task no provider do motor ─────────────────────────────────────
    // engineId = endpoint efetivo (Tripo troca pra multiview conforme imagens).
    const { taskId, engineId } = await createProviderTask(engine, signedImages, options)

    // ── Persiste o job ───────────────────────────────────────────────────────
    const { data: job, error: insertError } = await admin
      .from('blocos3d_jobs')
      .insert({
        user_id:          user.id,
        status:           'processing',
        provider:         engine.provider,
        engine:           engineId,
        provider_task_id: taskId,
        input_image_url:  frontPublicUrl,
        quality:          options.quality,
        options: {
          texture_prompt: options.texturePrompt ?? null,
          source_keys:    sourceKeys,
          image_count:    positions.length,
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
        error: insertError, userId: user.id, engine: engineId, taskId,
      })
      throw new Error('Falha ao registrar o job')
    }

    // Saldo real pós-débito da BOLSA (dono do workspace) — é dela que saiu.
    // Best-effort em try próprio: com o job já inserido, uma exceção aqui NÃO
    // pode cair no catch de refund (o job está vivo — estornar agora abriria
    // double-refund quando o poll falhasse, ou geração de graça no sucesso).
    let credits: number | undefined
    try {
      const payerId = (await getPayerId(admin, user.id)) ?? user.id
      const { data: balance } = await admin
        .from('user_node_balance')
        .select('plan_balance')
        .eq('user_id', payerId)
        .single()
      credits = balance?.plan_balance ?? undefined
    } catch (e) {
      console.warn('[blocos3d] leitura de saldo pós-débito falhou (não crítico):', (e as Error)?.message)
    }

    return NextResponse.json({
      jobId:        job.id,
      nodesCharged: nodesToCharge,
      credits,
    })
  } catch (err: unknown) {
    // ── Refund VERIFICADO em falha pós-débito e PRÉ-registro do job ────────────
    // (depois do insert, quem estorna é exclusivamente o failJob do poll.)
    await refundNodes(admin, user.id, nodesToCharge, { module: 'blocos3d', jobTable: 'blocos3d_jobs' })

    if (err instanceof MeshyError) {
      console.error('[blocos3d] Meshy error:', err.status, err.message)
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
  // Listagem sem URLs de modelo (o strip só renderiza thumbnails); o detalhe
  // completo vem do GET /api/blocos3d/[jobId] quando o job é selecionado.
  const jobs = await Promise.all(
    ((data ?? []) as unknown as Blocos3DJobRow[]).map(row =>
      toJobView(admin, row, { includeModelUrls: false }),
    ),
  )
  return NextResponse.json({ jobs })
}
