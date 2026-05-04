import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { VistaType, DnaOverrides, GenerationMode } from '@/lib/spaces/types'
import { getDefaultDnaOverrides, getModePreset, applyModeUnlocks } from '@/lib/spaces/dna'
import { buildVistaPrompt }  from '@/lib/spaces/buildVistaPrompt'
import { callFalForVista }   from '@/lib/spaces/falAdapter'

// ── POST /api/spaces/[spaceId]/evolve ─────────────────────────────────────────

type Params = { params: Promise<{ spaceId: string }> }

type EvolvableVistaType = Exclude<VistaType, 'mestre'>

const VALID_VISTA_TYPES: EvolvableVistaType[] = [
  'iluminacao', 'material', 'angulo', 'detalhe', 'interior',
]

const EVOLVE_COST_CREDITS = 4

interface EvolveBody {
  parent_render_id: string
  vista_type:       EvolvableVistaType
  generation_mode?: GenerationMode          // default 'coerente'
  dna_overrides?:   DnaOverrides            // from drawer; computed here if absent
  geometry_lock?:   number                  // from drawer; derived from mode if absent
  vista_label?:     string
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
    .select('id, project_dna')
    .eq('id', spaceId)
    .single()
  if (!space) return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })

  // ── 4. Fetch parent render (RLS — verifies ownership + output_url) ──────────
  const { data: parent } = await supabase
    .from('renders')
    .select('id, output_url')
    .eq('id', parent_render_id)
    .single()
  if (!parent) {
    return NextResponse.json({ error: 'Vista pai não encontrada' }, { status: 404 })
  }
  if (!parent.output_url) {
    return NextResponse.json({ error: 'Vista pai sem imagem de saída' }, { status: 422 })
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
  const finalPrompt = buildVistaPrompt({
    dna,
    overrides:    resolvedOverrides,
    vistaType:    vista_type,
    geometryLock: resolvedLock,
  })

  console.log('[evolve] space_id        :', spaceId)
  console.log('[evolve] vista_type      :', vista_type)
  console.log('[evolve] generation_mode :', generation_mode)
  console.log('[evolve] geometry_lock   :', resolvedLock)
  console.log('[evolve] prompt preview  :', finalPrompt.slice(0, 140))

  // ── 7. Pre-insert render with status = 'processing' ────────────────────────
  const admin = createAdminClient()
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
      input_url:        parent.output_url,
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

  // ── 8. Call FAL ─────────────────────────────────────────────────────────────
  try {
    const { outputUrl } = await callFalForVista(parent.output_url, finalPrompt)

    console.log('[evolve] output_url:', outputUrl)

    // ── 9. Mark completed ─────────────────────────────────────────────────────
    await admin
      .from('renders')
      .update({
        output_url:   outputUrl,
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', vistaId)

    // ── 10. Consume credits (non-blocking) ────────────────────────────────────
    admin
      .rpc('consume_credits', { user_id_input: user.id, amount: EVOLVE_COST_CREDITS })
      .then(({ error }) => {
        if (error) console.error('[evolve] consume_credits error:', error)
      })

    return NextResponse.json({
      vista_id:   vistaId,
      status:     'completed',
      output_url: outputUrl,
    })

  } catch (err: unknown) {
    const e = err as { message?: string; isFalTimeout?: boolean }
    console.error('[evolve] FAL error:', e?.message)

    // ── 11. Mark failed ───────────────────────────────────────────────────────
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
