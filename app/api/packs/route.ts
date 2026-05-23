// POST /api/packs — cria pack draft pra um Space.
// Body: { space_id }
// Auto-popula vistas_ordered com até 4 vistas (favoritadas primeiro, depois mais recentes).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { space_id?: string } | null
  if (!body?.space_id) {
    return NextResponse.json({ error: 'space_id obrigatório' }, { status: 400 })
  }

  // Confirma posse do Space
  const { data: space, error: spaceErr } = await supabase
    .from('spaces')
    .select('id, name')
    .eq('id', body.space_id)
    .single()
  if (spaceErr || !space) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }

  // Coleta vistas pra pré-popular: favoritadas primeiro, depois recentes.
  const { data: vistas } = await supabase
    .from('vistas')
    .select('id, is_favorited, created_at')
    .eq('space_id', body.space_id)
    .eq('status', 'completed')
    .order('is_favorited', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(4)

  const orderedIds = (vistas ?? []).map(v => v.id as string)

  const { data: pack, error: packErr } = await supabase
    .from('packs')
    .insert({
      space_id:        body.space_id,
      user_id:         user.id,
      narrative:       'tour',
      vistas_ordered:  orderedIds,
    })
    .select('*')
    .single()

  if (packErr || !pack) {
    console.error('[packs.create] insert failed:', packErr)
    return NextResponse.json({ error: 'Erro ao criar pack' }, { status: 500 })
  }

  return NextResponse.json({ pack }, { status: 201 })
}
