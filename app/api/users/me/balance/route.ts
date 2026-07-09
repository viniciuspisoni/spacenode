// GET /api/users/me/balance — saldo atual + estado (saudável/atenção/crítico/zerado)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlanById } from '@/lib/plans'
import { getBalanceState } from '@/lib/spaces/balance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Mostra a "bolsa": saldo do dono do workspace ativo (individual = ele mesmo).
  const balance = await getPayerBalance(createAdminClient(), user.id)

  const plan   = getPlanById(balance.planId as Parameters<typeof getPlanById>[0])
  const planTotal = plan?.nodes ?? 0
  const state = getBalanceState(balance.planBalance, planTotal)

  return NextResponse.json({
    plan_balance:        balance.planBalance,
    plan_total:          planTotal,
    lumen_balance:       balance.lumenBalance,
    active_lumen_packs:  balance.activeLumenPacks,
    total_balance:       balance.totalBalance,
    plan_id:             balance.planId,
    state,
  })
}
