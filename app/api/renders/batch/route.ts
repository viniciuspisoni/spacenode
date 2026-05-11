import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Operações em lote sobre renders. RLS em `renders` cobre só SELECT/INSERT —
// para UPDATE/DELETE usamos service role e filtramos por user_id por defesa.
//
// POST /api/renders/batch
//   { ids: string[], action: 'delete' }
//   { ids: string[], action: 'move',   folder_id: string | null }

interface BatchBody {
  ids?: unknown
  action?: unknown
  folder_id?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: BatchBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { ids, action, folder_id } = body

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'ids inválidos' }, { status: 400 })
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: 'Máximo de 200 itens por operação' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (action === 'delete') {
    const { error, count } = await admin
      .from('renders')
      .delete({ count: 'exact' })
      .in('id', ids as string[])
      .eq('user_id', user.id)

    if (error) {
      console.error('[POST /api/renders/batch] delete:', error)
      return NextResponse.json({ error: 'Falha ao excluir' }, { status: 500 })
    }
    return NextResponse.json({ count: count ?? 0 })
  }

  if (action === 'move') {
    if (folder_id !== null && typeof folder_id !== 'string') {
      return NextResponse.json({ error: 'folder_id inválido' }, { status: 400 })
    }

    if (typeof folder_id === 'string') {
      const { data: folder, error: folderErr } = await admin
        .from('render_folders')
        .select('id')
        .eq('id', folder_id)
        .eq('user_id', user.id)
        .single()
      if (folderErr || !folder) {
        return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
      }
    }

    const { error, count } = await admin
      .from('renders')
      .update({ folder_id }, { count: 'exact' })
      .in('id', ids as string[])
      .eq('user_id', user.id)

    if (error) {
      console.error('[POST /api/renders/batch] move:', error)
      return NextResponse.json({ error: 'Falha ao mover' }, { status: 500 })
    }
    return NextResponse.json({ count: count ?? 0 })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
