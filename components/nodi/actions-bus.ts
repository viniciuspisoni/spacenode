'use client'

// ── Barramento de ações supervisionadas (client) ─────────────────────────────
//
// Executa uma SupervisedAction JÁ CONFIRMADA pelo usuário no painel. Ações de
// preenchimento viajam por um handoff em sessionStorage: o módulo de destino
// lê no mount e aplica (GenerateClient consome engine/resolution/prompt).
// Iniciar geração NUNCA dispara aqui — o handoff pré-preenche a ferramenta e
// o clique final (que gasta nodes) continua sendo o botão real do módulo.

import { getEnabledModules } from '@/lib/nav/modules-config'
import type { SupervisedAction } from '@/lib/nodi/v2/types'

export const NODI_HANDOFF_KEY = 'spn:nodi:handoff:v1'

export interface NodiHandoff {
  moduleId: string
  prompt?: string
  settings?: Record<string, string>
  at: number
}

export function writeHandoff(action: SupervisedAction): void {
  if (!action.moduleId) return
  const handoff: NodiHandoff = {
    moduleId: action.moduleId,
    prompt: action.prompt,
    settings: action.settings,
    at: Date.now(),
  }
  try { sessionStorage.setItem(NODI_HANDOFF_KEY, JSON.stringify(handoff)) } catch {}
}

/** Lê e CONSOME o handoff do módulo (uma vez; expira em 5 min). */
export function consumeHandoff(moduleId: string): NodiHandoff | null {
  try {
    const raw = sessionStorage.getItem(NODI_HANDOFF_KEY)
    if (!raw) return null
    const handoff = JSON.parse(raw) as NodiHandoff
    if (handoff.moduleId !== moduleId) return null
    sessionStorage.removeItem(NODI_HANDOFF_KEY)
    if (Date.now() - handoff.at > 5 * 60_000) return null
    return handoff
  } catch {
    return null
  }
}

/** Rota do módulo (fonte: registry central de navegação). */
export function moduleHref(moduleId: string): string | null {
  return getEnabledModules().find(m => m.id === moduleId)?.href ?? null
}

/** Destino de navegação de uma ação confirmada (null = nada a navegar). */
export function actionDestination(action: SupervisedAction): string | null {
  if (action.type === 'navigate') return action.href ?? null
  if (action.moduleId) return moduleHref(action.moduleId)
  return null
}
