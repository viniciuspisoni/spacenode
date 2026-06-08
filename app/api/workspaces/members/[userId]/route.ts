// POST /api/workspaces/members/[userId] — owner/admin gerencia um membro.
//   body { action: 'set_role', role: 'admin'|'member' }  → muda o papel
//   body { action: 'remove' }                            → remove (devolve ao pessoal)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkspace } from '@/lib/workspaces/context'

export async function POST(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const ws = await getActiveWorkspace(supabase, user.id)
  if (!ws || (ws.role !== 'owner' && ws.role !== 'admin')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const admin = createAdminClient()

  if (body.action === 'remove') {
    const { error } = await admin.rpc('remove_workspace_member', { p_workspace: ws.workspaceId, p_user: userId })
    if (error) {
      const msg = (error.message ?? '').includes('cannot_remove_owner')
        ? 'O dono do workspace não pode ser removido.'
        : 'Falha ao remover o membro.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'set_role') {
    const role = body.role === 'admin' ? 'admin' : 'member'
    const { error } = await admin
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', ws.workspaceId)
      .eq('user_id', userId)
      .neq('role', 'owner')   // nunca altera o papel do dono
    if (error) {
      console.error('[members.set_role]', error)
      return NextResponse.json({ error: 'Falha ao atualizar o papel.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
}
