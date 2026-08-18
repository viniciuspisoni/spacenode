import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '@/lib/marketing/ads/naming'
import { ANON_COOKIE, INTENT_COOKIE, parseAnonymousId, parseIntentCookie } from '@/lib/analytics/attribution'
import {
  bindSignupAttribution,
  getLandingPageBySlug,
  recordAcquisitionEvent,
} from '@/lib/marketing/ads/service'

// POST /api/marketing/track — rastreamento first-party (rota pública, FORA do
// namespace admin: é chamada pelo browser de visitantes anônimos e usuários
// recém-cadastrados). Nada de terceiros — a política de privacidade promete
// "sem rastreadores de terceiros"; o IP só entra na CHAVE do rate limit, nunca
// é persistido em evento.
//
// Tipos aceitos:
//   • lp_cta_click — anônimo (sendBeacon do CTA); registra clique numa LP
//     publicada. Sem user_id, sem IP, sem echo de dados.
//   • bind_signup  — autenticado; o servidor lê os cookies first-party da
//     própria requisição (sn_attribution + sn_aid + sn_intent) e vincula a
//     atribuição ao usuário (evento de signup imutável — on conflict do
//     nothing no service). Roda também para cadastro orgânico (sem cookie de
//     campanha): o evento sai sem UTM, mas o funil conta o cadastro e o
//     anonymous_id associa a jornada pré-login.
//
// O funil completo do produto usa /api/analytics/track (catálogo tipado em
// lib/analytics/events.ts) — esta rota fica com os dois tipos legados acima.
//
// Erros de cliente viram 4xx; erro INTERNO vira {ok:false} 200 com
// console.warn — rastreamento é best-effort e não deve poluir o console do
// visitante com 500.

const SLUG_RE = /^[a-z0-9-]{1,80}$/
const MAX_BODY_BYTES = 2048

export async function POST(req: NextRequest) {
  try {
    // Corpo pequeno e controlado — comprimento do texto é aproximação
    // suficiente de bytes para o payload ASCII/JSON esperado.
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

    const admin = createAdminClient()

    if (body.type === 'bind_signup') {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
      }
      const rl = await rateLimit(admin, `mkt-track:${user.id}`, 10, 3600)
      if (!rl.allowed) {
        return NextResponse.json({ error: 'Muitas tentativas — aguarde um pouco' }, { status: 429 })
      }
      const snapshot = parseAttributionCookie(req.cookies.get(ATTRIBUTION_COOKIE)?.value)
      const anonymousId = parseAnonymousId(req.cookies.get(ANON_COOKIE)?.value)
      const intent = parseIntentCookie(req.cookies.get(INTENT_COOKIE)?.value)
      // O timestamp do evento é o do bind (1º acesso ao /app) — a data REAL do
      // cadastro vai no metadata para o funil não depender da hora do bind.
      await bindSignupAttribution(admin, user.id, snapshot, {
        account_created_at: user.created_at ?? null,
        ...(intent ? { plan_intent: intent.plan, plan_intent_offer: intent.offer ?? null } : {}),
      }, anonymousId)
      return NextResponse.json({ ok: true })
    }

    if (body.type === 'lp_cta_click') {
      const rl = await rateLimit(admin, `mkt-track:cta:${clientIp(req)}`, 60, 60)
      if (!rl.allowed) {
        return NextResponse.json({ error: 'Muitas tentativas — aguarde um pouco' }, { status: 429 })
      }
      const slug = body.slug
      if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
        return NextResponse.json({ error: 'Slug inválido' }, { status: 400 })
      }
      // Só registra clique de LP realmente publicada — slug inexistente não
      // gera evento nem revela nada (resposta idêntica).
      const page = await getLandingPageBySlug(admin, slug, { publishedOnly: true })
      if (page) {
        await recordAcquisitionEvent(admin, {
          event_type: 'lp_cta_click',
          landing_page_id: page.id,
          utm: {},
          anonymous_id: parseAnonymousId(req.cookies.get(ANON_COOKIE)?.value),
        })
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Tipo de evento inválido' }, { status: 400 })
  } catch (err) {
    console.warn('[marketing/track] falha best-effort:', err)
    return NextResponse.json({ ok: false })
  }
}
