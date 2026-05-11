import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { VistaType, DnaOverrides, GenerationMode } from '@/lib/spaces/types'
import { getDefaultDnaOverrides, getModePreset, applyModeUnlocks } from '@/lib/spaces/dna'
import { buildVistaPrompt }               from '@/lib/spaces/buildVistaPrompt'
import { callFalForVista, uploadToFalStorage } from '@/lib/spaces/falAdapter'
import { SPACES_MAX_UPLOAD_BYTES, SPACES_UPLOAD_SIZE_ERROR } from '@/lib/spaces/upload'

// ── POST /api/spaces/[spaceId]/evolve ─────────────────────────────────────────

type Params = { params: Promise<{ spaceId: string }> }

type EvolvableVistaType = Exclude<VistaType, 'mestre'>

const VALID_VISTA_TYPES: EvolvableVistaType[] = [
  'iluminacao', 'material', 'angulo', 'detalhe', 'interior',
]

const EVOLVE_COST_CREDITS = 4

interface EvolveBody {
  parent_render_id:    string
  vista_type:          EvolvableVistaType
  generation_mode?:    GenerationMode          // default 'coerente'
  dna_overrides?:      DnaOverrides            // from drawer; computed here if absent
  geometry_lock?:      number                  // from drawer; derived from mode if absent
  vista_label?:        string
  input_image_base64?: string                  // optional: user-uploaded draft/wireframe
}

