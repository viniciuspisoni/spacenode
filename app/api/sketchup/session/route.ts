import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'

export async function GET(req: NextRequest) {
  const { user, source } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const balance = await getPayerBalance(admin, user.id)

  return NextResponse.json({
    ok: true,
    auth: source,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    balance,
  })
}
