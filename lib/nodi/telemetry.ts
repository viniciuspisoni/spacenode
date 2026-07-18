// ── Telemetria do Nodi (server-only) ──────────────────────────────────────────
//
// Política dura: NENHUM texto livre do usuário — nem pergunta, nem conversa.
// Só evento (whitelist), rota, módulo e slugs/números em meta (whitelist de
// chaves). O objetivo é medir utilidade (o que é perguntado POR TEMA, quantos
// chamados, onde o assistente falha), não vigiar conteúdo.
//
// Fire-and-forget: telemetria nunca derruba uma resposta. Grava via admin
// client (nodi_events é deny-all pra authenticated — ver migration
// 20260717120000_nodi_assistant.sql). Enquanto a migration não for aplicada,
// o insert falha em silêncio (42P01) — inerte, mesmo modelo do rate-limit.

import type { SupabaseClient } from '@supabase/supabase-js'

export const NODI_EVENTS = [
  'panel_open',
  'question_asked',
  'answer_kb',
  'answer_ai',
  'answer_none',
  'problem_flow_started',
  'diagnose_run',
  'ticket_created',
  'action_clicked',
  'provider_error',
  // V2 (copiloto) — nunca conteúdo, só contagens/slugs
  'v2_chat',
  'v2_fallback',
  'v2_action_confirmed',
  'v2_memory_saved',
  'answer_feedback',
  'v3_executed',
] as const

export type NodiEventName = (typeof NODI_EVENTS)[number]

const META_KEYS = new Set([
  'kb', 'source', 'confidence', 'category', 'kind', 'issue', 'action', 'count', 'provider',
  // V2
  'tools', 'vision', 'tokens_in', 'tokens_out', 'duration_ms', 'helpful', 'type', 'cost',
])

export function isNodiEvent(value: unknown): value is NodiEventName {
  return typeof value === 'string' && (NODI_EVENTS as readonly string[]).includes(value)
}

/** Mantém só chaves conhecidas e valores curtos (string/number/boolean). */
export function sanitizeEventMeta(meta: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!meta || typeof meta !== 'object') return out
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (!META_KEYS.has(k)) continue
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') out[k] = v.slice(0, 80)
  }
  return out
}

export interface NodiEventInput {
  userId: string | null
  event: NodiEventName
  route?: string | null
  module?: string | null
  meta?: Record<string, string | number | boolean>
}

/** Insert fire-and-forget — qualquer falha vira silêncio (42P01 esperado sem migration). */
export async function logNodiEvent(admin: SupabaseClient, input: NodiEventInput): Promise<void> {
  try {
    await admin.from('nodi_events').insert({
      user_id: input.userId,
      event: input.event,
      route: input.route ? String(input.route).slice(0, 200) : null,
      module: input.module ? String(input.module).slice(0, 40) : null,
      meta: sanitizeEventMeta(input.meta),
    })
  } catch {
    // telemetria nunca é fatal
  }
}
