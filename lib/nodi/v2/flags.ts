// ── Flags do Nodi V2 (server-only, mesmo modelo da V1) ───────────────────────
//
// Tudo desligado por padrão. Ordem de gate no runtime:
//   NODI_ENABLED (V1, casco) → NODI_V2_ENABLED (orquestrador) →
//   NODI_INTERNAL_USERS_ONLY (default LIGADO: se '0' explícito, abre p/ todos)
//   → capacidades individuais (multimodal / memória / ações supervisionadas).
//
// A checagem de usuário interno reusa lib/auth/privileged (INTERNAL_STAFF_EMAILS
// ou profiles.role) — a mesma porta do Diagnóstico técnico do Histórico.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalStaff } from '@/lib/auth/privileged'

export function isNodiV2Enabled(): boolean {
  return process.env.NODI_V2_ENABLED === '1'
}

/** Default FECHADO: só abre pra todo mundo com NODI_INTERNAL_USERS_ONLY=0 explícito. */
export function isNodiV2InternalOnly(): boolean {
  return process.env.NODI_INTERNAL_USERS_ONLY !== '0'
}

export function isNodiMultimodalEnabled(): boolean {
  return process.env.NODI_MULTIMODAL_ENABLED === '1'
}

export function isNodiProjectMemoryEnabled(): boolean {
  return process.env.NODI_PROJECT_MEMORY_ENABLED === '1'
}

export function isNodiSupervisedActionsEnabled(): boolean {
  return process.env.NODI_SUPERVISED_ACTIONS_ENABLED === '1'
}

/** V3: execução direta pelo chat (gera de verdade após confirmação). Exige ações supervisionadas. */
export function isNodiV3ExecuteEnabled(): boolean {
  return process.env.NODI_V3_EXECUTE_ENABLED === '1' && isNodiSupervisedActionsEnabled()
}

/** O usuário atual pode usar a V2? (flag geral + gate de internos). */
export async function isNodiV2EnabledFor(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<boolean> {
  if (!isNodiV2Enabled()) return false
  if (!isNodiV2InternalOnly()) return true
  return isInternalStaff(admin, user)
}

/** Capacidades expostas ao painel (bootstrap) — booleans, nunca os envs. */
export interface NodiV2Capabilities {
  v2: boolean
  multimodal: boolean
  memory: boolean
  actions: boolean
  /** V3: o copiloto executa a geração após confirmação no chat */
  execute: boolean
}

export function capabilitiesFor(v2Allowed: boolean): NodiV2Capabilities {
  return {
    v2: v2Allowed,
    multimodal: v2Allowed && isNodiMultimodalEnabled(),
    memory: v2Allowed && isNodiProjectMemoryEnabled(),
    actions: v2Allowed && isNodiSupervisedActionsEnabled(),
    execute: v2Allowed && isNodiV3ExecuteEnabled(),
  }
}
