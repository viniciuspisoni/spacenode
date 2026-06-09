// POST /api/spaces/[spaceId]/vistas/[vistaId]/edit  (modo embebido)
//
// Cria nova vista derivada da original. Usa o MESMO editRouter do módulo Editar
// standalone — sem cobrança paralela: routeEdit() decide endpoint + custo (tiers
// 0–6, com quick fix grátis quando elegível) ANTES de consumir nodes; o pipeline
// faz crop por máscara e recompõe sobre a original; toda tentativa é registrada
// em image_edit_attempts (project_id = space). Prompt enriquecido com o DNA do
// Space. Premium só com opt-in explícito (body.premium).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isQuality, type Quality, type Space, type Vista } from '@/lib/spaces/types'
import { isEditMode, dispatchEndpoint, type EditMode } from '@/lib/spaces/engines'
import {
  composeRouterPrompt,
  isFidelityMode,
  type FidelityMode,
  type EmbeddedDnaContext,
} from '@/lib/spaces/edit-prompts'
import {
  routeEdit,
  endpointProvider,
  estimateProviderCostUsd,
  editButtonLabel,
  editChargeExplanation,
  isBlendTool,
} from '@/lib/spaces/edit-router'
import { editToolFromMode } from '@/lib/spaces/edit-router-adapters'
import {
  buildRoutingContext,
  uploadEditAsset,
  logEditRoute,
  parseReferences,
  persistReferences,
  referenceRoles,
  type EditRequestParams,
} from '@/lib/spaces/edit-route-helpers'
import { runEdit, OUT_OF_MASK_GATE, BLEND_OUT_OF_MASK_GATE } from '@/lib/spaces/edit-pipeline'
import { getVisualDna } from '@/lib/spaces/dna'

// sharp (crop/recompose) exige runtime Node.
export const runtime = 'nodejs'

interface EditBody {
  mask_url?:            unknown
  prompt?:              unknown
  quality?:             unknown
  mask_coverage?:       unknown
  mode?:                unknown
  reference_image_url?: unknown
  fidelity_mode?:       unknown
  premium?:             unknown
  image_megapixels?:    unknown
  references?:          unknown
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
  const premium      = body.premium === true

  const mode: EditMode = isEditMode(body.mode) ? body.mode : 'material'
  const fidelity: FidelityMode = isFidelityMode(body.fidelity_mode) ? body.fidelity_mode : 'max'

  if (!maskUrl) return NextResponse.json({ error: 'mask_url obrigatório' }, { status: 400 })
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
  const imageMegapixels       = typeof body.image_megapixels === 'number' ? body.image_megapixels : null

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

  const dna   = getVisualDna(space.dna)
  const admin = createAdminClient()

  // ── 1) Contexto + rota (sem tocar em saldo) ──
  const references = parseReferences(body.references)
  const params: EditRequestParams = {
    mode, prompt, hasMask: !!maskUrl, maskCoverage, quality, fidelity,
    premium, imageMegapixels, sourceType: 'vista', sourceId: vistaId, references,
  }
  const ctx     = await buildRoutingContext(admin, user.id, params)
  const routing = routeEdit(ctx.input)
  logEditRoute(routing, ctx.input) // dev/staging only

  const { call: engine, usesMask } = dispatchEndpoint(routing.endpoint)
  const dnaContext: EmbeddedDnaContext | null = dna ? {
    estiloNome: dna.estilo.nome,
    materiais:  dna.materiais,
    paleta:     dna.paleta,
    contexto:   dna.contexto,
  } : null
  const finalPrompt     = composeRouterPrompt({ userPrompt: prompt, mode, fidelity, usesMask, dna: dnaContext, references })
  const tool            = editToolFromMode(mode)
  const provider        = endpointProvider(routing.endpoint)
  const providerCostUsd = estimateProviderCostUsd(routing.endpoint, ctx.input.imageMegapixels)

  // ── 2) Pré-checagem de saldo (só se cobra) ──
  if (routing.costNodes > 0) {
    const { data: bal } = await admin
      .from('user_node_balance')
      .select('total_balance')
      .eq('user_id', user.id)
      .single()
    if ((bal?.total_balance ?? 0) < routing.costNodes) {
      return NextResponse.json(
        {
          error:     'insufficient_balance',
          available: bal?.total_balance ?? 0,
          required:  routing.costNodes,
          message:   `Saldo insuficiente. Necessários ${routing.costNodes} nodes.`,
        },
        { status: 402 },
      )
    }
  }

