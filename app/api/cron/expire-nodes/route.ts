import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { NODES_GRACE_DAYS } from '@/lib/billing/nodes'

// Cron diário (vercel.json): expira o saldo de Nodes mensais cuja janela de
// cortesia pós-cancelamento já venceu — os NODES_GRACE_DAYS dias depois do fim
// da assinatura. Zera `profiles.credits`, limpa o prazo e registra a saída no
// node_ledger (kind = 'expiry').
//
// Não é a única garantia da regra, de propósito: consume_nodes_v2 e
// grant_plan_nodes também expiram o saldo vencido antes de operar. Se este
// cron falhar ou não rodar, ninguém gasta node vencido nem vê saldo fantasma —
// o cron só mantém o banco em dia para as contas que ficaram paradas.
//
// Nodes EXTRAS (lumen_packs) não são tocados aqui: são avulsos e não expiram
// desde 2026-08-31.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  try {
    const { data, error } = await createAdminClient().rpc('expire_stale_plan_nodes', {
      batch_limit: 1000,
    })
    if (error) {
      console.error('[cron/expire-nodes] expire_stale_plan_nodes falhou:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    const result = (data ?? {}) as { users_expired?: number; nodes_expired?: number }
    if ((result.users_expired ?? 0) > 0) {
      console.log(
        `[cron/expire-nodes] ${result.users_expired} conta(s) expirada(s), ` +
        `${result.nodes_expired ?? 0} nodes retirados (cortesia de ${NODES_GRACE_DAYS} dias vencida)`
      )
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/expire-nodes]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
