// POST /api/vistas/[vistaId]/upscale
//
// Cria nova vista por upscale via Clarity. Custo definido por target.
// Body: { target: '2k' | '4k' }

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUpscaleCost } from '@/lib/spaces/economy'

fal.config({ credentials: process.env.FAL_KEY })

const FAL_TIMEOUT_MS = 120_000

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ vistaId: string }> },
) {
  const { vistaId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { target?: unknown } | null
  const target = body?.target
  if (target !== '2k' && target !== '4k') {
    return NextResponse.json({ error: 'target inválido (2k ou 4k)' }, { status: 400 })
  }

  const { data: src, error: srcErr } = await supabase
    .from('vistas')
    .select('id, space_id, image_url, axis, axis_value, axis_label, quality')
    .eq('id', vistaId)
    .single()
  if (srcErr || !src) {
    return NextResponse.json({ error: 'Vista não encontrada' }, { status: 404 })
  }
  if (!src.image_url) {
    return NextResponse.json({ error: 'Vista sem imagem' }, { status: 409 })
  }
  if (target === src.quality) {
    return NextResponse.json({ error: `Vista já está em ${target.toUpperCase()}` }, { status: 409 })
  }

  const cost  = getUpscaleCost(target)
  const admin = createAdminClient()

  let debited = false
  let newId: string | null = null

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
      throw new Error('debit_failed')
    }
    debited = true

    // Insere row pendente
    const { data: inserted, error: insErr } = await admin
      .from('vistas')
      .insert({
        space_id:        src.space_id,
        user_id:         user.id,
        status:          'processing',
        engine:          'clarity',
        quality:         target,
        axis:            src.axis,
        axis_value:      src.axis_value,
        axis_label:      src.axis_label,
        nodes_cost:      cost,
        source_vista_id: src.id,
      })
      .select('id')
      .single()
    if (insErr || !inserted) throw new Error('insert_failed')
    newId = inserted.id as string

    // Clarity call — campos extras (creativity/resemblance/dynamic/etc.) são
    // suportados pelo endpoint mas não aparecem no tipo gerado do client; o
    // cast pra `never` evita o type-check estrito e mantém o payload completo.
    const scaleFactor = target === '4k' ? 4 : 2
    const clarityInput = {
      image_url:           src.image_url,
      upscale_factor:      scaleFactor,
      prompt:              'architectural render, photorealistic, preserve details',
      creativity:          0.3,
      resemblance:         0.9,
      dynamic:             6,
      num_inference_steps: 20,
    } as unknown as never
    const result = await Promise.race([
      fal.subscribe('fal-ai/clarity-upscaler', { input: clarityInput }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FAL_TIMEOUT')), FAL_TIMEOUT_MS),
      ),
    ])

    const data    = result.data as { image?: { url?: string }; images?: { url?: string }[] }
    const outUrl  = data.image?.url ?? data.images?.[0]?.url
    if (!outUrl) throw new Error('clarity_no_output')

    const { error: updErr } = await admin
      .from('vistas')
      .update({
        image_url:    outUrl,
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', newId)
    if (updErr) console.error('[upscale] update failed:', updErr)

    return NextResponse.json({
      vista: {
        id:        newId,
        space_id:  src.space_id,
        image_url: outUrl,
        engine:    'clarity',
        quality:   target,
      },
    })
  } catch (err) {
    if (debited) {
      try { await admin.rpc('refund_workspace_nodes', { user_id_input: user.id, amount: cost }) }
      catch (e) { console.error('[upscale] refund failed:', e) }
    }
    if (newId) {
      await admin.from('vistas').update({
        status: 'failed', error_message: (err as Error).message,
      }).eq('id', newId)
    }
    console.error('[upscale] error:', (err as Error).message)
    return NextResponse.json({ error: 'Falha no upscale' }, { status: 500 })
  }
}
