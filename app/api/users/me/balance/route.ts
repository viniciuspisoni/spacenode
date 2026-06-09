// GET /api/users/me/balance — saldo atual + estado (saudável/atenção/crítico/zerado)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlanById } from '@/lib/plans'
import { getBalanceState } from '@/lib/spaces/balance'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Mostra a "bolsa": saldo do dono do workspace ativo (individual = ele mesmo).
  const payerId = (await getPayerId(supabase, user.id)) ?? user.id
  const admin = createAdminClient()
  const [balRes, profRes] = await Promise.all([
    admin.from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance, active_lumen_packs')
      .eq('user_id', payerId).single(),
    admin.from('profiles').select('plan').eq('id', payerId).single(),
  ])

  const planId = profRes.data?.plan as string | undefined
  const plan   = planId ? getPlanById(planId as Parameters<typeof getPlanById>[0]) : undefined
  const planTotal = plan?.nodes ?? 0

  const total = balRes.data?.total_balance ?? 0
  const planBalance = balRes.data?.plan_balance ?? 0
  const state = getBalanceState(planBalance, planTotal)

  return NextResponse.json({
    plan_balance:        planBalance,
    plan_total:          planTotal,
    lumen_balance:       balRes.data?.lumen_balance ?? 0,
    active_lumen_packs:  balRes.data?.active_lumen_packs ?? 0,
    total_balance:       total,
    plan_id:             planId ?? 'free',
    state,
  })
}
