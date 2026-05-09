// POST /api/spaces/[spaceId]/generate
//
// Gera 1+ variações para um Space travado. Cada variação corresponde a
// um axis_value (ex: ['golden_hour', 'noite_interior']). O motor é fixo
// no Space; a qualidade é decisão por geração.
//
// Pipeline por vista:
//   debit (consume_nodes_v2)
//     → row pendente em vistas (status='processing')
//     → call FAL com Vista Mestre + DNA + axis modifier
//     → update row pra completed com image_url
//   refund se a chamada FAL falhar (best-effort).
//
// Verificação de DNA NÃO roda aqui — cliente dispara /api/vistas/[id]/verify-dna
// em background após a resposta. Mantém latência sob controle.

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENGINES, isResolution, type EngineId, type Resolution } from '@/lib/engines'
import { getVistaGenerationCost, supportsQuality } from '@/lib/spaces/economy'
import { buildVistaPrompt } from '@/lib/spaces/prompts'
import { findAxisOption } from '@/lib/spaces/axes'
import { isAxis, isQuality, type Axis, type ProjectDNA, type Space } from '@/lib/spaces/types'

fal.config({ credentials: process.env.FAL_KEY })

const FAL_TIMEOUT_MS = 90_000

function falParamsForEngine(engine: EngineId, q: Resolution): Record<string, unknown> {
  if (engine === 'quasar') {
    return {
      quality:       q === '4k' ? 'high' : 'medium',
      image_size:    'auto',
      num_images:    1,
      output_format: 'jpeg',
    }
  }
  const map: Record<Resolution, string> = { hd: '1K', '2k': '2K', '4k': '4K' }
  return { resolution: map[q], num_images: 1, output_format: 'jpeg' }
}

interface GenerateBody {
  axis?:        unknown
  axis_values?: unknown
  quality?:     unknown
}

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const body = (await req.json().catch(() => null)) as GenerateBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (!isAxis(body.axis)) {
    return NextResponse.json({ error: 'axis inválido' }, { status: 400 })
  }
  const axis: Axis = body.axis

  if (!Array.isArray(body.axis_values) || body.axis_values.length === 0) {
    return NextResponse.json({ error: 'axis_values é obrigatório' }, { status: 400 })
  }
  const axisValues = body.axis_values.filter((v): v is string => typeof v === 'string')
  if (axisValues.length === 0) {
    return NextResponse.json({ error: 'axis_values inválido' }, { status: 400 })
  }
  // Validar cada axis_value
  for (const v of axisValues) {
    if (!findAxisOption(axis, v)) {
      return NextResponse.json({ error: `Opção inválida: ${axis}/${v}` }, { status: 400 })
    }
  }

  if (!isQuality(body.quality) || !isResolution(body.quality)) {
    return NextResponse.json({ error: 'quality inválida' }, { status: 400 })
  }
  const quality = body.quality

  // Carrega Space (e valida posse via RLS)
  const { data: spaceRow, error: spaceErr } = await supabase
    .from('spaces')
    .select('*')
    .eq('id', spaceId)
    .single()
  if (spaceErr || !spaceRow) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }
  const space = spaceRow as Space
  if (space.status !== 'locked') {
    return NextResponse.json({ error: 'Space ainda não está travado' }, { status: 409 })
  }
  if (!space.dna || !space.vista_mestre_url) {
    return NextResponse.json({ error: 'Space sem DNA ou Vista Mestre' }, { status: 409 })
  }
  if (!supportsQuality(space.engine, quality)) {
    return NextResponse.json(
      { error: `Motor ${space.engine} não suporta ${quality.toUpperCase()}` },
      { status: 400 },
    )
  }

  const dna = space.dna as ProjectDNA
  const engine = space.engine
  const costPerVista = getVistaGenerationCost(engine, quality)
  const totalCost    = costPerVista * axisValues.length
  const falEndpoint  = ENGINES[engine].falEndpoint

  // ── Pré-checagem de saldo (via view) ─────────────────────────
  const { data: bal } = await admin
    .from('user_node_balance')
    .select('total_balance')
    .eq('user_id', user.id)
    .single()
  const available = bal?.total_balance ?? 0
  if (available < totalCost) {
    return NextResponse.json(
      {
        error:     'insufficient_balance',
        available,
        required:  totalCost,
        per_vista: costPerVista,
        message:   `Saldo insuficiente. Necessários ${totalCost} nodes (${axisValues.length} × ${costPerVista}).`,
      },
      { status: 402 },
    )
  }

  // ── Geração paralela (uma transação independente por vista) ──
  const tasks = axisValues.map(axisValue =>
    generateOne({
      admin, userId: user.id, space, dna, engine, quality,
      axis, axisValue, costPerVista, falEndpoint,
    })
  )

  const results = await Promise.allSettled(tasks)
  const vistas:  unknown[] = []
  const errors:  string[]  = []

  for (const r of results) {
    if (r.status === 'fulfilled') vistas.push(r.value)
    else errors.push(r.reason?.message ?? String(r.reason))
  }

  const { data: balAfter } = await admin
    .from('user_node_balance')
    .select('plan_balance, lumen_balance, total_balance')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    vistas,
    errors:        errors.length ? errors : undefined,
    balance_after: balAfter ?? null,
  })
}

