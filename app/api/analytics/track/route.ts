import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import {
  CLIENT_EVENTS,
  isAnalyticsEvent,
  sanitizeProps,
} from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'

// POST /api/analytics/track — coletor first-party do funil (rota pública:
// recebe sendBeacon de visitantes anônimos e de usuários logados).
//
// Mesmo contrato do /api/marketing/track: nada de terceiros aqui, o IP entra
// só na CHAVE do rate limit (nunca é persistido), erro interno vira {ok:false}
// 200 (best-effort — rastreamento não polui o console do visitante com 500).
//
// ANTI-SPOOF: só aceita eventos de CLIENT_EVENTS (lib/analytics/events.ts).
// Eventos de dinheiro/cadastro/geração nascem no servidor (rotas + webhook
// do Stripe) — um POST forjado aqui é recusado com 400.
//
// Identidade e atribuição NUNCA vêm do corpo: o servidor lê os cookies
// first-party (sn_aid, sn_attribution) e a sessão Supabase da própria
// requisição. O corpo leva só {event, props, page, referrer}.

const MAX_BODY_BYTES = 4096
const PAGE_RE = /^\/[\w\-/.%[\]]{0,200}$/

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Corpo da requisição muito grande' }, { status: 400 })
    }
    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('shape inválido')
      }
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const event = body.event
    if (!isAnalyticsEvent(event) || !CLIENT_EVENTS.has(event)) {
      return NextResponse.json({ error: 'Evento inválido' }, { status: 400 })
    }

    const admin = createAdminClient()
    const rl = await rateLimit(admin, `analytics:${clientIp(req)}`, 120, 60)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Muitas tentativas — aguarde um pouco' }, { status: 429 })
    }

    // Sessão é opcional: evento anônimo segue só com o sn_aid do cookie.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const page =
      typeof body.page === 'string' && PAGE_RE.test(body.page) ? body.page : null
    const referrer =
      typeof body.referrer === 'string' && body.referrer.length > 0
        ? body.referrer.slice(0, 300)
        : null

    const props = sanitizeProps(body.props)
    if (referrer) props.referrer = referrer

    await trackServerEvent(admin, {
      event,
      userId: user?.id ?? null,
      req,
      page,
      props,
      planId: typeof props.plan === 'string' ? props.plan : null,
      offerId: typeof props.offer === 'string' ? props.offer : null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.warn('[analytics/track] falha best-effort:', err)
    return NextResponse.json({ ok: false })
  }
}
