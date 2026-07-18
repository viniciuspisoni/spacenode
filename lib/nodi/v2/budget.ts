// ── Orçamento e limites do Nodi V2 ───────────────────────────────────────────
//
// Camadas, todas server-side:
//   · por request: máx. de etapas do loop, tool calls, chamadas de visão,
//     tokens de saída e tempo total (deadline única pro request inteiro);
//   · por usuário: minuto/dia/mês via rate_limits (janela fixa Postgres já
//     existente — bump_rate_limit aceita qualquer largura de janela; zero
//     tabela nova, fail-open se a migration não estiver aplicada);
//   · global: circuit breaker em memória — N falhas seguidas do provedor
//     abrem o circuito por um período e a rota cai direto no fallback V1.
//     (Por instância serverless; suficiente pra conter cascata de erro/custo.)
//
// Custos de referência (documentados em docs/NODI.md): gemini-2.5-flash
// ~US$0,30/1M tokens de entrada e ~US$2,50/1M de saída (imagem conta como
// entrada). Os tetos abaixo seguram o pior caso diário por usuário em
// centavos de dólar.

import type { SupabaseClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rate-limit'

export const V2_LIMITS = {
  maxSteps: 6,            // iterações do loop (modelo → tools → modelo)
  maxToolCalls: 8,        // total de tools executadas num request
  maxVisionCalls: 2,      // análises multimodais num request
  maxOutputTokens: 900,   // por chamada de modelo
  deadlineMs: 45_000,     // request inteiro (loop + tools + visão)
  perMinute: 6,
  perDay: Number(process.env.NODI_V2_DAILY_LIMIT ?? 80),
  perMonth: Number(process.env.NODI_V2_MONTHLY_LIMIT ?? 1200),
} as const

export interface BudgetCheck {
  allowed: boolean
  /** mensagem amigável quando negado */
  reason?: string
}

/** Caps por usuário (minuto/dia/mês). Fail-open por baixo (rate_limits). */
export async function checkUserBudget(admin: SupabaseClient, userId: string): Promise<BudgetCheck> {
  const [minute, day, month] = await Promise.all([
    rateLimit(admin, `nodi-v2-min:${userId}`, V2_LIMITS.perMinute, 60),
    rateLimit(admin, `nodi-v2-day:${userId}`, V2_LIMITS.perDay, 86_400),
    rateLimit(admin, `nodi-v2-mon:${userId}`, V2_LIMITS.perMonth, 2_592_000),
  ])
  if (!minute.allowed) return { allowed: false, reason: 'Muitas mensagens em sequência. Aguarde alguns segundos.' }
  if (!day.allowed) return { allowed: false, reason: 'O limite diário do assistente foi atingido. Ele volta amanhã — o suporte continua disponível.' }
  if (!month.allowed) return { allowed: false, reason: 'O limite mensal do assistente foi atingido. O suporte continua disponível.' }
  return { allowed: true }
}

// ── Circuit breaker (por instância) ──────────────────────────────────────────

const BREAKER_THRESHOLD = 3       // falhas seguidas do provedor…
const BREAKER_COOLDOWN_MS = 90_000 // …abrem o circuito por 90s

let consecutiveFailures = 0
let openUntil = 0

export function breakerOpen(now = Date.now()): boolean {
  return now < openUntil
}

export function reportProviderFailure(now = Date.now()): void {
  consecutiveFailures += 1
  if (consecutiveFailures >= BREAKER_THRESHOLD) {
    openUntil = now + BREAKER_COOLDOWN_MS
  }
}

export function reportProviderSuccess(): void {
  consecutiveFailures = 0
  openUntil = 0
}

/** Só para testes: zera o estado do breaker. */
export function resetBreakerForTests(): void {
  consecutiveFailures = 0
  openUntil = 0
}

// ── Deadline do request ──────────────────────────────────────────────────────

export interface Deadline {
  /** ms restantes (mínimo 0) */
  remaining(): number
  expired(): boolean
}

export function startDeadline(totalMs: number = V2_LIMITS.deadlineMs, now = () => Date.now()): Deadline {
  const until = now() + totalMs
  return {
    remaining: () => Math.max(0, until - now()),
    expired: () => now() >= until,
  }
}
