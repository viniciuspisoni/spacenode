import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '@/lib/marketing/ads/naming'
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
//   • bind_signup  — autenticado; o servidor lê o cookie sn_attribution da
//     própria requisição e vincula a atribuição ao usuário (evento de signup
//     imutável — on conflict do nothing no service).
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
      // Sem cookie de atribuição → nada a vincular (visita orgânica direta).
      if (!snapshot) return NextResponse.json({ ok: true })
      await bindSignupAttribution(admin, user.id, snapshot)
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
