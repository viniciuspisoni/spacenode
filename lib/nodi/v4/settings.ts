// ── Nodi V4 — modos de autonomia por usuário (server-only) ───────────────────
//
// consultor: analisa e recomenda, nunca propõe execução.
// copiloto (default): prepara e pede aprovação (comportamento V3).
// autopiloto: executa sozinho DENTRO dos limites (nodes/ação, nodes/dia) —
//   o servidor revalida os limites na hora de executar, nunca o client.

import type { SupabaseClient } from '@supabase/supabase-js'

export type NodiMode = 'consultor' | 'copiloto' | 'autopiloto'

export interface NodiSettings {
  mode: NodiMode
  maxNodesPerAction: number
  maxNodesPerDay: number
  autoReview: boolean
}

export const DEFAULT_SETTINGS: NodiSettings = {
  mode: 'copiloto',
  maxNodesPerAction: 60,
  maxNodesPerDay: 200,
  autoReview: true,
}

const MODES: NodiMode[] = ['consultor', 'copiloto', 'autopiloto']

export function sanitizeSettings(raw: unknown): NodiSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clamp = (v: unknown, def: number, max: number) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : def
  }
  return {
    mode: MODES.includes(r.mode as NodiMode) ? (r.mode as NodiMode) : DEFAULT_SETTINGS.mode,
    maxNodesPerAction: clamp(r.maxNodesPerAction, DEFAULT_SETTINGS.maxNodesPerAction, 1000),
    maxNodesPerDay: clamp(r.maxNodesPerDay, DEFAULT_SETTINGS.maxNodesPerDay, 5000),
    autoReview: typeof r.autoReview === 'boolean' ? r.autoReview : DEFAULT_SETTINGS.autoReview,
  }
}

/** Leitura tolerante (tabela ausente/linha ausente → defaults). */
export async function readSettings(supabase: SupabaseClient, userId: string): Promise<NodiSettings> {
  try {
    const { data } = await supabase
      .from('nodi_user_settings')
      .select('mode, max_nodes_per_action, max_nodes_per_day, auto_review')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return DEFAULT_SETTINGS
    return sanitizeSettings({
      mode: data.mode,
      maxNodesPerAction: data.max_nodes_per_action,
      maxNodesPerDay: data.max_nodes_per_day,
      autoReview: data.auto_review,
    })
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown,
): Promise<NodiSettings> {
  const s = sanitizeSettings(raw)
  const { error } = await supabase.from('nodi_user_settings').upsert({
    user_id: userId,
    mode: s.mode,
    max_nodes_per_action: s.maxNodesPerAction,
    max_nodes_per_day: s.maxNodesPerDay,
    auto_review: s.autoReview,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.code === '42P01' ? 'SETTINGS_UNAVAILABLE' : error.message)
  return s
}

/** Gasto automático de hoje (soma de v3_executed auto no nodi_events). */
export async function getAutoSpentToday(admin: SupabaseClient, userId: string): Promise<number> {
  try {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0)
    const { data } = await admin
      .from('nodi_events')
      .select('meta')
      .eq('user_id', userId)
      .eq('event', 'v3_executed')
      .gte('created_at', start.toISOString())
      .limit(200)
    return (data ?? []).reduce((acc, row) => {
      const m = row.meta as { cost?: unknown; auto?: unknown } | null
      return m?.auto === true && typeof m.cost === 'number' ? acc + m.cost : acc
    }, 0)
  } catch {
    return 0
  }
}

/** O autopiloto pode executar esta ação agora? Motivo em PT quando não. */
export function checkAutoAllowance(
  settings: NodiSettings,
  cost: number,
  spentToday: number,
): { allowed: boolean; reason?: string } {
  if (settings.mode !== 'autopiloto') return { allowed: false, reason: 'modo atual não é autopiloto' }
  if (cost > settings.maxNodesPerAction) {
    return { allowed: false, reason: `custo ${cost} nodes acima do limite por ação (${settings.maxNodesPerAction})` }
  }
  if (spentToday + cost > settings.maxNodesPerDay) {
    return { allowed: false, reason: `limite diário do autopiloto atingido (${spentToday}/${settings.maxNodesPerDay} nodes)` }
  }
  return { allowed: true }
}
