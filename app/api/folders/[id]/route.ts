import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// DELETE /api/folders/[id] — exclui pasta. Renders ficam soltos
// (FK em renders.folder_id é ON DELETE SET NULL).

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // RLS garante que só apaga as próprias pastas — filtro extra por defesa.
  const { error } = await supabase
    .from('render_folders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[DELETE /api/folders/:id]', error)
    return NextResponse.json({ error: 'Falha ao excluir pasta' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
