import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { rateLimit } from '@/lib/rate-limit'
import {
  generateAdBrief,
  isAdBriefFront,
  type AdBriefInput,
} from '@/lib/marketing/ads/generation'

// Geração IA de brief de anúncio. Sempre entra como rascunho (brief editorial +
// anúncio draft quando há campanha) — nada publica nem ativa gasto. Rate limit
// fail-open (lib/rate-limit) para conter custo de token por staff.

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { admin, user } = gate.ctx

    const rl = await rateLimit(admin, 'ads-generate:' + user.id, 20, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Limite de gerações por hora atingido — aguarde para gerar novamente.' },
        { status: 429 },
      )
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const front = typeof body.front === 'string' ? body.front : ''
    if (!isAdBriefFront(front)) {
      throw new Error('Frente inválida — use problema, demonstracao, produto ou conversao')
    }

    const input: AdBriefInput = {
      campaign_id: optStr(body.campaign_id) ?? null,
      front,
      persona: typeof body.persona === 'string' ? body.persona : '',
      pain: optStr(body.pain),
      promise: optStr(body.promise),
      format: optStr(body.format),
      funnel_stage: optStr(body.funnel_stage),
      extra_context: optStr(body.extra_context),
    }

    const result = await generateAdBrief(admin, input, user.id)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