  // ── 3) Registra a tentativa (status 'processing') ──
  const { data: attempt } = await admin
    .from('image_edit_attempts')
    .insert({
      user_id:           user.id,
      source_image_id:   vistaId,
      project_id:        spaceId,
      tool,
      prompt,
      endpoint:          routing.endpoint,
      provider,
      cost_nodes:        routing.costNodes,
      provider_cost_usd: providerCostUsd,
      is_free_fix:       routing.isFreeFix,
      has_mask:          !!maskUrl,
      mask_area_ratio:   maskCoverage,
      used_crop:         false,
      output_resolution: ctx.input.outputResolution,
      preservation_mode: fidelity,
      reference_count:   references.length,
      reference_roles:   referenceRoles(references),
      status:            'processing',
    })
    .select('id')
    .single()
  const attemptId: string | null = attempt?.id ?? null

  if (references.length > 0) {
    await persistReferences(admin, {
      userId: user.id, attemptId, projectId: spaceId, sourceImageId: vistaId, references,
    })
  }

  const failAttempt = async (msg: string) => {
    if (!attemptId) return
    await admin
      .from('image_edit_attempts')
      .update({ status: 'failed', error_message: msg.slice(0, 500), completed_at: new Date().toISOString() })
      .eq('id', attemptId)
  }

