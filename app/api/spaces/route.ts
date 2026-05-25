// POST /api/spaces  → cria Space em status 'draft'
// GET  /api/spaces  → lista do usuário (via spaces_with_counts)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isEngineId } from '@/lib/engines'
import { isSpaceCategory } from '@/lib/spaces/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { name?: string; category?: string; engine?: string }
    | null

  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const name = (body.name ?? '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Nome do projeto é obrigatório' }, { status: 400 })
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Nome do projeto muito longo (máx. 80 caracteres)' }, { status: 400 })
  }
  if (!isSpaceCategory(body.category)) {
    return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 })
  }
  if (!isEngineId(body.engine)) {
    return NextResponse.json({ error: 'Motor inválido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('spaces')
    .insert({
      user_id:  user.id,
      name,
      category: body.category,
      engine:   body.engine,
      status:   'draft',
    })
    .select('id, name, category, engine, status, created_at')
    .single()

  if (error || !data) {
    console.error('[spaces.create] insert failed:', error)
    return NextResponse.json({ error: 'Erro ao criar Space' }, { status: 500 })
  }

  return NextResponse.json({ space: data }, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[spaces.list] select failed:', error)
    return NextResponse.json({ error: 'Erro ao listar Spaces' }, { status: 500 })
  }

  return NextResponse.json({ spaces: data ?? [] })
}
