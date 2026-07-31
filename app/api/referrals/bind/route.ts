import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { REFERRAL_COOKIE, isReferralProgramOpen } from '@/lib/referral/config'
import { normalizeReferralCode } from '@/lib/referral/codes'
import { bindReferral } from '@/lib/referral/service'

// POST /api/referrals/bind — vincula o código guardado no cookie à conta
// autenticada. Chamado pelo ReferralBinder na primeira visita ao /app.
//
// O código vem do COOKIE, não do corpo: o browser não escolhe quem indicou
// quem depois de estar logado. Todas as regras duras (autoindicação, conta já
// indicada, conta antiga, conta que já foi cliente, email duplicado do próprio
// indicador) são resolvidas dentro da transação, no banco.
//
// A resposta diz se vale tentar de novo: `retry: true` significa "ainda pode
// dar certo depois" (programa não começou), e o cliente mantém o cookie.

export const dynamic = 'force-dynamic'

/** Recusas definitivas — não adianta tentar de novo neste navegador. */
const TERMINAL = new Set([
  'code_missing',
  'code_not_found',
  'self_referral',
  'already_referred',
  'account_too_old',
  'already_customer',
  'duplicate_identity',
])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const code = normalizeReferralCode(req.cookies.get(REFERRAL_COOKIE)?.value)
  if (!code) {
    return NextResponse.json({ bound: false, retry: false, reason: 'no_code' })
  }

  // O programa entra em vigor numa data: antes dela o cookie continua válido
  // (90 dias) e o vínculo é tentado de novo depois.
  if (!isReferralProgramOpen()) {
    return NextResponse.json({ bound: false, retry: true, reason: 'program_closed' })
  }

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `referral-bind:${user.id}`, 10, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas — aguarde um pouco' }, { status: 429 })
  }

  const result = await bindReferral(admin, code, user.id)
  if (result.ok) {
    return NextResponse.json({ bound: true, retry: false })
  }
  return NextResponse.json({
    bound:  false,
    retry:  !TERMINAL.has(result.reason ?? ''),
    reason: result.reason ?? 'unavailable',
  })
}
