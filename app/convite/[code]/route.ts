import { NextResponse, type NextRequest } from 'next/server'
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE_DAYS } from '@/lib/referral/config'
import { normalizeReferralCode } from '@/lib/referral/codes'

// GET /convite/CODIGO — link individual de indicação.
//
// Só guarda o código num cookie first-party e manda para a landing. Nenhuma
// consulta ao banco aqui de propósito: a rota é pública e o código chega de
// fora, então validar existência daria um oráculo de "este código existe" para
// quem quisesse varrer. Quem valida é o vínculo, já autenticado.
//
// Código malformado não vira 404: a pessoa clicou num link e merece ver o
// produto, não um erro. O convite simplesmente não é registrado.

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await ctx.params
  const code = normalizeReferralCode(raw)

  const response = NextResponse.redirect(new URL('/', req.nextUrl.origin))
  if (!code) return response

  // Primeiro convite vence — mesma regra da captura por ?ref=. Quem já guardou
  // um código não é "roubado" por um segundo link antes de se cadastrar.
  if (req.cookies.get(REFERRAL_COOKIE)?.value) return response

  response.cookies.set(REFERRAL_COOKIE, code, {
    // Legível pelo cliente por paridade com a captura de ?ref= (mesmo cookie,
    // dois caminhos). Não é credencial: o servidor revalida tudo no vínculo.
    httpOnly: false,
    secure:   req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path:     '/',
    maxAge:   REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
  })
  return response
}
