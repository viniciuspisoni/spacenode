// POST /api/workspaces/invites/[id]/revoke — owner/admin revoga um convite pendente.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkspace } from '@/lib/workspaces/context'

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const ws = await getActiveWorkspace(supabase, user.id)
  if (!ws || (ws.role !== 'owner' && ws.role !== 'admin')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('workspace_invites')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('workspace_id', ws.workspaceId)   // só convites do próprio workspace
    .eq('status', 'pending')
  if (error) {
    console.error('[invites.revoke]', error)
    return NextResponse.json({ error: 'Falha ao revogar.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
