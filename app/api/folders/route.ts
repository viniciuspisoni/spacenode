import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/folders — cria uma pasta leve do Histórico
//   { name: string, parent_id?: string }
//
// Hierarquia limitada a 2 níveis (pasta > subpasta): parent_id só é aceito
// se apontar pra uma pasta de TOPO (parent_id null) do próprio usuário.
// Uma subpasta nunca pode virar pai de outra subpasta.

const MAX_NAME_LEN = 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { name?: unknown; parent_id?: unknown }
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

  let parentId: string | null = null
  if (body.parent_id != null) {
    if (typeof body.parent_id !== 'string' || !UUID_RE.test(body.parent_id)) {
      return NextResponse.json({ error: 'parent_id inválido' }, { status: 400 })
    }
    const { data: parent } = await supabase
      .from('render_folders')
      .select('id, parent_id')
      .eq('id', body.parent_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json({ error: 'Pasta-mãe não encontrada' }, { status: 404 })
    }
    if (parent.parent_id) {
      return NextResponse.json({ error: 'Subpastas não podem conter outras subpastas' }, { status: 400 })
    }
    parentId = parent.id
  }

  const { data, error } = await supabase
    .from('render_folders')
    .insert({ user_id: user.id, name, parent_id: parentId })
    .select('id, name, parent_id, created_at')
    .single()

  if (error || !data) {
    console.error('[POST /api/folders]', error)
    return NextResponse.json({ error: 'Falha ao criar pasta' }, { status: 500 })
  }

  return NextResponse.json({ folder: data }, { status: 201 })
}