// ── Helper: geração + persistência de uma única vista ─────────

async function generateOne(args: {
  admin:        ReturnType<typeof createAdminClient>
  userId:       string
  space:        Space
  dna:          ProjectDNA
  engine:       EngineId
  quality:      Resolution
  axis:         Axis
  axisValue:    string
  costPerVista: number
  falEndpoint:  string
}) {
  const { admin, userId, space, dna, engine, quality, axis, axisValue, costPerVista, falEndpoint } = args

  let debited = false
  let vistaId: string | null = null

  try {
    // 1) débito
    const { error: debitErr } = await admin.rpc('consume_nodes_v2', {
      user_id_input: userId,
      amount:        costPerVista,
    })
    if (debitErr) {
      if (debitErr.code === 'P0001') throw new Error('insufficient_balance')
      throw new Error('debit_failed: ' + debitErr.message)
    }
    debited = true

    // 2) row pendente
    const opt = findAxisOption(axis, axisValue)!
    const { data: row, error: insErr } = await admin
      .from('vistas')
      .insert({
        space_id:    space.id,
        user_id:     userId,
        status:      'processing',
        engine,
        quality,
        axis,
        axis_value:  axisValue,
        axis_label:  opt.label,
        nodes_cost:  costPerVista,
      })
      .select('id')
      .single()
    if (insErr || !row) throw new Error('insert_failed: ' + (insErr?.message ?? '?'))
    vistaId = row.id as string

    // 3) FAL call
    const prompt = buildVistaPrompt(dna, axis, axisValue)
    const falInput = {
      prompt,
      image_urls: [space.vista_mestre_url!],
      ...falParamsForEngine(engine, quality),
    }

    const result = await Promise.race([
      fal.subscribe(falEndpoint, { input: falInput }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('FAL_TIMEOUT'), { isFalTimeout: true })), FAL_TIMEOUT_MS),
      ),
    ])
    const images = (result.data as { images: { url: string }[] }).images
    const outputUrl = images?.[0]?.url
    if (!outputUrl) throw new Error('fal_no_output')

    // 4) Persistir completed
    const { error: updErr } = await admin
      .from('vistas')
      .update({
        image_url:    outputUrl,
        prompt,
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', vistaId)
    if (updErr) {
      console.error('[generate] DB update FALHOU (imagem ok, persistência não):', updErr)
    }

    return {
      id:         vistaId,
      space_id:   space.id,
      image_url:  outputUrl,
      engine,
      quality,
      axis,
      axis_value: axisValue,
      axis_label: opt.label,
      nodes_cost: costPerVista,
      status:     'completed',
    }

  } catch (err) {
    // refund best-effort
    if (debited) {
      try {
        await admin.rpc('refund_nodes', { user_id_input: userId, amount: costPerVista })
      } catch (refundErr) {
        console.error('[generate] FALHA NO REFUND:', refundErr)
      }
    }
    if (vistaId) {
      await admin
        .from('vistas')
        .update({
          status:        'failed',
          error_message: (err as Error).message,
        })
        .eq('id', vistaId)
    }
    throw err
  }
}
