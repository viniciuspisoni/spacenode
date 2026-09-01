import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { readLoginNextCookie } from '@/lib/auth/login-next-cookie'

// Sem webhook de "usuário criado" — usar a idade da conta como proxy de
// "acabou de se cadastrar" pra disparar a conversão do Google Ads uma única vez.
const NEW_USER_WINDOW_MS = 60_000

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // ?next= quando o allowlist de redirect do Supabase preservou a query;
  // senão, o cookie de curta duração mintado pela página de login.
  const next = safeNextPath(searchParams.get('next') ?? readLoginNextCookie(request.headers.get('cookie')))

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const redirectUrl = new URL(next, origin)
      const isNewUser =
        !!data.user?.created_at &&
        Date.now() - new Date(data.user.created_at).getTime() < NEW_USER_WINDOW_MS
      if (isNewUser) redirectUrl.searchParams.set('signup', '1')
      return NextResponse.redirect(redirectUrl)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
