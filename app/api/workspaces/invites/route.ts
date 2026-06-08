// POST /api/workspaces/invites — owner/admin gera um convite (entrega por LINK).
//
// Não envia email (sem provedor): retorna a URL do convite para o dono
// compartilhar manualmente. Só o email convidado consegue aceitar.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkspace } from '@/lib/workspaces/context'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const ws = await getActiveWorkspace(supabase, user.id)
  if (!ws) return NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 })
  if (ws.role !== 'owner' && ws.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas o dono ou um admin pode convidar.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const email = String(body.email ?? '').trim().toLowerCase()
  const role  = body.role === 'admin' ? 'admin' : 'member'
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Já é membro ativo deste workspace?
  const { data: prof } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (prof) {
    const { data: member } = await admin
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', ws.workspaceId)
      .eq('user_id', prof.id)
      .eq('status', 'active')
      .maybeSingle()
    if (member) return NextResponse.json({ error: 'Essa pessoa já está na equipe.' }, { status: 409 })
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const { data: invite, error } = await admin
    .from('workspace_invites')
    .insert({ workspace_id: ws.workspaceId, email, role, token, invited_by: user.id })
    .select('id, email, role, expires_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe um convite pendente para esse email.' }, { status: 409 })
    }
    console.error('[invites.create]', error)
    return NextResponse.json({ error: 'Falha ao criar o convite.' }, { status: 500 })
  }

  const url = `${req.nextUrl.origin}/app/equipe/convite/${token}`
  return NextResponse.json({ invite, url })
}
