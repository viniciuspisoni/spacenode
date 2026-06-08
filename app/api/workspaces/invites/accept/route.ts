// POST /api/workspaces/invites/accept — o usuário logado aceita um convite.
//
// O aceite roda na função SECURITY DEFINER accept_workspace_invite, que valida o
// token/email/expiração e move o usuário pro workspace (respeitando 1-ativo-por-
// pessoa). Passamos SEMPRE o user.id da sessão (nunca confiamos no cliente).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ERROR_MAP: Record<string, string> = {
  invite_not_found:      'Convite não encontrado.',
  invite_not_pending:    'Este convite já foi usado ou cancelado.',
  invite_expired:        'Este convite expirou.',
  invite_email_mismatch: 'Este convite é para outro email.',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const token = String(body.token ?? '')
  if (!token) return NextResponse.json({ error: 'Convite inválido.' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('accept_workspace_invite', { p_token: token, p_user: user.id })
  if (error) {
    const key = Object.keys(ERROR_MAP).find((k) => (error.message ?? '').includes(k))
    return NextResponse.json({ error: key ? ERROR_MAP[key] : 'Não foi possível aceitar o convite.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) })
}