  let debited = false
  let newVistaId: string | null = null
  try {
    // ── 4) Débito atômico (pula se grátis) ──
    if (routing.costNodes > 0) {
      const { error: debitErr } = await admin.rpc('consume_workspace_nodes', {
        user_id_input: user.id,
        amount:        routing.costNodes,
      })
      if (debitErr) {
        if (debitErr.code === 'P0001') {
          await failAttempt('insufficient_balance')
          return NextResponse.json(
            { error: 'insufficient_balance', required: routing.costNodes, message: 'Saldo insuficiente' },
            { status: 402 },
          )
        }
        throw new Error('debit_failed: ' + debitErr.message)
      }
      debited = true
    }

    // ── 5) Pré-insere a nova vista (processing) ──
    // engine='flux-fill' mantém o CHECK de vistas.engine (o endpoint real fica
    // logado em image_edit_attempts.endpoint).
    const chainRoot = vista.edit_chain_root_id ?? vista.id
    const { data: row, error: insErr } = await admin
      .from('vistas')
      .insert({
        space_id:               space.id,
        user_id:                user.id,
        status:                 'processing',
        engine:                 'flux-fill',
        quality,
        axis:                   vista.axis,
        axis_value:             vista.axis_value,
        axis_label:             vista.axis_label,
        nodes_cost:             routing.costNodes,
        parent_vista_id:        vista.id,
        is_edited:              true,
        edit_prompt:            prompt,
        edit_mask_url:          maskUrl,
        edit_chain_root_id:     chainRoot,
        edit_mask_coverage:     maskCoverage,
        generated_by_spacenode: true,
        source_tool:            tool,
      })
      .select('id')
      .single()
    if (insErr || !row) throw new Error('insert_failed: ' + (insErr?.message ?? '?'))
    newVistaId = row.id as string

    // ── 6) Executa (crop quando aplicável) + re-hospeda no Supabase ──
    const run = await runEdit({
      sourceUrl:    vista.image_url,
      maskUrl,
      prompt:       finalPrompt,
      quality,
      referenceUrl: mode === 'replace' ? referenceUrl : undefined,
      references:   references.map(r => ({ url: r.url, role: r.role })),
      routing,
      usesMask,
      softEdges:    isBlendTool(tool),
      engine,
      uploadResult: (buf, kind) => uploadEditAsset(admin, user.id, buf, kind),
    })

    // ── Quality gate: drift fora da máscara acima do limite → rejeita ──
    // Não cobra, não consome cota grátis, não conta como edição. A vista nova
    // vira 'failed'; a tentativa, 'rejected_quality_gate'. Blend usa limite tolerante.
    const gateLimit = isBlendTool(tool) ? BLEND_OUT_OF_MASK_GATE : OUT_OF_MASK_GATE
    if (run.outOfMaskDelta != null && run.outOfMaskDelta > gateLimit) {
      if (debited) {
        try { await admin.rpc('refund_workspace_nodes', { user_id_input: user.id, amount: routing.costNodes }) }
        catch (refundErr) { console.error('[vista.edit] gate refund failed:', refundErr) }
      }
      if (newVistaId) {
        await admin.from('vistas').update({
          status:        'failed',
          error_message: `quality_gate: out_of_mask_delta=${(run.outOfMaskDelta * 100).toFixed(1)}%`,
        }).eq('id', newVistaId)
      }
      if (attemptId) {
        await admin.from('image_edit_attempts').update({
          status:          'rejected_quality_gate',
          used_crop:       run.usedCrop,
          crop_megapixels: run.cropMegapixels,
          error_message:   `quality_gate: out_of_mask_delta=${(run.outOfMaskDelta * 100).toFixed(1)}%`,
          completed_at:    new Date().toISOString(),
        }).eq('id', attemptId)
      }
      const { data: balGate } = await admin
        .from('user_node_balance')
        .select('plan_balance, lumen_balance, total_balance')
        .eq('user_id', user.id)
        .single()
      return NextResponse.json({
        rejected:          true,
        reason:            'quality_gate',
        message:           'A edição não preservou bem a imagem. Tente ajustar a máscara ou usar o modo avançado.',
        result_url:        run.resultUrl,
        out_of_mask_delta: run.outOfMaskDelta,
        balance_after:     balGate ?? null,
      })
    }

    // ── 7) Fecha vista + tentativa + contadores ──
    await admin
      .from('vistas')
      .update({
        image_url:    run.resultUrl,
        prompt:       finalPrompt,
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', newVistaId)

    if (attemptId) {
      await admin
        .from('image_edit_attempts')
        .update({
          status:          'completed',
          result_image_id: newVistaId,
          used_crop:       run.usedCrop,
          crop_megapixels: run.cropMegapixels,
          completed_at:    new Date().toISOString(),
        })
        .eq('id', attemptId)
    }

    // Correção grátis consumida → marca na vista de ORIGEM.
    if (routing.isFreeFix && ctx.sourceTable && ctx.sourceId) {
      await admin
        .from(ctx.sourceTable)
        .update({ free_fixes_used: ctx.freeFixesUsedForImage + 1 })
        .eq('id', ctx.sourceId)
        .eq('user_id', user.id)
    }

    await admin.rpc('bump_monthly_usage', {
      user_id_input:    user.id,
      edits_delta:      1,
      free_fixes_delta: routing.isFreeFix ? 1 : 0,
      nodes_delta:      routing.costNodes,
    })

    const { data: balAfter } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      vista: {
        id:                 newVistaId,
        space_id:           space.id,
        image_url:          run.resultUrl,
        engine:             'flux-fill',
        quality,
        axis:               vista.axis,
        axis_value:         vista.axis_value,
        axis_label:         vista.axis_label,
        is_edited:          true,
        parent_vista_id:    vista.id,
        edit_chain_root_id: chainRoot,
        edit_prompt:        prompt,
        edit_mask_coverage: maskCoverage,
        nodes_cost:         routing.costNodes,
        status:             'completed',
      },
      // Sem endpoint técnico — só o que a UI mostra.
      routing: {
        cost_nodes:  routing.costNodes,
        is_free_fix: routing.isFreeFix,
        used_crop:   run.usedCrop,
        label:       editButtonLabel(routing),
        explanation: editChargeExplanation(routing),
      },
      balance_after: balAfter ?? null,
    })
  } catch (err) {
    if (debited) {
      try { await admin.rpc('refund_workspace_nodes', { user_id_input: user.id, amount: routing.costNodes }) }
      catch (refundErr) { console.error('[vista.edit] refund failed:', refundErr) }
    }
    if (newVistaId) {
      await admin
        .from('vistas')
        .update({ status: 'failed', error_message: (err as Error).message })
        .eq('id', newVistaId)
    }
    await failAttempt((err as Error).message)
    console.error('[vista.edit] error:', (err as Error).message)
    return NextResponse.json({ error: 'Falha na edição' }, { status: 500 })
  }
}
