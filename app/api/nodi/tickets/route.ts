// /api/nodi/tickets — chamados do Nodi
//
// POST → cria o chamado (só depois do usuário revisar e confirmar o resumo no
//        painel). Insert com o client do USUÁRIO — a policy insert_own do
//        nodi_tickets fecha o user_id no banco. Resposta traz o protocolo
//        (ND-<seq>) e o resumo de texto pra copiar/encaminhar no WhatsApp.
// GET  → lista os chamados do próprio usuário. Com ?all=1 e acesso interno
//        (isInternalStaff), lista os últimos de todos — a base de consulta
//        pro suporte enquanto não existe painel dedicado.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { isInternalStaff } from '@/lib/auth/privileged'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { describeUserAgent } from '@/lib/nodi/context'
import { createTicket, listMyTickets, ticketPlainSummary } from '@/lib/nodi/tickets'
import { logNodiEvent } from '@/lib/nodi/telemetry'
import type { TicketDraft } from '@/lib/nodi/types'

export async function POST(req: Request) {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `nodi-ticket:${user.id}`, 5, 300)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Você abriu vários chamados em poucos minutos. Aguarde um pouco — os anteriores já estão registrados.' },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => null) as { draft?: TicketDraft } | null
  const draft = body?.draft
  if (!draft || typeof draft !== 'object') {
    return NextResponse.json({ error: 'Chamado inválido' }, { status: 400 })
  }

  // Navegador/SO sempre do request real — não confiamos no que o client diz.
  const ua = describeUserAgent(req.headers.get('user-agent') ?? '')
  draft.context = { ...(draft.context ?? {}), browser: ua.browser, os: ua.os }

  try {
    const ticket = await createTicket(supabase, user.id, draft)
    void logNodiEvent(admin, {
      userId: user.id,
      event: 'ticket_created',
      route: draft.context?.route ?? null,
      module: draft.context?.module ?? null,
      meta: { category: ticket.category, kind: draft.context?.generationKind ?? 'none' },
    })
    return NextResponse.json({ ticket, summary: ticketPlainSummary(ticket, draft) })
  } catch (err) {
    const message = (err as Error)?.message ?? ''
    // 42P01 = migration ainda não aplicada — falha honesta, com caminho alternativo.
    if (message.includes('nodi_tickets') || /42P01|relation .* does not exist/i.test(message)) {
      console.error('[nodi] nodi_tickets ausente — aplicar migration 20260717120000_nodi_assistant.sql')
      return NextResponse.json(
        { error: 'O registro de chamados ainda não está disponível neste ambiente. Fale com o suporte pelo WhatsApp — o resumo pode ser copiado do painel.' },
        { status: 503 },
      )
    }
    console.error('[nodi] falha ao criar chamado:', message)
    return NextResponse.json({ error: 'Não consegui registrar o chamado. Tente de novo em instantes.' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const admin = createAdminClient()

  if (url.searchParams.get('all') === '1') {
    if (!(await isInternalStaff(admin, user))) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const { data, error } = await admin
      .from('nodi_tickets')
      .select('id, seq, user_id, status, priority, category, title, context, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tickets: data ?? [] })
  }

  try {
    const tickets = await listMyTickets(supabase, user.id, 10)
    return NextResponse.json({ tickets })
  } catch {
    // Tabela ausente (migration não aplicada) → lista vazia, sem quebrar o painel.
    return NextResponse.json({ tickets: [] })
  }
}
