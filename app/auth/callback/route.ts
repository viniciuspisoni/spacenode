import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { INTENT_COOKIE } from '@/lib/analytics/attribution'
import { clearIntentCookieOn, isNewUser, postAuthDestination } from '@/lib/analytics/auth-intent'

// Retorno do OAuth (fallback) e da confirmação por e-mail. O destino pós-auth
// é decidido por lib/analytics/auth-intent: `next` explícito > intenção de
// plano (cookie sn_intent, gravado no CTA "Começar com <plano>") > /app.
// Conta recém-criada ganha ?signup=1 — gatilho do ping de conversão do
// Google Ads (components/SignupConversionPing.tsx).

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const cookieHeader = request.headers.get('cookie') ?? ''
      const intentRaw = cookieHeader
        .split('; ')
        .find(c => c.startsWith(`${INTENT_COOKIE}=`))
        ?.slice(INTENT_COOKIE.length + 1)

      const { url, intent } = postAuthDestination({
        origin,
        next: searchParams.get('next'),
        intentCookie: intentRaw ?? null,
        newUser: isNewUser(data.user),
      })
      const res = NextResponse.redirect(url)
      if (intent) clearIntentCookieOn(res) // intenção é de uso único
      return res
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
