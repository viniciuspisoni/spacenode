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
import { isNodiV2EnabledFor, isNodiV3ExecuteEnabled } from '@/lib/nodi/v2/flags'
import { verifyIntent } from '@/lib/nodi/v3/intents'
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

  // Chamada interna com a sessão do usuário (cookies do request repassados).
  const origin = new URL(req.url).origin
  const upstream = await fetch(`${origin}/api/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      inputUrl: intent.params.inputUrl,
      anchorUrl: intent.params.anchorUrl,
      projectType: intent.params.projectType,
      engine: intent.params.engine,
      resolution: intent.params.resolution,
      refinementText: intent.params.refinementText,
    }),
  }).catch(() => null)

  if (!upstream) {
    return NextResponse.json({ error: 'Não consegui falar com o gerador agora. Nada foi debitado.' }, { status: 502 })
  }

  const payload = await upstream.json().catch(() => null) as
    | { outputUrl?: string; renderRecord?: { id?: string }; error?: string; message?: string }
    | null

  if (!upstream.ok || !payload?.outputUrl) {
    // o /api/generate já estorna em falha pós-débito; só repassamos a mensagem amigável
    const error = payload?.message ?? payload?.error ?? 'A geração falhou. Se houve débito, os nodes foram estornados.'
    void logNodiEvent(admin, { userId: user.id, event: 'v3_executed', meta: { kind: 'render', count: 0 } })
    return NextResponse.json({ error }, { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 })
  }

  void logNodiEvent(admin, {
    userId: user.id,
    event: 'v3_executed',
    meta: { kind: 'render', cost: intent.cost, count: 1 },
  })

  return NextResponse.json({
    outputUrl: payload.outputUrl,
    renderId: payload.renderRecord?.id ?? null,
    cost: intent.cost,
  })
}
