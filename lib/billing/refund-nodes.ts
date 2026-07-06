// lib/billing/refund-nodes.ts
//
// Refund VERIFICADO (Fase C / AL-3 da auditoria 2026-07-03). O padrão anterior
// espalhado nas rotas —
//     try { await admin.rpc('refund_workspace_nodes', ...) }
//     catch (e) { console.error(...) }
// — é código MORTO no caminho de erro lógico: o supabase-js NÃO lança quando a
// RPC falha, devolve `{ error }`. Então um refund que falha era logado como
// "Refund executado" e o dinheiro ficava preso, invisível.
//
// Este helper CHECA o `{ error }` e emite um evento LOUD e findável em falha
// (grep por "FALHA NO REFUND"), com contexto pra reconciliação manual. Retorna
// true só quando o refund foi confirmado pelo banco.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RefundContext {
  /** Módulo de origem, pro log: 'generate' | 'edits' | 'upscale' | ... */
  module: string
  /** Tabela do job (renders/vistas/edits/image_edit_attempts), se houver. */
  jobTable?: string
  /** Id do job, se houver. */
  jobId?: string | null
}

/** Estorna `amount` nodes do PAGADOR (refund_workspace_nodes resolve o dono do
 *  workspace). Checa o `{ error }` da RPC. Loga FALHA NO REFUND em erro. No-op
 *  seguro pra amount <= 0. Nunca lança (o refund é best-effort, mas agora a
 *  falha é detectada e registrada, não engolida). */
export async function refundNodes(
  admin: SupabaseClient,
  userId: string,
  amount: number,
  ctx: RefundContext,
): Promise<boolean> {
  if (!amount || amount <= 0) return true
  try {
    const { error } = await admin.rpc('refund_workspace_nodes', {
      user_id_input: userId,
      amount,
    })
    if (error) {
      console.error('[refund] FALHA NO REFUND (CRÍTICO — nodes presos):', {
        module:   ctx.module,
        userId,
        amount,
        jobTable: ctx.jobTable ?? null,
        jobId:    ctx.jobId ?? null,
        code:     error.code,
        message:  error.message,
      })
      return false
    }
    return true
  } catch (e) {
    console.error('[refund] FALHA NO REFUND (exceção — nodes presos):', {
      module: ctx.module, userId, amount, error: (e as Error).message,
    })
    return false
  }
}
