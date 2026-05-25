// GET    /api/vistas/[vistaId]  → detalhe (com vista origem se houver)
// DELETE /api/vistas/[vistaId]  → soft delete (status='archived' não existe;
//                                  removemos do banco — packs preservam URLs externas)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ vistaId: string }> },
) {
  const { vistaId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('vistas')
    .select('*')
    .eq('id', vistaId)
    .single()
  if (error || !data) {
    return NextResponse.json({ error: 'Vista não encontrada' }, { status: 404 })
  }
  return NextResponse.json({ vista: data })
}

export async function DELETE(
  _req:    NextRequest,
  context: { params: Promise<{ vistaId: string }> },
) {
  const { vistaId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { error } = await supabase.from('vistas').delete().eq('id', vistaId)
  if (error) {
    console.error('[vistas.delete] failed:', error)
    return NextResponse.json({ error: 'Erro ao remover vista' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
