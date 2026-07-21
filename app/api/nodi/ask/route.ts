// POST /api/nodi/ask
//
// Uma pergunta → uma resposta do Nodi. Ordem de decisão:
//   1. kbId direto (clique em sugestão/FAQ) → resposta determinística da base;
//   2. score forte na base → responde da base (rápido, grátis, sem invenção);
//   3. provedor de IA configurado (NODI_AI_PROVIDER) → resposta ancorada nos
//      candidatos da base; erro do provedor NUNCA vira erro pro usuário —
//      cai no determinístico;
//   4. sem resposta segura → assume com franqueza e oferece o caminho do
//      suporte/diagnóstico.
//
// Body: { question?: string, kbId?: string, route?: string,
//         history?: {role,text}[] }  (history só pros últimos 8 turnos)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { deriveNodiContext } from '@/lib/nodi/context'
import {
  KB_STRONG_SCORE,
  buildKbAnswer,
  getKbEntry,
  matchKb,
  type KBAnswerPayload,
} from '@/lib/nodi/knowledge'
import { resolveNodiProvider } from '@/lib/nodi/provider'
import { logNodiEvent } from '@/lib/nodi/telemetry'
import { clampText } from '@/lib/nodi/redact'
import type { NodiAnswer, NodiTurn } from '@/lib/nodi/types'

const NO_ANSWER_TEXT =
  'Não tenho uma resposta segura para isso ainda — prefiro não arriscar um palpite. ' +
  'Se for sobre uma geração, posso analisar os dados dela; se preferir, encaminho você direto ao suporte.'

function fallbackActions(): NodiAnswer['actions'] {
  return [
    { type: 'start-problem', label: 'Analisar uma geração' },
    { type: 'navigate', label: 'Falar com o suporte', href: '/app/conta' },
  ]
}

function parseHistory(raw: unknown): NodiTurn[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(-8)
    .map((t) => {
      const turn = t as { role?: unknown; text?: unknown; at?: unknown }
      return {
        role: turn.role === 'user' ? ('user' as const) : ('nodi' as const),
        text: clampText(String(turn.text ?? ''), 400),
        at: typeof turn.at === 'number' ? turn.at : 0,
      }
    })
    .filter(t => t.text.length > 0)
}

export async function POST(req: Request) {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `nodi-ask:${user.id}`, 30, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas perguntas em sequência. Aguarde alguns segundos.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as {
    question?: unknown; kbId?: unknown; route?: unknown; history?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })

  const route = typeof body.route === 'string' ? body.route.slice(0, 200) : '/app'
  const context = deriveNodiContext(route)
  const tele = { userId: user.id, route: context.route, module: context.moduleId }

  // 1 — clique em sugestão/FAQ: resposta determinística por id.
  if (typeof body.kbId === 'string' && body.kbId) {
    const entry = getKbEntry(body.kbId)
    if (!entry) return NextResponse.json({ error: 'Tópico não encontrado' }, { status: 404 })
    const payload = buildKbAnswer(entry)
    void logNodiEvent(admin, { ...tele, event: 'answer_kb', meta: { kb: entry.id, source: 'faq' } })
    const answer: NodiAnswer = {
      text: payload.text,
      confidence: 'high',
      source: 'kb',
      kbRefs: [payload.id],
      actions: payload.actions,
      offerSupport: false,
    }
    return NextResponse.json({ answer })
  }

  const question = typeof body.question === 'string' ? clampText(body.question, 600) : ''
  if (!question) return NextResponse.json({ error: 'Pergunta vazia' }, { status: 400 })

  void logNodiEvent(admin, { ...tele, event: 'question_asked' })

  const matches = matchKb(question, context.moduleId, 3)
  const candidates: KBAnswerPayload[] = matches.map(m => buildKbAnswer(m.entry))

  // 2 — casamento forte: a base responde sozinha.
  if (matches[0] && matches[0].score >= KB_STRONG_SCORE) {
    const top = candidates[0]
    void logNodiEvent(admin, { ...tele, event: 'answer_kb', meta: { kb: top.id, source: 'match' } })
    const answer: NodiAnswer = {
      text: top.text,
      confidence: 'high',
      source: 'kb',
      kbRefs: [top.id],
      actions: top.actions,
      offerSupport: false,
    }
    return NextResponse.json({ answer })
  }

  // 3 — provedor de IA (se configurado), ancorado na base.
  const provider = resolveNodiProvider()
  if (provider) {
    try {
      const result = await provider.answer({
        question,
        context,
        history: parseHistory(body.history),
        kbCandidates: candidates,
      })
      void logNodiEvent(admin, {
        ...tele,
        event: 'answer_ai',
        meta: { provider: provider.id, confidence: result.confidence, count: candidates.length },
      })
      const answer: NodiAnswer = {
        text: result.text,
        confidence: result.confidence,
        source: 'ai',
        kbRefs: candidates.map(c => c.id),
        actions: result.needsSupport ? fallbackActions() : (candidates[0]?.actions ?? []),
        offerSupport: result.needsSupport,
      }
      return NextResponse.json({ answer })
    } catch (err) {
      console.warn('[nodi] provedor falhou — caindo pro determinístico:', (err as Error)?.message)
      void logNodiEvent(admin, { ...tele, event: 'provider_error', meta: { provider: provider.id } })
    }
  }

  // 4 — determinístico: melhor candidato fraco (confiança média) ou franqueza.
  if (candidates[0]) {
    void logNodiEvent(admin, { ...tele, event: 'answer_kb', meta: { kb: candidates[0].id, source: 'weak' } })
    const answer: NodiAnswer = {
      text: candidates[0].text,
      confidence: 'medium',
      source: 'kb',
      kbRefs: [candidates[0].id],
      actions: candidates[0].actions,
      offerSupport: true,
    }
    return NextResponse.json({ answer })
  }

  void logNodiEvent(admin, { ...tele, event: 'answer_none' })
  const answer: NodiAnswer = {
    text: NO_ANSWER_TEXT,
    confidence: 'low',
    source: 'none',
    kbRefs: [],
    actions: fallbackActions(),
    offerSupport: true,
  }
  return NextResponse.json({ answer })
}
