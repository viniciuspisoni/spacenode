'use client'

// ── Cliente HTTP do painel Nodi ───────────────────────────────────────────────
//
// Wrappers finos sobre /api/nodi/* com um contrato de erro único: toda função
// devolve { ok } — o painel nunca precisa de try/catch espalhado. `offline`
// distingue "sem rede/servidor fora" (estado de indisponibilidade do painel)
// de erro de negócio (mensagem amigável vinda da rota).

import type {
  DiagnosisReport,
  GenerationKind,
  GenerationSummary,
  NodiAnswer,
  NodiTurn,
  TicketDraft,
  TicketRecord,
} from '@/lib/nodi/types'
import type { NodiAttachment, NodiV2Answer, ProjectMemory } from '@/lib/nodi/v2/types'
import type { NodiV2Capabilities } from '@/lib/nodi/v2/flags'

export interface NodiBootstrap {
  moduleId: string | null
  moduleLabel: string | null
  suggestions: { id: string; title: string }[]
  faq: { id: string; title: string }[]
  capabilities?: NodiV2Capabilities
}

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; offline?: boolean; status?: number }

const OFFLINE_MSG = 'Não consegui falar com o servidor agora.'

async function call<T>(input: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (res.status === 204) return { ok: true, data: undefined as T }
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const error = (body as { error?: string } | null)?.error ?? OFFLINE_MSG
      return { ok: false, error, offline: res.status >= 500 && res.status !== 503 ? true : undefined, status: res.status }
    }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, error: OFFLINE_MSG, offline: true }
  }
}

export function fetchBootstrap(route: string) {
  return call<NodiBootstrap>(`/api/nodi/bootstrap?route=${encodeURIComponent(route)}`)
}

export function askNodi(input: { question?: string; kbId?: string; route: string; history: NodiTurn[] }) {
  return call<{ answer: NodiAnswer }>('/api/nodi/ask', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function fetchRecentGenerations() {
  return call<{ generations: GenerationSummary[] }>('/api/nodi/diagnose')
}

export function runDiagnosis(kind: GenerationKind, id: string) {
  return call<{ report: DiagnosisReport }>('/api/nodi/diagnose', {
    method: 'POST',
    body: JSON.stringify({ kind, id }),
  })
}

export function submitTicket(draft: TicketDraft) {
  return call<{ ticket: TicketRecord; summary: string }>('/api/nodi/tickets', {
    method: 'POST',
    body: JSON.stringify({ draft }),
  })
}

export function fetchMyTickets() {
  return call<{ tickets: TicketRecord[] }>('/api/nodi/tickets')
}

/** Fire-and-forget — telemetria nunca bloqueia a UI. */
export function sendNodiEvent(event: string, route: string, module: string | null, meta?: Record<string, string | number>) {
  void call('/api/nodi/telemetry', {
    method: 'POST',
    body: JSON.stringify({ event, route, module, meta }),
  })
}

// ── V2 (copiloto) ────────────────────────────────────────────────────────────

export function chatV2(input: {
  message: string
  route: string
  history: NodiTurn[]
  attachment: NodiAttachment | null
}) {
  return call<{ answer: NodiV2Answer }>('/api/nodi/v2/chat', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function executeIntent(intentToken: string) {
  return call<{ outputUrl: string; renderId: string | null; cost: number }>('/api/nodi/v3/execute', {
    method: 'POST',
    body: JSON.stringify({ intentToken }),
  })
}

export function saveProjectMemoryV2(spaceId: string, patch: ProjectMemory) {
  return call<{ memory: ProjectMemory }>('/api/nodi/v2/memory', {
    method: 'POST',
    body: JSON.stringify({ spaceId, patch }),
  })
}
