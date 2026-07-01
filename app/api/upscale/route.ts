// POST /api/upscale — módulo Ampliar v2 (abas Resolução e Aprimorar).
//
// Contrato (FormData):
//   - image:        File (obrigatório)
//   - tab:          'resolution' | 'enhance'
//   - modeId:       'fidelity' | 'recover' | 'denoise' | 'deblur' | 'restore' | 'smart'
//   - scale:        'none' | '2x' | '4x' | '8x' | 'ultra'
//   - objectiveId?: 'client' | 'portfolio' | 'print' | 'recover' | 'final'
//   - imageWidth?:  number  (origem; usado para custo por megapixel)
//   - imageHeight?: number
//
// Custo: computeUpscaleCost — único ponto de verdade.
// Débito: consume_nodes_v2 com refund_nodes em falha pós-débito.
// Histórico: insere em `renders` com upscale_meta jsonb completo.

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeUpscaleCost,
  finalProvider,
  megapixelsFromDimensions,
  runUpscalePipeline,
  type ModeId,
  type Scale,
  type UpscaleTab,
} from '@/lib/upscale'

export const maxDuration = 300

fal.config({ credentials: process.env.FAL_KEY })

const VALID_TABS:   UpscaleTab[] = ['resolution', 'enhance']
const VALID_MODES:  ModeId[]     = ['fidelity', 'recover', 'denoise', 'deblur', 'restore', 'smart']
const VALID_SCALES: Scale[]      = ['none', '2x', '4x', '8x', 'ultra']

// Constraint: aba × modo precisam combinar para evitar requisições inválidas.
const ALLOWED_MODES_BY_TAB: Record<UpscaleTab, ModeId[]> = {
  resolution: ['fidelity', 'recover'],
  enhance:    ['denoise', 'deblur', 'restore', 'smart'],
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // ── Parse + validação ──────────────────────────────────────────────────────
  const form = await req.formData()
  const imageFile   = form.get('image')        as File   | null
  const tab         = (form.get('tab')         as string | null) ?? 'resolution'
  const modeId      = (form.get('modeId')      as string | null) ?? 'fidelity'
  const scale       = (form.get('scale')       as string | null) ?? '4x'
  const objectiveId = (form.get('objectiveId') as string | null) ?? null
  const widthRaw    =  form.get('imageWidth')  as string | null
  const heightRaw   =  form.get('imageHeight') as string | null

  if (!imageFile) {
    return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
  }
  if (!VALID_TABS.includes(tab as UpscaleTab)) {
    return NextResponse.json({ error: 'tab inválido' }, { status: 400 })
  }
  if (!VALID_MODES.includes(modeId as ModeId)) {
    return NextResponse.json({ error: 'modeId inválido' }, { status: 400 })
  }
  if (!VALID_SCALES.includes(scale as Scale)) {
    return NextResponse.json({ error: 'scale inválido' }, { status: 400 })
  }
  if (!ALLOWED_MODES_BY_TAB[tab as UpscaleTab].includes(modeId as ModeId)) {
    return NextResponse.json({ error: 'combinação tab/modo inválida' }, { status: 400 })
  }

  const tabT    = tab    as UpscaleTab
  const modeT   = modeId as ModeId
  const scaleT  = scale  as Scale
  const width   = widthRaw  ? Number(widthRaw)  : null
  const height  = heightRaw ? Number(heightRaw) : null

  // ── Custo ──────────────────────────────────────────────────────────────────
  const cost = computeUpscaleCost({
    tab:        tabT,
    modeId:     modeT,
    scale:      scaleT,
    megapixels: megapixelsFromDimensions(width, height),
  }).total

  // ── Débito (com refund em falha) ───────────────────────────────────────────
  const admin = createAdminClient()
  let debited = false
  let inputUrl:  string | undefined

  try {
    const { error: debitErr } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount:        cost,
    })
    if (debitErr) {
      if (debitErr.code === 'P0001') {
        return NextResponse.json(
          { error: 'insufficient_balance', required: cost, message: 'Saldo insuficiente' },
          { status: 402 },
        )
      }
      console.error('[upscale] consume_nodes_v2 RPC error:', debitErr)
      return NextResponse.json({ error: 'Erro ao processar saldo' }, { status: 500 })
    }
    debited = true

    // ── Upload da imagem para FAL ──────────────────────────────────────────
    inputUrl = await fal.storage.upload(imageFile)

    console.log('[upscale] tab=%s mode=%s scale=%s mp=%s', tabT, modeT, scaleT, megapixelsFromDimensions(width, height))

    // ── Pipeline ────────────────────────────────────────────────────────────
    const result = await runUpscalePipeline({
      tab:             tabT,
      modeId:          modeT,
      scale:           scaleT,
      objectiveId:     objectiveId as never,
      imageUrl:        inputUrl,
      inputDimensions: width && height ? { width, height } : null,
    })

    const outputUrl   = result.outputUrl
    const usedProvider = finalProvider(result) ?? modeT
    // Rastreabilidade: id do request fal do último step concluído (o que produziu
    // o output). O detalhe por step também vai em upscale_meta.steps[].requestId.
    const falRequestId = [...result.steps].reverse().find(s => s.status === 'completed')?.requestId ?? null

    // ── Histórico ───────────────────────────────────────────────────────────
    // Mantemos o padrão legado em ambient/style/lighting para compatibilidade
    // com a UI de histórico atual; o detalhe rico vai em upscale_meta.
    const styleKey = `upscale:${usedProvider}`
    const lighting = scaleT === 'none' ? 'none' : scaleT

    const upscaleMeta = {
      tab:              tabT,
      mode_id:          modeT,
      objective_id:     objectiveId,
      scale:            scaleT,
      steps:            result.steps,
      input_dimensions:  width && height ? { width, height } : null,
      total_duration_ms: result.totalDurationMs,
    }

    // nodes_charged: o Histórico ("Detalhes da geração") lê daqui o custo real.
    // duration_ms: idem para tempo de geração (coluna da migration 20260701;
    // se ainda não aplicada, o insert cai no fallback sem ela).
    const upscaleRow = {
      user_id:      user.id,
      input_url:    inputUrl,
      output_url:   outputUrl,
      prompt:       `ampliar ${tabT}/${modeT} ${scaleT}`,
      ambient:      'upscale',
      style:        styleKey,
      lighting,
      nodes_charged: cost,
      fal_request_id: falRequestId,
      status:       'completed',
      completed_at: new Date().toISOString(),
      upscale_meta: upscaleMeta,
    }
    const ins = await admin.from('renders').insert({
      ...upscaleRow,
      duration_ms: result.totalDurationMs ?? null,
    } as never)
    if (ins.error && (ins.error.code === 'PGRST204' || ins.error.code === '42703')) {
      await admin.from('renders').insert(upscaleRow as never)
    }

    return NextResponse.json({
      url:         outputUrl,
      originalUrl: inputUrl,
      provider:    usedProvider,
      durationMs:  result.totalDurationMs,
    })

  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[upscale] ERROR status:', e?.status)
    console.error('[upscale] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    if (debited) {
      try {
        await admin.rpc('refund_workspace_nodes', { user_id_input: user.id, amount: cost })
        console.warn('[upscale] refund executado:', cost, 'nodes →', user.id)
      } catch (refundErr) {
        console.error('[upscale] FALHA NO REFUND (CRÍTICO):', refundErr)
      }
    }

    return NextResponse.json({ error: 'Erro ao processar imagem. Tente novamente.' }, { status: 500 })
  }
}
