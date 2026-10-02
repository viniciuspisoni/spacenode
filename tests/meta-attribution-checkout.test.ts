// Atribuição de ponta a ponta da campanha de outubro/2026 — painel → link da
// Meta → visita → cadastro → 1ª imagem → checkout → webhook do Stripe →
// funil e importação de gasto do painel.
//
// Código real em todas as etapas (painel, rotas de cadastro/checkout/webhook,
// rastreamento server-side). Duplos só nas bordas: banco em memória
// (tests/helpers/memory-supabase.ts), sessão do usuário e SDK do Stripe.
//
// O que estes testes protegem:
//   • as URLs de marketing/ads/2026-10-LINKS-META-PRIMEIROS-PAGANTES.md são
//     exatamente as que o painel gera — o operador cola o que o painel mostra;
//   • com essas URLs, cadastro, 1ª imagem, checkout e assinatura caem na
//     campanha do painel, inclusive com a confirmação do e-mail e a compra
//     num navegador que não viu o anúncio;
//   • com os identificadores do plano antigo, a campanha do painel fica zerada
//     e o CSV de gasto é recusado (a incompatibilidade que motivou a troca).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemorySupabase, type MemorySupabase } from './helpers/memory-supabase'

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  user: null as Record<string, unknown> | null,
  sessions: [] as Array<Record<string, unknown>>,
  event: null as unknown,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.db }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { plan: 'free', stripe_customer_id: null, stripe_subscription_id: null } }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }), clientIp: () => '127.0.0.1' }))
vi.mock('stripe', () => {
  class StripeError extends Error { code?: string }
  class Stripe {
    static errors = { StripeError }
    customers = { retrieve: async () => ({ id: 'cus_e2e' }) }
    subscriptions = { retrieve: async () => ({ status: 'active', metadata: {} }), list: async () => ({ data: [] }) }
    prices = { retrieve: async () => ({ unit_amount: 9900 }) }
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          mocks.sessions.push(params)
          return { id: `cs_test_${mocks.sessions.length}`, url: 'https://checkout.stripe.com/c/pay/cs_test' }
        },
      },
    }
    webhooks = { constructEvent: () => mocks.event }
  }
  return { default: Stripe }
})

import { POST as trackPOST } from '@/app/api/marketing/track/route'
import { POST as checkoutPOST } from '@/app/api/stripe/checkout/route'
import { POST as webhookPOST } from '@/app/api/stripe/webhook/route'
import { trackServerEvent } from '@/lib/analytics/server'
import { signupAttributionMetadata } from '@/lib/analytics/signup-attribution'
import { parseMetricsCsv } from '@/lib/marketing/ads/csv'
import {
  mergeAttribution,
  parseAttributionCookie,
  serializeAttributionCookie,
  touchFromSearchParams,
} from '@/lib/marketing/ads/naming'
import {
  bindSignupAttribution,
  createAd,
  createCampaign,
  getFunnelSnapshot,
  resolveMetricIdentifiers,
} from '@/lib/marketing/ads/service'
import type { Ad, AdCampaign } from '@/lib/marketing/ads/types'

const ORIGIN = 'https://spacenode.app'
const LINKS_DOC = 'marketing/ads/2026-10-LINKS-META-PRIMEIROS-PAGANTES.md'
const ANON_INSTAGRAM = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const ENV_KEYS = [
  'VERCEL_ENV', 'NEXT_PUBLIC_APP_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_ESSENCE_MONTHLY',
] as const
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

let db: MemorySupabase
let campaign: AdCampaign
let adA: Ad
let adB: Ad

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const period = () => ({ periodStart: day(-1), periodEnd: day(1) })
const events = () => db.rows('marketing.acquisition_events')

