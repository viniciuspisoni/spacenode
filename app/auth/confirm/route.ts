import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { INTENT_COOKIE } from '@/lib/analytics/attribution'
import { isNewUser, postAuthDestination } from '@/lib/analytics/auth-intent'
import { signupAttributionFromMetadata } from '@/lib/analytics/signup-attribution'

// ── Confirmação de cadastro por token_hash ─────────────────────────────────────
//
// O link padrão do Supabase ({{ .ConfirmationURL }}) termina num `code` PKCE,
// que só vira sessão no MESMO navegador onde o cadastro começou (o
// code_verifier mora num cookie de lá). Cadastro feito no navegador interno do
// Instagram/Facebook e confirmado pelo app de e-mail caía em
// /login?error=auth, sem sessão, sem `signup=1` e sem a origem da campanha.
//
// Aqui o template aponta para /auth/confirm?token_hash=…&type=email (ver
// supabase/templates/confirm-signup.html) e o servidor verifica o token
// direto no GoTrue — funciona em qualquer navegador. Destino e origem vêm do
// que o signUp gravou na conta (lib/analytics/signup-attribution.ts); o
// `next` só aceita caminho interno.

const CONFIRM_TYPES: ReadonlySet<string> = new Set<EmailOtpType>(['email', 'signup'])

function cookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null
  const found = header.split('; ').find(c => c.startsWith(`${name}=`))
  return found ? found.slice(name.length + 1) : null
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!tokenHash || !type || !CONFIRM_TYPES.has(type)) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  })
  if (error || !data.user || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Mesma regra dos outros handlers (next > intenção > /app) e o `signup=1`
  // de conta nova — aqui o e-mail acabou de ser confirmado.
  const { url } = postAuthDestination({
    origin,
    next: signupAttributionFromMetadata(data.user.user_metadata).next,
    intentCookie: cookieFromHeader(request.headers.get('cookie'), INTENT_COOKIE),
    newUser: isNewUser(data.user),
  })
  return NextResponse.redirect(url)
}
