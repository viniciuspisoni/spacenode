// POST /api/nodi/v2/chat — o copiloto (orquestrador agentic)
//
// Roteamento econômico ANTES de gastar modelo:
//   1. flag/gate de internos + budget (min/dia/mês);
//   2. pergunta simples com match forte na base e sem imagem → resposta
//      determinística da V1 (custo zero de LLM);
//   3. senão → orquestrador V2 (function calling);
//   4. V2 indisponível/estourada (breaker, erro, timeout) → fallback V1 —
//      o usuário NUNCA fica sem resposta.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { readSettings } from '@/lib/nodi/v4/settings'
import { capabilitiesFor, isNodiV2EnabledFor } from '@/lib/nodi/v2/flags'
import { checkUserBudget } from '@/lib/nodi/v2/budget'
import { runNodiV2 } from '@/lib/nodi/v2/orchestrator'
import { deriveNodiContext } from '@/lib/nodi/context'
import { KB_STRONG_SCORE, buildKbAnswer, matchKb } from '@/lib/nodi/knowledge'
import { logNodiEvent } from '@/lib/nodi/telemetry'
import { clampText } from '@/lib/nodi/redact'
import type { NodiTurn, GenerationKind } from '@/lib/nodi/types'
import type { NodiAttachment, NodiV2Answer } from '@/lib/nodi/v2/types'

// autopiloto pode executar uma geração dentro deste request
export const maxDuration = 300

const KINDS: GenerationKind[] = ['render', 'edit', 'video', 'upscale', 'vista']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseHistory(raw: unknown): NodiTurn[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(-8).map((t) => {
    const turn = t as { role?: unknown; text?: unknown }
    return {
      role: turn.role === 'user' ? ('user' as const) : ('nodi' as const),
      text: clampText(String(turn.text ?? ''), 400),
      at: 0,
    }
  }).filter(t => t.text.length > 0)
}

function parseAttachment(raw: unknown): NodiAttachment | null {
  const a = raw as { kind?: unknown; id?: unknown } | null
  if (!a || typeof a !== 'object') return null
  if (!KINDS.includes(a.kind as GenerationKind)) return null
  if (typeof a.id !== 'string' || !UUID_RE.test(a.id)) return null
  return { kind: a.kind as GenerationKind, id: a.id }
}

/** Fallback determinístico (mesma lógica da V1) embrulhado no envelope V2. */
function v1Fallback(message: string, moduleId: string | null): NodiV2Answer {
  const matches = matchKb(message, moduleId, 1)
  if (matches[0]) {
    const payload = buildKbAnswer(matches[0].entry)
    return { text: payload.text, source: 'v2-fallback-v1', actions: payload.actions }
  }
  return {
    text:
      'Não tenho uma resposta segura para isso agora — prefiro não arriscar um palpite. ' +
      'Se for sobre uma geração, posso analisar os dados dela; se preferir, encaminho você ao suporte.',
    source: 'v2-fallback-v1',
    actions: [{ type: 'start-problem', label: 'Analisar uma geração' }],
  }
}

export async function POST(req: Request) {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const v2Allowed = await isNodiV2EnabledFor(admin, user)
  if (!v2Allowed) return NextResponse.json({ error: 'Não disponível' }, { status: 404 })

  const budget = await checkUserBudget(admin, user.id)
  if (!budget.allowed) {
    return NextResponse.json({ error: budget.reason }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as {
    message?: unknown; route?: unknown; history?: unknown; attachment?: unknown
  } | null
  const message = typeof body?.message === 'string' ? clampText(body.message, 900) : ''
  if (!message) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const route = typeof body?.route === 'string' ? body.route.slice(0, 200) : '/app'
  const context = deriveNodiContext(route)
  const attachment = parseAttachment(body?.attachment)
  const history = parseHistory(body?.history)
  const capabilities = capabilitiesFor(true)
  const tele = { userId: user.id, route: context.route, module: context.moduleId }

  // 2 — atalho determinístico: pergunta simples, sem imagem, match forte.
  if (!attachment) {
    const matches = matchKb(message, context.moduleId, 1)
    if (matches[0] && matches[0].score >= KB_STRONG_SCORE) {
      const payload = buildKbAnswer(matches[0].entry)
      void logNodiEvent(admin, { ...tele, event: 'answer_kb', meta: { kb: payload.id, source: 'v2-shortcut' } })
      const answer: NodiV2Answer = { text: payload.text, source: 'v2', actions: payload.actions }
      return NextResponse.json({ answer })
    }
  }

  // 3 — orquestrador agentic (com modo de autonomia do usuário).
  const settings = await readSettings(supabase, user.id)
  const answer = await runNodiV2({
    supabase, admin, userId: user.id, route, message, history, attachment, capabilities,
    settings,
    origin: new URL(req.url).origin,
    cookie: req.headers.get('cookie') ?? '',
  })

  if (answer) {
    void logNodiEvent(admin, {
      ...tele,
      event: 'v2_chat',
      meta: {
        tools: answer.usage?.toolCalls.length ?? 0,
        vision: answer.usage?.visionCalls ?? 0,
        tokens_in: answer.usage?.inputTokens ?? 0,
        tokens_out: answer.usage?.outputTokens ?? 0,
        duration_ms: answer.usage?.durationMs ?? 0,
      },
    })
    return NextResponse.json({ answer })
  }

  // 4 — fallback V1: sempre responder.
  void logNodiEvent(admin, { ...tele, event: 'v2_fallback' })
  return NextResponse.json({ answer: v1Fallback(message, context.moduleId) })
}
