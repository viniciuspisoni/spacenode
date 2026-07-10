// POST /api/spaces/[spaceId]/promote-vista-mestre
//
// Promove uma vista do Space a Vista Mestre: vista_mestre_url + dna do Space
// passam a apontar pra vista escolhida. Pré-requisito: a vista precisa ter DNA
// próprio extraído (multi-DNA, /api/vistas/[id]/extract-dna) — a promoção em
// si é GRÁTIS (o DNA já foi pago na extração).
//
// A mestre anterior nunca é perdida: snapshot completo (url/dna/origem) vai
// pro vista_mestre_history (append-only). source_render_id/source_metadata são
// limpos — descreviam a origem da mestre antiga (badge "origem: Renderizar" e
// ground truth de re-extração deixam de valer pra nova mestre).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signRow } from '@/lib/storage/signed'
import type { Space, Vista, VistaMestreHistoryEntry } from '@/lib/spaces/types'

interface PromoteBody {
  vista_id?: unknown
}

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as PromoteBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const vistaId = typeof body.vista_id === 'string' ? body.vista_id : null
  if (!vistaId) {
    return NextResponse.json({ error: 'vista_id é obrigatório' }, { status: 400 })
  }

  // Carrega Space + Vista (RLS valida posse)
  const [spaceRes, vistaRes] = await Promise.all([
    supabase.from('spaces').select('*').eq('id', spaceId).single(),
    supabase.from('vistas').select('id, space_id, status, image_url, dna, dna_extracted_at').eq('id', vistaId).single(),
  ])
  if (spaceRes.error || !spaceRes.data) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }
  if (vistaRes.error || !vistaRes.data) {
    return NextResponse.json({ error: 'Vista não encontrada' }, { status: 404 })
  }
  const space = spaceRes.data as Space
  const vista = vistaRes.data as Pick<Vista, 'id' | 'space_id' | 'status' | 'image_url' | 'dna' | 'dna_extracted_at'>

  if (vista.space_id !== space.id) {
    return NextResponse.json({ error: 'Vista não pertence ao Space' }, { status: 400 })
  }
  if (space.status === 'archived' || space.status === 'dna_extracting' || space.status === 'draft') {
    return NextResponse.json({ error: 'Space não permite trocar a Vista Mestre agora' }, { status: 409 })
  }
  if (vista.status !== 'completed' || !vista.image_url) {
    return NextResponse.json({ error: 'Vista não está pronta' }, { status: 409 })
  }
  if (!vista.dna) {
    return NextResponse.json(
      {
        error:   'reference_dna_required',
        message: 'Extraia o DNA desta vista antes de promovê-la a Vista Mestre.',
      },
      { status: 409 },
    )
  }
  if (space.vista_mestre_vista_id === vista.id) {
    return NextResponse.json({ error: 'Esta vista já é a Vista Mestre' }, { status: 409 })
  }

  // Snapshot da mestre atual → histórico (append-only, nunca sobrescreve).
  const history: VistaMestreHistoryEntry[] = Array.isArray(space.vista_mestre_history)
    ? space.vista_mestre_history
    : []
  const entry: VistaMestreHistoryEntry = {
    url:                   space.vista_mestre_url,
    dna:                   space.dna,
    dna_extracted_at:      space.dna_extracted_at,
    source_render_id:      space.source_render_id,
    source_metadata:       space.source_metadata,
    vista_mestre_vista_id: space.vista_mestre_vista_id ?? null,
    replaced_at:           new Date().toISOString(),
    replaced_by_vista_id:  vista.id,
  }

  const { data: updated, error: updErr } = await supabase
    .from('spaces')
    .update({
      vista_mestre_url:      vista.image_url,
      dna:                   vista.dna,
      dna_extracted_at:      vista.dna_extracted_at ?? new Date().toISOString(),
      source_render_id:      null,
      source_metadata:       null,
      vista_mestre_vista_id: vista.id,
      vista_mestre_history:  [...history, entry],
    })
    .eq('id', spaceId)
    .select('id, name, status, vista_mestre_url, vista_mestre_vista_id, dna_extracted_at')
    .single()

  if (updErr || !updated) {
    console.error('[spaces.promote-vista-mestre] update failed:', updErr)
    return NextResponse.json({ error: 'Erro ao trocar a Vista Mestre' }, { status: 500 })
  }

  const signedSpace = await signRow(createAdminClient(), updated, ['vista_mestre_url'])
  return NextResponse.json({ space: signedSpace })
}
