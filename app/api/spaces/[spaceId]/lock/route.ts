// POST /api/spaces/[spaceId]/lock
//
// Trava o Space — DNA fica imutável a partir daqui. Trocar motor passa a
// exigir re-extração (operação explícita, fora do escopo do Bloco 1).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req:    NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: space, error: fetchErr } = await supabase
    .from('spaces')
    .select('id, status, dna')
    .eq('id', spaceId)
    .single()

  if (fetchErr || !space) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }
  if (space.status !== 'dna_extracted') {
    return NextResponse.json(
      { error: 'Space precisa ter DNA extraído antes de travar' },
      { status: 409 },
    )
  }
  if (!space.dna) {
    return NextResponse.json({ error: 'DNA ausente' }, { status: 409 })
  }

  const { error: updErr } = await supabase
    .from('spaces')
    .update({ status: 'locked', locked_at: new Date().toISOString() })
    .eq('id', spaceId)

  if (updErr) {
    console.error('[lock] update failed:', updErr)
    return NextResponse.json({ error: 'Erro ao travar Space' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
