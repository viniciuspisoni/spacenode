import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

// ── Login com Google via GIS (ux_mode: 'redirect') ─────────────────────────────
//
// A página de login renderiza o botão oficial do Google (Google Identity
// Services) apontando login_uri para esta rota. O fluxo inteiro acontece entre
// spacenode.app e accounts.google.com — o domínio *.supabase.co não aparece
// na tela de consentimento. O ID token chega aqui por POST e vira sessão via
// signInWithIdToken (cookies gravados pelo client server-side do @supabase/ssr).

// Prefixo __Host- (exige Secure + Path=/ + sem Domain): impede que um
// subdomínio comprometido plante/sobrescreva o nonce no domínio pai — sem
// nonce forjável, um POST cross-site forjado morre no `if (!nonce)` abaixo.
const NONCE_COOKIE = '__Host-spn-google-nonce'

// O POST do Google é cross-site (accounts.google.com → spacenode.app), então o
// cookie do nonce precisa de SameSite=None para acompanhar a requisição.
const NONCE_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  path: '/',
  maxAge: 60 * 60,
}

// O cookie guarda os últimos nonces crus (JSON array), não só o mais recente:
// cada aba de /login minta o seu, e um slot único faria o botão da aba mais
// antiga falhar sempre (última escrita vence).
const MAX_NONCES = 5

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app'
  return value
}

function readNonces(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')

// Extrai o claim `nonce` do ID token SEM verificar assinatura — a verificação
// real (assinatura, aud, exp e o próprio nonce) é do GoTrue; aqui só precisamos
// descobrir QUAL dos nonces mintados este token referencia.
function unverifiedNonceClaim(idToken: string): string | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    const nonce = (payload as { nonce?: unknown }).nonce
    return typeof nonce === 'string' ? nonce : null
  } catch {
    return null
  }
}

// Mint do nonce: o hash SHA-256 (hex) vai no `nonce` do GIS; o valor cru entra
// na lista do cookie HttpOnly e é conferido pelo Supabase no signInWithIdToken.
export async function GET() {
  const nonce = randomBytes(32).toString('base64url')

  const cookieStore = await cookies()
  const nonces = [...readNonces(cookieStore.get(NONCE_COOKIE)?.value), nonce].slice(-MAX_NONCES)
  cookieStore.set(NONCE_COOKIE, JSON.stringify(nonces), NONCE_COOKIE_OPTS)

  return NextResponse.json({ nonce: sha256Hex(nonce) })
}

export async function POST(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const next = safeNextPath(searchParams.get('next'))
  const fail = () => NextResponse.redirect(`${origin}/login?error=google`, 303)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail()
  }

  const credential = form.get('credential')
  const csrfBody = form.get('g_csrf_token')

  const cookieStore = await cookies()

  // Double-submit CSRF do próprio GIS: o token do corpo tem que bater com o
  // cookie g_csrf_token que a lib do Google grava antes do redirect.
  const csrfCookie = cookieStore.get('g_csrf_token')?.value
  if (
    typeof credential !== 'string' || credential.length === 0 ||
    typeof csrfBody !== 'string' || csrfBody.length === 0 ||
    csrfBody !== csrfCookie
  ) {
    return fail()
  }

  const nonces = readNonces(cookieStore.get(NONCE_COOKIE)?.value)
  const claim = unverifiedNonceClaim(credential)
  const nonce = claim ? nonces.find(n => sha256Hex(n) === claim) : undefined

  // Consome o nonce usado (one-time use), preservando os das outras abas.
  const remaining = nonces.filter(n => n !== nonce)
  if (remaining.length > 0) {
    cookieStore.set(NONCE_COOKIE, JSON.stringify(remaining), NONCE_COOKIE_OPTS)
  } else {
    cookieStore.set(NONCE_COOKIE, '', { ...NONCE_COOKIE_OPTS, maxAge: 0 })
  }

  if (!nonce) return fail()

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: credential,
    nonce,
  })
  if (error) return fail()

  return NextResponse.redirect(`${origin}${next}`, 303)
}
