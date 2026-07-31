import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { matureRewards } from '@/lib/referral/service'

// Cron diário (vercel.json): libera as recompensas de indicação cujo prazo de
// reembolso terminou (pending → available).
//
// É REDE DE SEGURANÇA, não dependência: `claim_referral_rewards` amadurece as
// recompensas do próprio usuário antes de escolher, então uma mensalidade
// nunca deixa de receber o desconto por causa de um cron que falhou. O cron
// existe para que o painel mostre "disponível" no dia certo, mesmo em conta
// que não gerou fatura nenhuma nesse meio-tempo.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  try {
    const matured = await matureRewards(createAdminClient())
    return NextResponse.json({ ok: true, matured })
  } catch (err) {
    console.error('[cron/referral-rewards]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
