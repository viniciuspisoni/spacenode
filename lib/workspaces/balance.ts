// Saldo da "bolsa" do workspace (Fase 1.5 — office wallet).
//
// Quem paga os nodes é o DONO do workspace ativo (individual: o próprio
// usuário). O débito já resolve isso no banco (consume_workspace_nodes), mas
// exibição e pré-checagens precisam ler o saldo do MESMO pagador — ler
// user_node_balance/profiles do membro mostra os 80 nodes de cadastro dele e
// bloqueia geração por engano.
//
// Use SEMPRE este helper para mostrar ou pré-checar saldo em server
// components e rotas. Requer client service-role: o RLS não deixa o membro
// ler o saldo do dono.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPayerId } from './context'

export interface PayerBalance {
  /** Conta que paga os nodes (dono do workspace; individual = o próprio). */
  payerId: string
  /** true quando o saldo exibido é a bolsa de outra conta (membro de escritório). */
  pooled: boolean
  /** Plano do pagador (profiles.plan). */
  planId: string
  planBalance: number
  lumenBalance: number
  totalBalance: number
  activeLumenPacks: number
}

export async function getPayerBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<PayerBalance> {
  const payerId = (await getPayerId(admin, userId)) ?? userId

  const [balRes, profRes] = await Promise.all([
    admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance, active_lumen_packs')
      .eq('user_id', payerId)
      .single(),
    admin.from('profiles').select('plan, credits').eq('id', payerId).single(),
  ])

  // View sem linha (conta pré-view): cai pro credits do perfil do pagador.
  const fallbackPlan = profRes.data?.credits ?? 0
  const planBalance  = balRes.data?.plan_balance  ?? fallbackPlan
  const lumenBalance = balRes.data?.lumen_balance ?? 0

  return {
    payerId,
    pooled:           payerId !== userId,
    planId:           (profRes.data?.plan as string | undefined) ?? 'free',
    planBalance,
    lumenBalance,
    totalBalance:     balRes.data?.total_balance ?? planBalance + lumenBalance,
    activeLumenPacks: balRes.data?.active_lumen_packs ?? 0,
  }
}
