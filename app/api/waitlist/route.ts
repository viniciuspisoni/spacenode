import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function POST(req: Request) {
  // JSON inválido era exceção → 500; e-mail sem teto de tamanho ia direto pro
  // banco. Rota pública: valida formato e limita a 254 chars (RFC 5321).
  const body = await req.json().catch(() => null) as { email?: unknown } | null
  const email = body?.email

  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Rate limit por IP (AL-2): rota pública sem auth — antes floodável. Inerte até
  // a migration; fail-open.
  const rl = await rateLimit(supabase, `waitlist:${clientIp(req)}`, 10, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })

  const { error } = await supabase
    .from('waitlist')
    .insert({ email: email.toLowerCase().trim() })

  if (error) {
    if (error.code === '23505') {
      // Email já cadastrado — trata como sucesso silencioso
      return NextResponse.json({ ok: true })
    }
    console.error('[waitlist]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
