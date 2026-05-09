// POST /api/vistas/[vistaId]/favorite — toggle (idempotent)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req:    NextRequest,
  context: { params: Promise<{ vistaId: string }> },
) {
  const { vistaId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: row } = await supabase
    .from('vistas')
    .select('id, is_favorited')
    .eq('id', vistaId)
    .single()
  if (!row) return NextResponse.json({ error: 'Vista não encontrada' }, { status: 404 })

  const next = !(row.is_favorited as boolean)
  const { error } = await supabase
    .from('vistas')
    .update({ is_favorited: next })
    .eq('id', vistaId)

  if (error) {
    console.error('[favorite] update failed:', error)
    return NextResponse.json({ error: 'Erro ao favoritar' }, { status: 500 })
  }
  return NextResponse.json({ is_favorited: next })
}
