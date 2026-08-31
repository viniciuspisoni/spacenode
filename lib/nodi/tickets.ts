// ── Serviço de chamados do Nodi (server-only) ─────────────────────────────────
//
// Abstração do "canal de chamados": V1 grava no Supabase (nodi_tickets) e a
// integração externa existente é o WhatsApp do suporte (lib/support) — o
// painel oferece o envio do protocolo por lá após criar. Se um dia houver um
// sistema de tickets externo (e-mail, helpdesk), este é o único arquivo que
// precisa aprender a integração (ver docs/NODI.md).
//
// O insert usa o client do USUÁRIO — a policy insert_own garante user_id
// próprio no banco, não só no código. Tudo que entra passa pela redação
// (lib/nodi/redact): título/descrição/passos do usuário mantêm conteúdo mas
// perdem segredos colados; campos técnicos já chegam redigidos do diagnóstico.

import type { SupabaseClient } from '@supabase/supabase-js'
import { clampText, sanitizeUserText } from './redact'
import type {
  NodiTurn,
  TicketCategory,
  TicketContext,
  TicketDraft,
  TicketPriority,
  TicketRecord,
} from './types'

const CATEGORIES: TicketCategory[] = ['generation_failed', 'unexpected_result', 'billing', 'access', 'question', 'other']
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent']

const MAX_TRANSCRIPT_TURNS = 12
const MAX_TURN_CHARS = 400

/** Rótulos de produto (UI + resumo pro WhatsApp). */
export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  generation_failed: 'Geração com erro',
  unexpected_result: 'Resultado diferente do esperado',
  billing:           'Nodes e cobrança',
  access:            'Conta e acesso',
  question:          'Dúvida',
  other:             'Outro assunto',
}

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'Aberto', in_review: 'Em análise', resolved: 'Resolvido', closed: 'Fechado',
}

export function ticketProtocol(seq: number | string): string {
  return `ND-${seq}`
}

/** Whitelist + saneamento do contexto técnico (só chaves conhecidas, valores curtos). */
export function sanitizeTicketContext(context: TicketContext | undefined): TicketContext {
  if (!context) return {}
  const out: TicketContext = {}
  const s = (v: unknown, max = 160) => (typeof v === 'string' && v.trim() ? clampText(v, max) : undefined)
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

  out.route          = s(context.route, 200)
  out.module         = s(context.module, 40)
  out.projectId      = s(context.projectId, 60)
  out.generationKind = context.generationKind
  out.generationId   = s(context.generationId, 60)
  out.engine         = s(context.engine, 60)
  out.status         = s(context.status, 40)
  out.errorCode      = s(context.errorCode, 60)
  out.occurredAt     = s(context.occurredAt, 40)
  out.nodesCharged   = n(context.nodesCharged)
  out.nodesRefunded  = n(context.nodesRefunded)
  out.planId         = s(context.planId, 20)
  out.browser        = s(context.browser, 30)
  out.os             = s(context.os, 30)

  if (context.extra && typeof context.extra === 'object') {
    const extra: Record<string, string> = {}
    for (const [k, v] of Object.entries(context.extra).slice(0, 8)) {
      const key = clampText(String(k), 32)
      const val = s(v, 120)
      if (key && val) extra[key] = val
    }
    if (Object.keys(extra).length) out.extra = extra
  }

  // remove undefined pra não inflar o jsonb
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as TicketContext
}

/** Transcrição resumida: últimos turnos, cada um truncado, sem segredos. */
export function summarizeTranscript(turns: NodiTurn[] | undefined): { role: string; text: string }[] | null {
  if (!turns?.length) return null
  return turns
    .slice(-MAX_TRANSCRIPT_TURNS)
    .map(t => ({
      role: t.role === 'user' ? 'user' : 'nodi',
      text: sanitizeUserText(String(t.text ?? ''), MAX_TURN_CHARS),
    }))
    .filter(t => t.text.length > 0)
}

/** Valida e sanitiza o rascunho vindo do painel. Lança em campo obrigatório ausente. */
export function buildTicketRow(userId: string, draft: TicketDraft): Record<string, unknown> {
  const title = sanitizeUserText(String(draft.title ?? ''), 200)
  const description = sanitizeUserText(String(draft.description ?? ''), 4000)
  if (!title) throw new Error('Título do chamado vazio')
  if (!description) throw new Error('Descrição do chamado vazia')

  const category: TicketCategory = CATEGORIES.includes(draft.category) ? draft.category : 'other'
  const priority: TicketPriority = PRIORITIES.includes(draft.priority) ? draft.priority : 'normal'
  const context = sanitizeTicketContext(draft.context)

  return {
    user_id: userId,
    title,
    description,
    category,
    priority,
    steps_tried: draft.stepsTried ? sanitizeUserText(String(draft.stepsTried), 2000) || null : null,
    probable_cause: draft.probableCause ? sanitizeUserText(String(draft.probableCause), 1000) || null : null,
    context,
    transcript: summarizeTranscript(draft.transcript),
    generation_kind: context.generationKind ?? null,
    generation_id: context.generationId ?? null,
  }
}

export async function createTicket(
  supabase: SupabaseClient,
  userId: string,
  draft: TicketDraft,
): Promise<TicketRecord> {
  const row = buildTicketRow(userId, draft)
  const { data, error } = await supabase
    .from('nodi_tickets')
    .insert(row)
    .select('id, seq, status, priority, category, title, created_at')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Falha ao registrar o chamado')
  }
  return {
    id: String(data.id),
    protocol: ticketProtocol(data.seq as number),
    status: data.status,
    priority: data.priority,
    category: data.category,
    title: data.title,
    createdAt: String(data.created_at),
  }
}

export async function listMyTickets(
  supabase: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<TicketRecord[]> {
  const { data, error } = await supabase
    .from('nodi_tickets')
    .select('id, seq, status, priority, category, title, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map(d => ({
    id: String(d.id),
    protocol: ticketProtocol(d.seq as number),
    status: d.status,
    priority: d.priority,
    category: d.category,
    title: d.title,
    createdAt: String(d.created_at),
  }))
}

/** Resumo de texto puro do chamado (copiar / enviar no WhatsApp). */
export function ticketPlainSummary(record: TicketRecord, draft: TicketDraft): string {
  const ctx = sanitizeTicketContext(draft.context)
  const lines: string[] = [
    `Chamado ${record.protocol} — ${TICKET_CATEGORY_LABEL[record.category] ?? record.category}`,
    `Título: ${record.title}`,
    `Prioridade sugerida: ${TICKET_PRIORITY_LABEL[record.priority] ?? record.priority}`,
  ]
  if (ctx.module)        lines.push(`Módulo: ${ctx.module}`)
  if (ctx.generationId)  lines.push(`Geração: ${ctx.generationKind ?? ''} ${ctx.generationId}`.trim())
  if (ctx.engine)        lines.push(`Motor: ${ctx.engine}`)
  if (ctx.status)        lines.push(`Status: ${ctx.status}`)
  if (ctx.errorCode)     lines.push(`Erro: ${ctx.errorCode}`)
  if (ctx.occurredAt)    lines.push(`Horário: ${ctx.occurredAt}`)
  if (typeof ctx.nodesCharged === 'number')  lines.push(`Nodes debitados: ${ctx.nodesCharged}`)
  if (typeof ctx.nodesRefunded === 'number') lines.push(`Nodes estornados: ${ctx.nodesRefunded}`)
  return lines.join('\n')
}
