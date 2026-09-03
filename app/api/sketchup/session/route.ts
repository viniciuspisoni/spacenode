import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'

export async function GET(req: NextRequest) {
  const { user, source } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [balance, theme] = await Promise.all([
    getPayerBalance(admin, user.id),
    readThemePreference(admin, user.id),
  ])

  return NextResponse.json({
    ok: true,
    auth: source,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    balance,
    // Preferência de tema da conta (a mesma do app web). O plugin usa como
    // segundo degrau do "Automático": escolha local → conta → SO → escuro.
    theme,
  })
}

type ThemePreference = 'system' | 'light' | 'dark'

async function readThemePreference(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<ThemePreference | null> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('theme_preference')
      .eq('id', userId)
      .maybeSingle()
    const v = data?.theme_preference
    return v === 'light' || v === 'dark' || v === 'system' ? v : null
  } catch {
    // Coluna ausente ou perfil sem linha: o plugin cai pro SO — nunca falha
    // a sessão por causa de tema.
    return null
  }
}
