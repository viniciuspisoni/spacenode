import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { readLoginNextCookie } from '@/lib/auth/login-next-cookie'
import { INTENT_COOKIE } from '@/lib/analytics/attribution'
import { isNewUser, postAuthDestination } from '@/lib/analytics/auth-intent'

function cookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null
  const found = header.split('; ').find(c => c.startsWith(`${name}=`))
  return found ? found.slice(name.length + 1) : null
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const cookieHeader = request.headers.get('cookie')
  // ?next= quando o allowlist de redirect do Supabase preservou a query;
  // senão, o cookie de curta duração mintado pela página de login.
  const next = searchParams.get('next') ?? readLoginNextCookie(cookieHeader)

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Regra única de destino (next > intenção de plano > /app) e o
      // `signup=1` de conta nova — ver lib/analytics/auth-intent.ts.
      const { url } = postAuthDestination({
        origin,
        next,
        intentCookie: cookieFromHeader(cookieHeader, INTENT_COOKIE),
        newUser: isNewUser(data.user),
      })
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
