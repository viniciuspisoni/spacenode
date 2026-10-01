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
import { isInGracePeriod } from '@/lib/billing/nodes'
import { getPayerId } from './context'

export interface PayerBalance {
  /** Conta que paga os nodes (dono do workspace; individual = o próprio). */
  payerId: string
  /** true quando o saldo exibido é a bolsa de outra conta (membro de escritório). */
  pooled: boolean
  /** Plano do pagador (profiles.plan). */
  planId: string
  /**
   * Nodes mensais — SOMADOS a cada renovação e sem validade enquanto a
   * assinatura estiver ativa (profiles.credits).
   */
  planBalance: number
  /** Nodes extras — avulsos, sem validade (ex-"Lumens"; tabela lumen_packs). */
  extraBalance: number
  totalBalance: number
  extraPacks: number
  /**
   * Fim da janela de validade pós-cancelamento (ISO) — 90 dias depois do fim
   * da assinatura, quando o saldo mensal ainda existente expira. null enquanto
   * a assinatura está ativa (o saldo não tem prazo) e depois de uma
   * reassinatura, que cancela a expiração.
   */
  planNodesExpireAt: string | null
}

export async function getPayerBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<PayerBalance> {
  const payerId = (await getPayerId(admin, userId)) ?? userId

  const [balRes, profRes] = await Promise.all([
    admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance, active_lumen_packs, plan_nodes_expire_at')
      .eq('user_id', payerId)
      .single(),
    admin.from('profiles').select('plan, credits, nodes_expire_at').eq('id', payerId).single(),
  ])

  // View sem linha (conta pré-view): cai pro credits do perfil do pagador.
  // As colunas lumen_* da view são o nome interno legado de Nodes extras.
  const expiresAt = (balRes.data?.plan_nodes_expire_at as string | null | undefined)
    ?? (profRes.data?.nodes_expire_at as string | null | undefined)
    ?? null

  // Prazo vencido = saldo que não existe mais (o cron/o consumo ainda vão
  // gravar o zero). Vale para o fallback também, senão a tela mostraria nodes
  // que a geração recusaria.
  const expired      = Boolean(expiresAt) && !isInGracePeriod(expiresAt)
  const fallbackPlan = expired ? 0 : (profRes.data?.credits ?? 0)
  const planBalance  = balRes.data?.plan_balance  ?? fallbackPlan
  const extraBalance = balRes.data?.lumen_balance ?? 0

  return {
    payerId,
    pooled:       payerId !== userId,
    planId:       (profRes.data?.plan as string | undefined) ?? 'free',
    planBalance,
    extraBalance,
    totalBalance: balRes.data?.total_balance ?? planBalance + extraBalance,
    extraPacks:   balRes.data?.active_lumen_packs ?? 0,
    planNodesExpireAt: expired ? null : (expiresAt ?? null),
  }
}
