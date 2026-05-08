import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/folders — cria uma pasta leve do Histórico
//   { name: string }

const MAX_NAME_LEN = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const raw = typeof body.name === 'string' ? body.name.trim() : ''
  if (!raw) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }
  const name = raw.slice(0, MAX_NAME_LEN)

  const { data, error } = await supabase
    .from('render_folders')
    .insert({ user_id: user.id, name })
    .select('id, name, created_at')
    .single()

  if (error || !data) {
    console.error('[POST /api/folders]', error)
    return NextResponse.json({ error: 'Falha ao criar pasta' }, { status: 500 })
  }

  return NextResponse.json({ folder: data }, { status: 201 })
}
