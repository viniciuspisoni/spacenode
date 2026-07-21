// POST /api/nodi/v3/execute — executa uma intent CONFIRMADA pelo usuário.
//
// O token veio de propor_acao (assinado server-side: usuário, payload, custo,
// validade 10min). Verificado aqui, o request vira uma chamada SERVER-SIDE ao
// /api/generate com os COOKIES do próprio usuário — reusa o pipeline inteiro
// já batalhado (validações, débito atômico, estorno em falha, histórico,
// redação). Nada de caminho paralelo de cobrança. Débito só acontece porque o
// usuário confirmou uma proposta com custo explícito — nunca silencioso.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { isNodiMultimodalEnabled, isNodiV2EnabledFor, isNodiV3ExecuteEnabled } from '@/lib/nodi/v2/flags'
import { verifyIntent } from '@/lib/nodi/v3/intents'
import { executeRenderIntent } from '@/lib/nodi/v4/executor'
import { runAutoReview } from '@/lib/nodi/v4/review'
import { readSettings } from '@/lib/nodi/v4/settings'
import { logNodiEvent } from '@/lib/nodi/telemetry'

export const maxDuration = 300 // a geração roda dentro deste request (como no /api/generate)

export async function POST(req: Request) {
  if (!isNodiEnabled() || !isNodiV3ExecuteEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  if (!(await isNodiV2EnabledFor(admin, user))) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }

  const rl = await rateLimit(admin, `nodi-v3-exec:${user.id}`, 10, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas execuções na última hora. Aguarde um pouco.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as { intentToken?: unknown } | null
  const token = typeof body?.intentToken === 'string' ? body.intentToken : ''
  const intent = token ? verifyIntent(token, user.id) : null
  if (!intent) {
    return NextResponse.json(
      { error: 'Essa proposta expirou ou não é válida. Peça de novo que eu preparo outra.' },
      { status: 400 },
    )
  }

  // Executor compartilhado (mesma mecânica do autopiloto): chamada interna
  // com a sessão do usuário — débito/estorno/histórico do pipeline existente.
  const result = await executeRenderIntent(new URL(req.url).origin, req.headers.get('cookie') ?? '', intent)

  if (!result.ok || !result.outputUrl) {
    void logNodiEvent(admin, { userId: user.id, event: 'v3_executed', meta: { kind: 'render', count: 0 } })
    return NextResponse.json({ error: result.error }, { status: result.status ?? 502 })
  }

  void logNodiEvent(admin, {
    userId: user.id,
    event: 'v3_executed',
    meta: { kind: 'render', cost: intent.cost, auto: false, count: 1 },
  })

  // V4: avaliação visual automática (original × resultado) + decisão — não
  // bloqueia o sucesso da execução se falhar.
  let review: { summary: string; decision: string; reason: string; findings: unknown[] } | null = null
  const settings = await readSettings(supabase, user.id)
  if (settings.autoReview && isNodiMultimodalEnabled()) {
    const r = await runAutoReview(intent.params.inputUrl, result.outputUrl, 30_000)
    if (r) {
      review = {
        summary: r.report.summary,
        decision: r.outcome.decision,
        reason: r.outcome.reason,
        findings: r.report.findings,
      }
    }
  }

  return NextResponse.json({
    outputUrl: result.outputUrl,
    renderId: result.renderId ?? null,
    cost: intent.cost,
    review,
  })
}