export async function POST(req: NextRequest, { params }: Params) {
  const { spaceId } = await params

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // ── 2. Parse body ───────────────────────────────────────────────────────────
  let body: EvolveBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const {
    parent_render_id,
    vista_type,
    generation_mode = 'coerente',
    dna_overrides,
    geometry_lock,
    vista_label,
    input_image_base64,
  } = body

  if (!parent_render_id || !vista_type) {
    return NextResponse.json(
      { error: 'parent_render_id e vista_type são obrigatórios' },
      { status: 400 },
    )
  }
  if (!VALID_VISTA_TYPES.includes(vista_type)) {
    return NextResponse.json({ error: 'vista_type inválido' }, { status: 400 })
  }
  if (generation_mode !== 'coerente' && generation_mode !== 'explorar') {
    return NextResponse.json({ error: 'generation_mode inválido' }, { status: 400 })
  }

  // ── 3. Fetch Space (RLS — verifies ownership) ───────────────────────────────
  const { data: space } = await supabase
    .from('spaces')
    .select('id, project_dna, anchor_render_id')
    .eq('id', spaceId)
    .single()
  if (!space) return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })

  // ── 4. Fetch parent render (RLS + space ownership) ─────────────────────────
  // Requires space_id match so a render from another Space cannot be used as
  // parent here — prevents cross-space lineage corruption (P0 security fix).
  const { data: parent } = await supabase
    .from('renders')
    .select('id, output_url')
    .eq('id', parent_render_id)
    .eq('space_id', spaceId)
    .single()
  if (!parent) {
    return NextResponse.json(
      { error: 'Parent render does not belong to this Space.' },
      { status: 403 },
    )
  }

  // ── 5-a. Resolve FAL input URL ──────────────────────────────────────────────
  // When the caller provides input_image_base64 (upload flow), validate the
  // decoded size, upload to fal.storage, and use that URL as FAL input.
  // Otherwise fall back to parent.output_url (standard evolve flow).
  const fromUpload = !!input_image_base64
  let vistaInputUrl: string

  if (fromUpload) {
    const raw    = input_image_base64!.includes(',')
      ? input_image_base64!.split(',')[1]
      : input_image_base64!
    const buffer = Buffer.from(raw, 'base64')
    if (buffer.length > SPACES_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: SPACES_UPLOAD_SIZE_ERROR }, { status: 413 })
    }
    try {
      vistaInputUrl = await uploadToFalStorage(input_image_base64!)
    } catch (err) {
      console.error('[evolve] upload nova vista:', err)
      return NextResponse.json({ error: 'Falha no upload da imagem' }, { status: 500 })
    }
  } else {
    if (!parent.output_url) {
      return NextResponse.json({ error: 'Vista pai sem imagem de saída' }, { status: 422 })
    }
    vistaInputUrl = parent.output_url
  }

  // ── 4-b. Fetch Vista Mestre URL (visual DNA anchor) ────────────────────────
  // The Vista Mestre image is included as Image 1 in every FAL call so the
  // model can extract project materials visually — independent of whether
  // project_dna text fields are populated. Skipped when the parent IS the
  // mestre (inputUrl == mestreUrl → callFalForVista de-duplicates automatically).
  let mestreUrl: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anchorId = (space as any).anchor_render_id as string | null
  if (anchorId) {
    const { data: anchor } = await supabase
      .from('renders')
      .select('output_url')
      .eq('id', anchorId)
      .eq('space_id', spaceId)
      .single()
    if (anchor?.output_url) mestreUrl = anchor.output_url
  }

  // ── 5. Resolve overrides and geometry lock ──────────────────────────────────
  // If drawer sends overrides, trust them (user customised).
  // Otherwise derive from vista_type defaults then apply mode auto-unlocks.
  const resolvedOverrides: DnaOverrides =
    dna_overrides ??
    applyModeUnlocks(getDefaultDnaOverrides(vista_type), generation_mode)

  const resolvedLock: number =
    geometry_lock ?? getModePreset(generation_mode).geometryLock

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dna = space.project_dna as any

  // ── 6. Build prompt ─────────────────────────────────────────────────────────
  // mestreRef=true when the Vista Mestre will be sent as Image 1 alongside the
  // parent/input (Image 2). The prompt then includes the multi-image context
  // block so the model extracts materials from Image 1 and geometry from Image 2.
  const mestreRef = !!(mestreUrl && mestreUrl !== vistaInputUrl)
  const finalPrompt = buildVistaPrompt({
    dna,
    overrides:    resolvedOverrides,
    vistaType:    vista_type,
    geometryLock: resolvedLock,
    fromUpload,
    mestreRef,
  })

  console.log('[evolve] space_id        :', spaceId)
  console.log('[evolve] vista_type      :', vista_type)
  console.log('[evolve] generation_mode :', generation_mode)
  console.log('[evolve] geometry_lock   :', resolvedLock)
  console.log('[evolve] mestre_ref      :', mestreRef, mestreUrl ? `(${mestreUrl.slice(0, 60)}…)` : '(none)')
  console.log('[evolve] prompt preview  :', finalPrompt.slice(0, 160))

  // ── 7. Consume credits BEFORE calling FAL ──────────────────────────────────
  // Awaited synchronously so FAL is never reached when balance is insufficient.
  // consume_credits validates auth.uid() inside the SECURITY DEFINER function,
  // so it MUST be called with the user client (supabase) — not the admin client —
  // to ensure the caller's JWT is present in the session and auth.uid() resolves.
  // NOTE: if FAL fails after this point, credits are NOT refunded in v1.
  //       Refund logic is deferred to post-beta (tracked as P1 tech debt).
  const { data: credited, error: creditError } = await supabase
    .rpc('consume_credits', { user_id_input: user.id, amount: EVOLVE_COST_CREDITS })

  const admin = createAdminClient()

  if (creditError || !credited) {
    console.warn('[evolve] créditos insuficientes ou erro RPC:', creditError?.message)
    return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
  }

  // ── 8. Pre-insert render with status = 'processing' ────────────────────────
  const { data: newRender, error: insertError } = await admin
    .from('renders')
    .insert({
      user_id:          user.id,
      space_id:         spaceId,
      parent_render_id,
      vista_type,
      generation_mode,
      dna_overrides:    resolvedOverrides,
      vista_label:      vista_label ?? null,
      input_url:        vistaInputUrl,
      prompt:           finalPrompt,
      status:           'processing',
      ambient:          vista_type,
      style:            String(dna.style ?? '').slice(0, 255),
      lighting:         String(dna.lighting ?? '').slice(0, 255),
      cost_credits:     EVOLVE_COST_CREDITS,
    })
    .select('id')
    .single()

  if (insertError || !newRender) {
    console.error('[evolve] insert error:', insertError)
    return NextResponse.json({ error: 'Erro ao criar Vista' }, { status: 500 })
  }

  const vistaId = newRender.id

  // ── 9. Call FAL ─────────────────────────────────────────────────────────────
  try {
    const { outputUrl } = await callFalForVista(vistaInputUrl, finalPrompt, mestreUrl)

    console.log('[evolve] output_url:', outputUrl)

    // ── 10. Mark completed ────────────────────────────────────────────────────
    await admin
      .from('renders')
      .update({
        output_url:   outputUrl,
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', vistaId)

    return NextResponse.json({
      vista_id:   vistaId,
      status:     'completed',
      output_url: outputUrl,
    })

  } catch (err: unknown) {
    const e = err as { message?: string; isFalTimeout?: boolean }
    console.error('[evolve] FAL error:', e?.message)

    // ── 11. Mark failed (credits already consumed — refund deferred to post-beta) ─
    await admin
      .from('renders')
      .update({
        status:        'failed',
        error_message: e?.isFalTimeout
          ? 'Timeout: FAL não respondeu em 90s'
          : (e?.message ?? 'Erro desconhecido'),
      })
      .eq('id', vistaId)

    return NextResponse.json(
      {
        error: e?.isFalTimeout
          ? 'Tempo limite excedido. Tente novamente.'
          : 'Erro ao gerar Vista. Tente novamente.',
        vista_id: vistaId,
      },
      { status: 500 },
    )
  }
}
