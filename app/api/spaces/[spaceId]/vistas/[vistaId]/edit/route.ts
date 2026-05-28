// POST /api/spaces/[spaceId]/vistas/[vistaId]/edit  (modo embebido)
//
// Cria nova vista derivada da vista original, aplicando inpainting via
// Flux Fill com DNA do Space + Vista Mestre como style reference no prompt.
// A nova vista mantém axis/axis_value/quality da original e ganha:
//   is_edited=true, parent_vista_id=original, edit_chain_root_id=raiz da cadeia.
//
// Cobrança igual ao modo standalone (HD 6, 2K 12, 4K 24).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isQuality, type Quality, type Space, type Vista } from '@/lib/spaces/types'
import { getEditCost } from '@/lib/spaces/edit-economy'
import { selectEngine, callWithTimeoutRetry, isEditMode, type EditMode } from '@/lib/spaces/engines'
import { getVisualDna } from '@/lib/spaces/dna'
import {
  composeEmbeddedFinalPrompt,
  isFidelityMode,
  type FidelityMode,
  type EmbeddedDnaContext,
} from '@/lib/spaces/edit-prompts'

interface EditBody {
  mask_url?:            unknown
  prompt?:              unknown
  quality?:             unknown
  mask_coverage?:       unknown
  /** Phase C: intentional edit mode picked from the UI tabs. */
  mode?:                unknown
  /** Phase C: optional reference image URL for 'replace' mode. */
  reference_image_url?: unknown
  /** v2: how strictly to preserve geometry/lighting (max | balanced | creative). */
  fidelity_mode?:       unknown
}

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string; vistaId: string }> },
) {
  const { spaceId, vistaId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as EditBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const maskUrl      = typeof body.mask_url === 'string' ? body.mask_url : null
  const prompt       = typeof body.prompt   === 'string' ? body.prompt.trim() : ''
  const referenceUrl = typeof body.reference_image_url === 'string' ? body.reference_image_url : undefined

  // Mode defaults to 'material' (legacy clients that don't send mode).
  const mode: EditMode = isEditMode(body.mode) ? body.mode : 'material'

  // Fidelity defaults to 'max' — the safer default for architectural work.
  const fidelity: FidelityMode = isFidelityMode(body.fidelity_mode) ? body.fidelity_mode : 'max'

  if (!maskUrl) return NextResponse.json({ error: 'mask_url obrigatório' }, { status: 400 })
  // 'remove' doesn't need a prompt — the model fills with surrounding context.
  if (mode !== 'remove' && !prompt) {
    return NextResponse.json({ error: 'prompt obrigatório' }, { status: 400 })
  }
  if (!isQuality(body.quality)) {
    return NextResponse.json({ error: 'quality inválida' }, { status: 400 })
  }
  if (body.mode !== undefined && !isEditMode(body.mode)) {
    return NextResponse.json({ error: 'mode inválido' }, { status: 400 })
  }
  if (body.fidelity_mode !== undefined && !isFidelityMode(body.fidelity_mode)) {
    return NextResponse.json({ error: 'fidelity_mode inválido' }, { status: 400 })
  }
  const quality:      Quality = body.quality
  const maskCoverage          = typeof body.mask_coverage === 'number'
    ? Math.max(0, Math.min(1, body.mask_coverage))
    : null

  // Carrega Space + Vista (RLS valida posse)
  const [spaceRes, vistaRes] = await Promise.all([
    supabase.from('spaces').select('*').eq('id', spaceId).single(),
    supabase.from('vistas').select('*').eq('id', vistaId).single(),
  ])
  if (spaceRes.error || !spaceRes.data) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }
  if (vistaRes.error || !vistaRes.data) {
    return NextResponse.json({ error: 'Vista não encontrada' }, { status: 404 })
  }
  const space = spaceRes.data as Space
  const vista = vistaRes.data as Vista
  if (vista.space_id !== space.id) {
    return NextResponse.json({ error: 'Vista não pertence ao Space' }, { status: 400 })
  }
  if (vista.status !== 'completed' || !vista.image_url) {
    return NextResponse.json({ error: 'Vista não está pronta' }, { status: 409 })
  }

  const dna  = getVisualDna(space.dna)
  const cost = getEditCost(quality)

  const admin = createAdminClient()
  let debited = false
  let newVistaId: string | null = null

  try {
    // Pré-checagem de saldo
    const { data: bal } = await admin
      .from('user_node_balance')
      .select('total_balance')
      .eq('user_id', user.id)
      .single()
    if ((bal?.total_balance ?? 0) < cost) {
      return NextResponse.json(
        {
          error:     'insufficient_balance',
          available: bal?.total_balance ?? 0,
          required:  cost,
          message:   `Saldo insuficiente. Necessários ${cost} nodes.`,
        },
        { status: 402 },
      )
    }

    // Débito
    const { error: debitErr } = await admin.rpc('consume_nodes_v2', {
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
      throw new Error('debit_failed: ' + debitErr.message)
    }
    debited = true

    // Calcula raiz da cadeia
    const chainRoot = vista.edit_chain_root_id ?? vista.id

    // Pré-insere vista pendente (axis/axis_label da original)
    const { data: row, error: insErr } = await admin
      .from('vistas')
      .insert({
        space_id:             space.id,
        user_id:              user.id,
        status:               'processing',
        engine:               'flux-fill',
        quality,
        axis:                 vista.axis,
        axis_value:           vista.axis_value,
        axis_label:           vista.axis_label,
        nodes_cost:           cost,
        parent_vista_id:      vista.id,
        is_edited:            true,
        edit_prompt:          prompt,
        edit_mask_url:        maskUrl,
        edit_chain_root_id:   chainRoot,
        edit_mask_coverage:   maskCoverage,
      })
      .select('id')
      .single()
    if (insErr || !row) throw new Error('insert_failed: ' + (insErr?.message ?? '?'))
    newVistaId = row.id as string

    // Route to the right engine for the picked mode (Phase C). 'remove' uses
    // the specialized object-removal model and ignores the prompt; the other
    // modes go through Flux Pro Fill / Flux dev inpaint with the DNA-enriched
    // wrapper. The router decision is invisible to the user.
    //
    // NOTE: `vistas.engine` has a CHECK constraint that doesn't yet include
    // the new endpoint ids. For now we keep persisting 'flux-fill' so the
    // insert succeeds; out.endpoint is logged for telemetry. Phase D will
    // relax the constraint via migration so each row stores the actual engine.
    const engine = selectEngine(mode, quality)
    const dnaContext: EmbeddedDnaContext | null = dna ? {
      estiloNome: dna.estilo.nome,
      materiais:  dna.materiais,
      paleta:     dna.paleta,
      contexto:   dna.contexto,
    } : null
    const finalPrompt = composeEmbeddedFinalPrompt({
      userPrompt: prompt,
      mode,
      fidelity,
      dna:        dnaContext,
    })
    // callWithTimeoutRetry retries once on RetouchTimeoutError (cold start).
    const out = await callWithTimeoutRetry(engine, {
      imageUrl:     vista.image_url,
      maskUrl,
      prompt:       finalPrompt,
      referenceUrl: mode === 'replace' ? referenceUrl : undefined,
      quality,
    })
    console.log('[vista.edit] mode=%s endpoint=%s prompt_len=%d', mode, out.endpoint, finalPrompt.length)

    const { error: updErr } = await admin
      .from('vistas')
      .update({
        image_url:    out.imageUrl,
        prompt:       finalPrompt,
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', newVistaId)
    if (updErr) console.error('[vista.edit] update failed:', updErr)

    const { data: balAfter } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      vista: {
        id:                   newVistaId,
        space_id:             space.id,
        image_url:            out.imageUrl,
        engine:               'flux-fill',
        quality,
        axis:                 vista.axis,
        axis_value:           vista.axis_value,
        axis_label:           vista.axis_label,
        is_edited:            true,
        parent_vista_id:      vista.id,
        edit_chain_root_id:   chainRoot,
        edit_prompt:          prompt,
        edit_mask_coverage:   maskCoverage,
        nodes_cost:           cost,
        status:               'completed',
      },
      balance_after: balAfter ?? null,
    })
  } catch (err) {
    if (debited) {
      try { await admin.rpc('refund_nodes', { user_id_input: user.id, amount: cost }) }
      catch (refundErr) { console.error('[vista.edit] refund failed:', refundErr) }
    }
    if (newVistaId) {
      await admin
        .from('vistas')
        .update({ status: 'failed', error_message: (err as Error).message })
        .eq('id', newVistaId)
    }
    console.error('[vista.edit] error:', (err as Error).message)
    return NextResponse.json({ error: 'Falha na edição' }, { status: 500 })
  }
}
