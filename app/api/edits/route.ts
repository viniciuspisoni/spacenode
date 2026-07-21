// POST /api/edits  (modo standalone — Editar)
// GET  /api/edits  (lista pro histórico)
//
// Fluxo v2 (editRouter): NÃO consome nodes antes de calcular rota+custo.
//   1. monta o contexto (origem da imagem, plano, uso mensal);
//   2. routeEdit() decide endpoint + custo + se é correção grátis;
//   3. registra a tentativa em image_edit_attempts (status 'processing');
//   4. consome nodes (pula se grátis);
//   5. runEdit() executa (crop por máscara quando aplicável) e re-hospeda o
//      resultado no Supabase, preservando a imagem original;
//   6. persiste o `edit`, fecha a tentativa, incrementa free_fixes_used da
//      imagem e o uso mensal;
//   7. em falha: refund + tentativa 'failed'.
//
// Premium NUNCA é automático — só quando o usuário liga (body.premium).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { isQuality, isEditSourceType, type Quality } from '@/lib/spaces/types'
import { isEditMode, dispatchEndpoint, type EditMode } from '@/lib/spaces/engines'
import { composeRouterPrompt, isFidelityMode, type FidelityMode } from '@/lib/spaces/edit-prompts'
import {
  routeEdit,
  endpointProvider,
  estimateProviderCostUsd,
  editButtonLabel,
  editChargeExplanation,
} from '@/lib/spaces/edit-router'
import { editToolFromMode } from '@/lib/spaces/edit-router-adapters'
import { isEditIntent, modeFromIntent } from '@/lib/spaces/edit-intents'
import { engineDisplayLabel, editV3DisplayPrompt, editV3QualityLabel } from '@/lib/history/generation-detail'
import {
  buildRoutingContext,
  uploadEditAsset,
  logEditRoute,
  parseReferences,
  persistReferences,
  referenceRoles,
  measureServerMaskCoverage,
  insertAttemptResilient,
  updateAttemptResilient,
  type EditRequestParams,
} from '@/lib/spaces/edit-route-helpers'
import { runGatedEdit } from '@/lib/spaces/edit-gate'
import { MaskImageMismatchError } from '@/lib/spaces/edit-crop'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { signRow, signRows, signStorageUrl } from '@/lib/storage/signed'
import sharp from 'sharp'

