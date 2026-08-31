// /api/nodi/diagnose — fluxo "Estou com um problema"
//
// GET  → últimas gerações do usuário (todas as fontes), pro seletor do painel.
// POST → { kind, id }: reexecuta a consulta de status daquela geração e monta
//        o relatório (status, motor, nodes, problema conhecido). Também
//        enriquece o contexto do futuro chamado com plano/navegador — tudo
//        já redigido no servidor.
//
// Segurança: queries com o client do USUÁRIO (RLS) + eq(user_id). O texto
// bruto de erro do provider não sai do servidor (ver lib/nodi/diagnostics).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { describeUserAgent } from '@/lib/nodi/context'
import { diagnoseGeneration, listRecentGenerations } from '@/lib/nodi/diagnostics'
import { logNodiEvent } from '@/lib/nodi/telemetry'
import { getPayerBalance } from '@/lib/workspaces/balance'
import type { GenerationKind } from '@/lib/nodi/types'

const KINDS: GenerationKind[] = ['render', 'edit', 'video', 'upscale', 'vista']

export async function GET() {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const generations = await listRecentGenerations(supabase, user.id, 6)
  return NextResponse.json({ generations })
}

export async function POST(req: Request) {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `nodi-diagnose:${user.id}`, 30, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas consultas em sequência. Aguarde alguns segundos.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as { kind?: unknown; id?: unknown } | null
  const kind = KINDS.includes(body?.kind as GenerationKind) ? (body?.kind as GenerationKind) : null
  const id = typeof body?.id === 'string' && body.id.length > 0 && body.id.length <= 60 ? body.id : null
  if (!kind || !id) {
    return NextResponse.json({ error: 'Informe a geração (kind + id).' }, { status: 400 })
  }

  const report = await diagnoseGeneration(supabase, user.id, kind, id)
  if (!report) {
    return NextResponse.json({ error: 'Não encontrei essa geração na sua conta.' }, { status: 404 })
  }

  // Enriquecimento server-side do contexto do chamado: plano do pagador +
  // navegador/SO (do próprio request). Falha aqui não derruba o diagnóstico.
  try {
    const balance = await getPayerBalance(admin, user.id)
    if (balance?.planId) report.collected.planId = String(balance.planId)
  } catch {}
  const ua = describeUserAgent(req.headers.get('user-agent') ?? '')
  report.collected.browser = ua.browser
  report.collected.os = ua.os

  void logNodiEvent(admin, {
    userId: user.id,
    event: 'diagnose_run',
    module: null,
    meta: { kind, issue: report.known?.id ?? 'none' },
  })

  return NextResponse.json({ report })
}