/** Requisição vinda do site publicado (host de produção — não é tráfego interno). */
function siteRequest(path: string, body: unknown, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return new NextRequest(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': 'spacenode.app',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  Object.assign(process.env, {
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_APP_URL: ORIGIN,
    STRIPE_SECRET_KEY: 'sk_test_e2e',
    STRIPE_WEBHOOK_SECRET: 'whsec_e2e',
    STRIPE_PRICE_ID_ESSENCE_MONTHLY: 'price_essence_monthly_e2e',
  })
  db = createMemorySupabase(
    { 'marketing.ad_channels': [{ slug: 'meta', name: 'Meta', status: 'enabled' }] },
    { grant_plan_nodes: () => ({ data: { applied: true, granted: 800, balance: 880 }, error: null }) },
  )
  mocks.db = db

  // O operador cria no painel exatamente o que o documento manda.
  campaign = await createCampaign(db as never, {
    name: 'Primeiros pagantes — out/2026', channel_slug: 'meta', front: 'conversao',
    objective: 'conversao', funnel_stage: 'topo', persona: 'arquiteto202610',
  } as never, 'admin-e2e')
  adA = await createAd(db as never, {
    campaign_id: campaign.id, promise: 'apresentacao', creative_label: 'video20', copy_variant: 'copy01', destination_path: '/',
  } as never, 'admin-e2e')
  adB = await createAd(db as never, {
    campaign_id: campaign.id, promise: 'respeito', creative_label: 'estatico', copy_variant: 'copy01', destination_path: '/',
  } as never, 'admin-e2e')
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('links da Meta = o que o painel gera', () => {
  it('identificadores e URLs do documento do operador batem com o painel', () => {
    const doc = readFileSync(join(__dirname, '..', LINKS_DOC), 'utf8')
    const urls = [...doc.matchAll(/`(https:\/\/spacenode\.app\/\?[^`]+)`/g)].map(m => m[1])
    expect(campaign.identifier).toBe('SN_META_CONVERSAO_ARQUITETO202610')
    expect(urls).toEqual([adA.destination_url, adB.destination_url])
    for (const id of [campaign.identifier, adA.identifier, adB.identifier]) expect(doc).toContain(id)
    const a = new URL(adA.destination_url!)
    expect(a.origin + a.pathname).toBe(`${ORIGIN}/`)
    expect(a.searchParams.get('utm_campaign')).toBe(campaign.identifier.toLowerCase())
    expect(a.searchParams.get('utm_content')).toBe(adA.identifier.toLowerCase())
  })
})

describe('clique no anúncio A → venda atribuída à campanha no painel', () => {
  it('cadastro confirmado e compra feitos num navegador que não viu o anúncio', async () => {
    // 1. Clique no navegador do Instagram: a Meta acrescenta o fbclid.
    const click = new URL(adA.destination_url!)
    click.searchParams.set('fbclid', 'IwAR-teste-clique')
    const touch = touchFromSearchParams(click.searchParams, {
      referrer: 'https://l.instagram.com/', path: click.pathname, now: new Date().toISOString(),
    })!
    const instagramCookie = serializeAttributionCookie(mergeAttribution(null, touch))

    // 2. Cadastro por e-mail ali: o signUp grava a origem na conta.
    mocks.user = {
      id: 'user-e2e', email: 'teste@teste.invalid', created_at: new Date().toISOString(),
      user_metadata: signupAttributionMetadata({
        attribution: parseAttributionCookie(instagramCookie), anonymousId: ANON_INSTAGRAM, next: '/app',
      }),
    }

    // 3. Confirmação aberta pelo app de e-mail: 1º acesso ao /app SEM cookies do anúncio.
    const bind = await trackPOST(siteRequest('/api/marketing/track', { type: 'bind_signup' }))
    expect(await bind.json()).toEqual({ ok: true, bound: true })

    // 4. Primeira imagem (o que /api/generate grava ao concluir a 1ª render).
    await trackServerEvent(db as never, {
      event: 'first_generation', userId: 'user-e2e', req: siteRequest('/api/generate', {}),
      feature: 'renderizar', dedupeKey: 'first-render:user-e2e',
    })

    // 5. Checkout no mesmo navegador sem cookies.
    const checkout = await checkoutPOST(siteRequest('/api/stripe/checkout', { type: 'plan', id: 'essence', billing: 'monthly' }))
    expect(await checkout.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test' })
    const session = mocks.sessions.at(-1)!
    const campaignMeta = {
      utm_source: 'meta',
      utm_campaign: 'sn_meta_conversao_arquiteto202610',
      utm_content: 'sn_meta_conversao_arquiteto202610_apresentacao_video20_copy01',
      sn_aid: ANON_INSTAGRAM,
    }
    expect(session.metadata).toMatchObject({ user_id: 'user-e2e', plan_id: 'essence', ...campaignMeta })
    expect((session.subscription_data as { metadata: Record<string, string> }).metadata).toMatchObject(campaignMeta)

    // 6. Stripe confirma o pagamento (cartão).
    mocks.event = {
      id: 'evt_e2e', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
      data: { object: {
        id: 'cs_test_1', metadata: session.metadata, payment_status: 'paid',
        subscription: 'sub_e2e', customer: 'cus_e2e', amount_total: 9900, currency: 'brl',
      } },
    }
    const webhook = await webhookPOST(new NextRequest(`${ORIGIN}/api/stripe/webhook`, {
      method: 'POST', headers: { 'stripe-signature': 't=1,v1=teste' }, body: '{}',
    }))
    expect(webhook.status).toBe(200)
    expect(db.rpcCalls).toEqual([expect.objectContaining({
      fn: 'grant_plan_nodes',
      args: expect.objectContaining({ user_id_input: 'user-e2e', amount: 800, source_id_input: 'sub_e2e' }),
    })])

    // 7. Cada etapa do funil carrega a campanha e o anúncio do painel.
    const byType = Object.fromEntries(events().map(e => [e.event_type, e]))
    for (const type of ['signup', 'checkout_started', 'subscription_started']) {
      expect(byType[type]).toMatchObject({
        user_id: 'user-e2e',
        campaign_identifier: campaign.identifier.toLowerCase(),
        ad_identifier: adA.identifier.toLowerCase(),
        is_internal: false,
      })
    }
    expect(byType.signup.metadata).toMatchObject({ attribution_source: 'account' })
    expect(byType.subscription_started).toMatchObject({ value_cents: 9900, dedupe_key: 'subscription:sub_e2e' })

    // 8. O painel conta a venda na campanha.
    const funnel = await getFunnelSnapshot(db as never, { ...period(), campaignId: campaign.id })
    expect(funnel.totals).toMatchObject({
      signups: 1, activations: 1, checkouts_started: 1, subscriptions: 1, revenue_cents: 9900,
    })
  })

  it('o CSV de gasto com os nomes da Meta casa com os anúncios do painel', async () => {
    const csv = [
      'data,identificador,impressoes,cliques,investimento',
      `${day(0)},${adA.identifier},1200,30,"25,00"`,
      `${day(0)},${adB.identifier},900,12,"25,00"`,
    ].join('\n')
    const parsed = parseMetricsCsv(csv)
    expect(parsed.errors).toEqual([])
    const { rows, errors } = await resolveMetricIdentifiers(db as never, parsed.rows)
    expect(errors).toEqual([])
    expect(rows.map(r => [r.level, r.entity_id, r.spend_cents])).toEqual([['ad', adA.id, 2500], ['ad', adB.id, 2500]])
  })
})

describe('reprodução: identificadores do plano antigo', () => {
  it('cadastro com utm_campaign=sn_primeiros_pagantes_202610 não entra na campanha e o CSV é recusado', async () => {
    const before = await getFunnelSnapshot(db as never, { ...period(), campaignId: campaign.id })
    await bindSignupAttribution(db as never, 'user-plano-antigo', {
      last: {
        source: 'meta', medium: 'paid_social', campaign: 'sn_primeiros_pagantes_202610',
        content: 'apresentacao_video20', at: new Date().toISOString(),
      },
    }, {}, null, { origin: 'paid' })
    const after = await getFunnelSnapshot(db as never, { ...period(), campaignId: campaign.id })
    expect(after.totals.signups).toBe(before.totals.signups)

    const parsed = parseMetricsCsv(`data,identificador,impressoes,cliques,investimento\n${day(0)},sn_primeiros_pagantes_202610,100,3,"10,00"`)
    const { errors } = await resolveMetricIdentifiers(db as never, parsed.rows)
    expect(errors[0]?.message).toMatch(/não encontrado/)
  })
})