// sharp (crop/recompose) exige runtime Node.
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface EditBody {
  source_image_url?:    unknown
  mask_url?:            unknown
  prompt?:              unknown
  quality?:             unknown
  source_type?:         unknown
  source_id?:           unknown
  mask_coverage?:       unknown
  mode?:                unknown
  reference_image_url?: unknown
  fidelity_mode?:       unknown
  /** editRouter v1: usuário ligou o modo premium explicitamente. */
  premium?:             unknown
  /** editRouter v1: megapixels da imagem de origem (informativo p/ crop). */
  image_megapixels?:    unknown
  /** Referências visuais: [{ url, role, source, note? }]. */
  references?:          unknown
  /** Google-first: intenção escolhida na UI (telemetria; deriva o mode se ausente). */
  edit_intent?:         unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as EditBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const sourceUrl    = typeof body.source_image_url === 'string' ? body.source_image_url : null
  let maskUrl        = typeof body.mask_url === 'string' ? body.mask_url : null
  const prompt       = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const referenceUrl = typeof body.reference_image_url === 'string' ? body.reference_image_url : undefined
  const premium      = body.premium === true

  const intent = isEditIntent(body.edit_intent) ? body.edit_intent : null
  const mode: EditMode = isEditMode(body.mode)
    ? body.mode
    : intent ? modeFromIntent(intent) : 'material'
  const fidelity: FidelityMode = isFidelityMode(body.fidelity_mode) ? body.fidelity_mode : 'max'

  if (!sourceUrl) {
    return NextResponse.json({ error: 'source_image_url obrigatório' }, { status: 400 })
  }
  if (mode !== 'remove' && !prompt) {
    return NextResponse.json({ error: 'prompt obrigatório' }, { status: 400 })
  }
  if (!isQuality(body.quality)) {
    return NextResponse.json({ error: 'quality inválida' }, { status: 400 })
  }
  if (!isEditSourceType(body.source_type)) {
    return NextResponse.json({ error: 'source_type inválido' }, { status: 400 })
  }
  if (body.mode !== undefined && !isEditMode(body.mode)) {
    return NextResponse.json({ error: 'mode inválido' }, { status: 400 })
  }
  if (body.fidelity_mode !== undefined && !isFidelityMode(body.fidelity_mode)) {
    return NextResponse.json({ error: 'fidelity_mode inválido' }, { status: 400 })
  }

  const quality:     Quality = body.quality
  const sourceType            = body.source_type
  const sourceId              = typeof body.source_id === 'string' ? body.source_id : null
  const sourceImageId         = sourceId && UUID_RE.test(sourceId) ? sourceId : null
  const maskCoverage          = typeof body.mask_coverage === 'number'
    ? Math.max(0, Math.min(1, body.mask_coverage))
    : null
  const imageMegapixels       = typeof body.image_megapixels === 'number' ? body.image_megapixels : null
  const references            = parseReferences(body.references)

  const admin = createAdminClient()

  // Saldo é da bolsa: pré-check e leituras usam o PAGADOR (dono do workspace),
  // o mesmo que consume_workspace_nodes debita — senão membro é barrado à toa.
  const payerId = (await getPayerId(admin, user.id)) ?? user.id

  // swap_material com referências visuais mas sem máscara pintada → gera máscara
  // branca automática (1×1 px, normalizada pelo pipeline). Assim o nano-banana
  // recebe o formato correto: [source, mask, texture] e usa a textura visualmente.
  if (!maskUrl && mode === 'material' && references.length > 0) {
    try {
      const whitePng = await sharp(Buffer.alloc(1, 255), {
        raw: { width: 1, height: 1, channels: 1 },
      }).png().toBuffer()
      maskUrl = await uploadEditAsset(admin, user.id, whitePng, 'crop-mask')
    } catch { /* não bloqueia — segue sem máscara */ }
  }

  // ── 1) Contexto + rota (sem tocar em saldo) ──
  // Cobertura da máscara medida no SERVIDOR: o valor do cliente é só estimativa
  // de preview — cobrança/cota grátis usam a fração branca real (P1-5).
  const serverCoverage = await measureServerMaskCoverage(maskUrl)
  if (serverCoverage != null && maskCoverage != null && Math.abs(serverCoverage - maskCoverage) > 0.10) {
    console.warn(
      '[edits] mask_coverage divergente: cliente=%s servidor=%s',
      maskCoverage.toFixed(3), serverCoverage.toFixed(3),
    )
  }
  const effectiveCoverage = serverCoverage ?? maskCoverage

  const params: EditRequestParams = {
    mode, prompt, hasMask: !!maskUrl, maskCoverage: effectiveCoverage, quality, fidelity,
    premium, imageMegapixels, sourceType, sourceId, references,
  }
  const ctx     = await buildRoutingContext(admin, user.id, params)
  const routing = routeEdit(ctx.input)
  logEditRoute(routing, ctx.input) // dev/staging only

  const { usesMask } = dispatchEndpoint(routing.endpoint)
  const finalPrompt      = composeRouterPrompt({ userPrompt: prompt, mode, fidelity, usesMask, references })
  const tool             = editToolFromMode(mode)
  const provider         = endpointProvider(routing.endpoint)
  const providerCostUsd  = estimateProviderCostUsd(routing.endpoint, ctx.input.imageMegapixels)

  // ── 2) Pré-checagem de saldo (só se cobra) ──
  if (routing.costNodes > 0) {
    const { data: bal } = await admin
      .from('user_node_balance')
      .select('total_balance')
      .eq('user_id', payerId)
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
  // Insert resiliente: tenta com as colunas novas (migration 20260610000000);
  // schema antigo cai na forma legada — a edição nunca quebra por telemetria.
  const attemptBaseRow = {
    user_id:           user.id,
    source_image_id:   sourceImageId,
    project_id:        null,
    tool,
    prompt,
    endpoint:          routing.endpoint,
    provider,
    cost_nodes:        routing.costNodes,
    provider_cost_usd: providerCostUsd,
    is_free_fix:       routing.isFreeFix,
    has_mask:          !!maskUrl,
    mask_area_ratio:   effectiveCoverage,
    used_crop:         false,
    output_resolution: ctx.input.outputResolution,
    preservation_mode: fidelity,
    reference_count:   references.length,
    reference_roles:   referenceRoles(references),
    status:            'processing',
  }
  const attemptId = await insertAttemptResilient(
    admin,
    { ...attemptBaseRow, edit_intent: intent, quality_mode: premium ? 'premium' : 'quick' },
    attemptBaseRow,
  )

  if (references.length > 0) {
    await persistReferences(admin, {
      userId: user.id, attemptId, projectId: null, sourceImageId, references,
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

    // ── 5) Executa com quality gate AMPLIADO + retry automático grátis ──
    // (drift fora da máscara, no-op dentro da máscara, gate semântico por flag;
    //  reprovou → 1 retry com prompt restritivo, sem novo débito.)
    const gated = await runGatedEdit({
      sourceUrl,
      maskUrl,
      finalPrompt,
      userPrompt:   prompt,
      quality,
      referenceUrl: mode === 'replace' ? referenceUrl : undefined,
      references:   references.map(r => ({ url: r.url, role: r.role })),
      routing,
      tool,
      uploadResult: (buf, kind) => uploadEditAsset(admin, user.id, buf, kind),
    })
    const run = gated.run

    // ── Reprovado mesmo após o retry → estorna, registra o motivo, devolve. ──
    if (gated.rejected) {
      if (debited) {
        await refundNodes(admin, user.id, routing.costNodes, { module: 'edits' })
      }
      const rejectedStatus = gated.rejectionKind === 'no_change'
        ? 'rejected_no_change'
        : 'rejected_quality_gate'
      const rejectBase = {
        status:          'rejected_quality_gate',
        used_crop:       run.usedCrop,
        crop_megapixels: run.cropMegapixels,
        error_message:   (gated.gateReason ?? 'quality_gate').slice(0, 500),
        completed_at:    new Date().toISOString(),
      }
      await updateAttemptResilient(
        admin, attemptId,
        {
          ...rejectBase,
          status:            rejectedStatus,
          gate_reason:       gated.gateReason,
          auto_retry_count:  gated.autoRetryCount,
          in_mask_delta:     run.inMaskDelta,
          out_of_mask_delta: run.outOfMaskDelta,
        },
        rejectBase,
      )
      const { data: balGate } = await admin
        .from('user_node_balance')
        .select('plan_balance, lumen_balance, total_balance')
        .eq('user_id', payerId)
        .single()
      return NextResponse.json({
        rejected:          true,
        reason:            gated.rejectionKind ?? 'quality_gate',
        message:           gated.rejectionKind === 'no_change'
          ? 'A edição não produziu mudança perceptível na área selecionada. Você não foi cobrado — tente reformular o pedido ou usar o modo premium.'
          : 'A edição não preservou bem a imagem, mesmo após uma nova tentativa automática. Você não foi cobrado — ajuste a máscara ou tente o modo premium.',
        result_url:        run.resultUrl,
        out_of_mask_delta: run.outOfMaskDelta,
        auto_retried:      gated.autoRetryCount > 0,
        balance_after:     balGate ?? null,
      })
    }

    // ── 6) Persiste o edit + fecha tentativa + contadores ──
    const { data: row } = await admin
      .from('edits')
      .insert({
        user_id:          user.id,
        source_image_url: sourceUrl,
        result_image_url: run.resultUrl,
        mask_url:         maskUrl,
        prompt,
        quality,
        nodes_cost:       routing.costNodes,
        engine:           run.endpoint,
        fal_request_id:   run.requestId,
        source_type:      sourceType,
        source_id:        sourceImageId,
        mask_coverage:    effectiveCoverage,
      })
      .select('*')
      .single()

    const completeBase = {
      status:          'completed',
      result_image_id: row?.id ?? null,
      endpoint:        gated.usedEndpoint,
      used_crop:       run.usedCrop,
      crop_megapixels: run.cropMegapixels,
      completed_at:    new Date().toISOString(),
    }
    await updateAttemptResilient(
      admin, attemptId,
      {
        ...completeBase,
        auto_retry_count:  gated.autoRetryCount,
        in_mask_delta:     run.inMaskDelta,
        out_of_mask_delta: run.outOfMaskDelta,
      },
      completeBase,
    )

    // Correção grátis consumida → marca na imagem de origem.
    if (routing.isFreeFix && ctx.sourceTable && ctx.sourceId) {
      await admin
        .from(ctx.sourceTable)
        .update({ free_fixes_used: ctx.freeFixesUsedForImage + 1 })
        .eq('id', ctx.sourceId)
        .eq('user_id', user.id)
    }

    // Uso mensal: 1 edit; free fix e nodes conforme a rota.
    await admin.rpc('bump_monthly_usage', {
      user_id_input:    user.id,
      edits_delta:      1,
      free_fixes_delta: routing.isFreeFix ? 1 : 0,
      nodes_delta:      routing.costNodes,
    })

    const { data: balAfter } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', payerId)
      .single()

    const signedEdit = row
      ? await signRow(
          admin,
          { ...row, engine: engineDisplayLabel(row.engine), fal_request_id: undefined },
          ['source_image_url', 'result_image_url', 'mask_url'],
        )
      : null
    return NextResponse.json({
      // Linha redigida: engine sai como label de produto e o request id do
      // provider não viaja (mesma regra do GET e do /api/history/detail).
      // URLs de imagem assinadas (space-mestres vira privado; no-op enquanto público).
      edit: signedEdit,
      result_url: await signStorageUrl(admin, run.resultUrl),
      // Sem endpoint técnico — só o que a UI mostra ao usuário.
      routing: {
        cost_nodes:   routing.costNodes,
        is_free_fix:  routing.isFreeFix,
        used_crop:    run.usedCrop,
        auto_retried: gated.autoRetryCount > 0,
        label:        editButtonLabel(routing),
        explanation:  editChargeExplanation(routing),
      },
      balance_after: balAfter ?? null,
    })
  } catch (err) {
    if (debited) {
      await refundNodes(admin, user.id, routing.costNodes, { module: 'edits' })
    }
    await failAttempt((err as Error).message)
    console.error('[edits] error:', (err as Error).message)
    // Máscara de outra imagem (proporção divergente) → mensagem acionável.
    if (err instanceof MaskImageMismatchError) {
      return NextResponse.json(
        {
          error:   'mask_image_mismatch',
          message: 'A seleção não corresponde à imagem atual. Refaça a seleção sobre esta imagem. Você não foi cobrado.',
        },
        { status: 422 },
      )
    }
    return NextResponse.json({ error: 'Falha na edição' }, { status: 500 })
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Projeção explícita: sem fal_request_id/generation_log. engine guarda o
  // endpoint do provider — sai daqui como label de produto (mesma redação do
  // /api/history/detail). Consumidores: tab Edições do Histórico e os modais
  // de importação (Finalizar/Retocar/EditV2 — usam result_image_url).
  // Defesa em profundidade: filtra explicitamente por user_id em vez de confiar
  // só na RLS da tabela `edits` (cuja DDL/policy não está versionada no repo —
  // CR-3 da auditoria 2026-07-03). Mesmo padrão de renders/list e folders/[id].
  //
  // DUAS fontes: `edits` (editor v1) e `edit_v3_jobs` (Editar V3, editor padrão
  // em produção desde 2026-06-25). Sem a segunda, tudo que o V3 gera fica
  // invisível no Histórico — bug reportado por usuária em 2026-07-17. Jobs
  // rejeitados/falhos ficam de fora: não foram cobrados e o resultado foi
  // descartado.
  const [v1Res, v3Res] = await Promise.all([
    supabase
      .from('edits')
      .select('id, user_id, source_image_url, result_image_url, mask_url, prompt, quality, nodes_cost, engine, source_type, source_id, mask_coverage, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('edit_v3_jobs')
      .select('id, user_id, action_type, source_image_url, result_image_url, mask_url, prompt, instruction, quality_mode, nodes_cost, model, mask_coverage, created_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('result_image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60),
  ])
  if (v1Res.error) {
    return NextResponse.json({ error: 'Erro ao listar edições' }, { status: 500 })
  }
  // A fonte nova não derruba o histórico inteiro (ex.: ambiente sem a tabela).
  if (v3Res.error) console.error('[edits] GET edit_v3_jobs:', v3Res.error.message)

  const v1Rows = (v1Res.data ?? []).map(e => ({ ...e, engine: engineDisplayLabel(e.engine) }))
  // Normaliza o job do V3 pro shape `Edit` que a UI já consome. model nunca
  // viaja cru — vira a mesma label de produto do resto do Histórico.
  const v3Rows = (v3Res.data ?? []).map(j => ({
    id:               j.id,
    user_id:          j.user_id,
    source_image_url: j.source_image_url,
    result_image_url: j.result_image_url,
    mask_url:         j.mask_url,
    prompt:           editV3DisplayPrompt(j),
    quality:          editV3QualityLabel(j.quality_mode),
    nodes_cost:       j.nodes_cost,
    engine:           engineDisplayLabel(j.model),
    source_type:      null,
    source_id:        null,
    mask_coverage:    j.mask_coverage,
    created_at:       j.created_at,
  }))
  // Timestamps ISO do PostgREST (sempre UTC) — ordenação lexicográfica basta.
  const merged = [...v1Rows, ...v3Rows]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 60)

  const edits = await signRows(
    createAdminClient(),
    merged,
    ['source_image_url', 'result_image_url', 'mask_url'],
  )
  return NextResponse.json({ edits })
}
