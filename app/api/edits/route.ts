// POST /api/edits  (modo standalone)
// GET  /api/edits  (lista pro histórico)
//
// Standalone: usuário sobe imagem qualquer (ou importa do histórico),
// aplica máscara + prompt, motor Flux Fill gera edit. Resultado persiste
// na tabela `edits` (não cria vista; pra criar vista, usar modo embebido).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isQuality, isEditSourceType, type Quality } from '@/lib/spaces/types'
import { getEditCost } from '@/lib/spaces/edit-economy'
import { selectEngine, callWithTimeoutRetry, type EditMode } from '@/lib/spaces/engines'

const VALID_MODES: EditMode[] = ['remove', 'texture', 'replace', 'add']
function isEditMode(v: unknown): v is EditMode {
  return typeof v === 'string' && (VALID_MODES as string[]).includes(v)
}

// Mask-constraint prompt wrapper. Applied for modes that consume the prompt
// (texture, replace, add). The `remove` mode ignores the prompt entirely
// (object-removal model doesn't use one), so we don't wrap it.
const STANDALONE_PROMPT = (userPrompt: string, _quality: Quality) => [
  'Edit only the masked area of this image. Do not modify any pixels outside the mask.',
  '',
  `USER REQUEST: ${userPrompt}`,
  '',
  'Maintain visual coherence with the rest of the image. Match lighting, perspective, scale, and material rendering style of unmasked areas.',
  '',
  'IMPORTANT: do not modify anything outside the masked area. The output must be pixel-identical to the input outside the mask boundaries.',
  '',
  'Output: photorealistic edit.',
].join('\n')

interface EditBody {
  source_image_url?:    unknown
  mask_url?:            unknown
  prompt?:              unknown
  quality?:             unknown
  source_type?:         unknown
  source_id?:           unknown
  mask_coverage?:       unknown
  /** New (Phase C): intentional edit mode picked from the UI tabs. */
  mode?:                unknown
  /** New (Phase C): optional reference image URL for 'replace' mode. */
  reference_image_url?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as EditBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const sourceUrl    = typeof body.source_image_url === 'string' ? body.source_image_url : null
  const maskUrl      = typeof body.mask_url === 'string' ? body.mask_url : null
  const prompt       = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const referenceUrl = typeof body.reference_image_url === 'string' ? body.reference_image_url : undefined

  // Mode defaults to 'texture' to preserve legacy clients that don't send it.
  const mode: EditMode = isEditMode(body.mode) ? body.mode : 'texture'

  if (!sourceUrl || !maskUrl) {
    return NextResponse.json({ error: 'source_image_url e mask_url obrigatórios' }, { status: 400 })
  }
  // 'remove' doesn't need a prompt — the model fills with surrounding context.
  // Every other mode requires the user to describe what they want.
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
  const quality:      Quality = body.quality
  const sourceType            = body.source_type
  const sourceId              = typeof body.source_id === 'string' ? body.source_id : null
  const maskCoverage          = typeof body.mask_coverage === 'number'
    ? Math.max(0, Math.min(1, body.mask_coverage))
    : null

  const cost  = getEditCost(quality)
  const admin = createAdminClient()

  // Pré-checagem (a RPC já valida atomicamente, mas mostramos erro estruturado)
  const { data: bal } = await admin
    .from('user_node_balance')
    .select('total_balance')
    .eq('user_id', user.id)
    .single()
  if ((bal?.total_balance ?? 0) < cost) {
    return NextResponse.json(
      {
        error:    'insufficient_balance',
        available: bal?.total_balance ?? 0,
        required:  cost,
        message:   `Saldo insuficiente. Necessários ${cost} nodes.`,
      },
      { status: 402 },
    )
  }

  let debited = false
  try {
    // Débito atômico
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

    // Route to the right engine for the picked mode (Phase C). 'remove' uses
    // the specialized object-removal model and ignores the prompt; the other
    // modes use Flux Pro Fill / Flux dev inpaint with the mask-constraint
    // wrapper. The router decision is invisible to the user — they only see
    // the tab they picked.
    const engine    = selectEngine(mode)
    const finalPrompt = mode === 'remove' ? '' : STANDALONE_PROMPT(prompt, quality)
    // callWithTimeoutRetry retries once on RetouchTimeoutError (cold start).
    // Other errors propagate immediately.
    const out = await callWithTimeoutRetry(engine, {
      imageUrl:     sourceUrl,
      maskUrl,
      prompt:       finalPrompt,
      referenceUrl: mode === 'replace' ? referenceUrl : undefined,
      quality,
    })

    // Persistir. We log the actual FAL endpoint that ran (the `edits` table
    // doesn't constrain `engine`, so this is free-form telemetry).
    const { data: row, error: insErr } = await admin
      .from('edits')
      .insert({
        user_id:           user.id,
        source_image_url:  sourceUrl,
        result_image_url:  out.imageUrl,
        mask_url:          maskUrl,
        prompt,
        quality,
        nodes_cost:        cost,
        engine:            out.endpoint,
        source_type:       sourceType,
        source_id:         sourceId,
        mask_coverage:     maskCoverage,
      })
      .select('*')
      .single()
    if (insErr || !row) {
      console.error('[edits] persistence failed:', insErr)
    }

    const { data: balAfter } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      edit:          row ?? null,
      result_url:    out.imageUrl,
      balance_after: balAfter ?? null,
    })
  } catch (err) {
    if (debited) {
      try { await admin.rpc('refund_nodes', { user_id_input: user.id, amount: cost }) }
      catch (refundErr) { console.error('[edits] refund failed:', refundErr) }
    }
    console.error('[edits] error:', (err as Error).message)
    return NextResponse.json({ error: 'Falha na edição' }, { status: 500 })
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('edits')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) {
    return NextResponse.json({ error: 'Erro ao listar edições' }, { status: 500 })
  }
  return NextResponse.json({ edits: data ?? [] })
}
