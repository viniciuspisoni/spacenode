// GET    /api/spaces/[spaceId]  → detalhe (com vistas count via view)
// DELETE /api/spaces/[spaceId]  → arquivar (soft) — status='archived'
//
// Hard delete não é exposto: queremos preservar audit trail e evitar
// estragar packs já compartilhados.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .eq('id', spaceId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ space: data })
}

export async function DELETE(
  _req:    NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { error } = await supabase
    .from('spaces')
    .update({ status: 'archived' })
    .eq('id', spaceId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[spaces.archive] update failed:', error)
    return NextResponse.json({ error: 'Erro ao arquivar Space' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
