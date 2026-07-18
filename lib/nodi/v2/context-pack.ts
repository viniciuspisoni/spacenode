// ── Contexto estruturado do request (server-side) ────────────────────────────
//
// Montado UMA vez por request e injetado no primeiro turno, demarcado como
// DADO (wrapUntrusted). Contém só o que o servidor confirmou: rota/módulo
// derivados NO SERVIDOR (nunca o que o client alega), saldo do pagador e
// plano. Detalhe de projeto/geração fica nas tools — o modelo busca quando
// precisa (contexto inicial barato; profundidade sob demanda).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { getPlanById, type PlanId } from '@/lib/plans'
import { deriveNodiContext } from '../context'
import type { NodiContext } from '../types'
import type { NodiAttachment } from './types'
import { wrapUntrusted } from './system-prompt'

export interface RequestContext {
  nodi: NodiContext
  planId: string | null
  planName: string | null
  balance: number | null
  lumens: number | null
  attachment: NodiAttachment | null
}

export async function buildRequestContext(
  admin: SupabaseClient,
  userId: string,
  route: string,
  attachment: NodiAttachment | null,
): Promise<RequestContext> {
  const nodi = deriveNodiContext(route)
  let planId: string | null = null
  let balance: number | null = null
  let lumens: number | null = null
  try {
    const payer = await getPayerBalance(admin, userId)
    planId = (payer?.planId as string) ?? null
    balance = typeof payer?.planBalance === 'number' ? payer.planBalance : null
    lumens = typeof payer?.lumenBalance === 'number' ? payer.lumenBalance : null
  } catch {
    // saldo indisponível não derruba a conversa — as tools reportam se preciso
  }
  const planName = planId ? getPlanById(planId as PlanId)?.name ?? planId : null
  return { nodi, planId, planName, balance, lumens, attachment }
}

/** Bloco de contexto pro primeiro turno do modelo. */
export function contextBlock(ctx: RequestContext): string {
  const lines = [
    `rota: ${ctx.nodi.route}`,
    `modulo: ${ctx.nodi.moduleLabel ?? 'nenhum'} (${ctx.nodi.moduleId ?? '-'})`,
    ctx.nodi.projectId ? `projeto_aberto: ${ctx.nodi.projectId}` : 'projeto_aberto: nenhum',
    ctx.nodi.vistaId ? `vista_aberta: ${ctx.nodi.vistaId}` : null,
    ctx.planName ? `plano: ${ctx.planName}` : 'plano: desconhecido',
    ctx.balance !== null ? `saldo_nodes_plano: ${ctx.balance}` : 'saldo_nodes_plano: desconhecido',
    ctx.lumens !== null && ctx.lumens > 0 ? `saldo_lumens: ${ctx.lumens}` : null,
    ctx.attachment ? `imagem_anexada: ${ctx.attachment.kind} ${ctx.attachment.id}` : 'imagem_anexada: nenhuma',
    ctx.nodi.extra ? `contexto_da_pagina: ${JSON.stringify(ctx.nodi.extra)}` : null,
  ].filter(Boolean)
  return wrapUntrusted('CONTEXTO DA SESSÃO', lines.join('\n'))
}
