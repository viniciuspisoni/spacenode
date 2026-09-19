// Identidade e atribuição que viajam no metadata do Stripe até o webhook, e o
// registro de adapters server-side (Meta CAPI entra aí depois). Protege:
//
//   • ida e volta: o que o checkout grava, o webhook recompõe — anonymous_id,
//     campanha do último toque, página de entrada do primeiro toque;
//   • nada pessoal e nada além dos limites do Stripe (valores cortados);
//   • metadata ausente/estranho vira "sem atribuição", nunca lança;
//   • o consentimento é carregado como está e 'unknown' quando não há;
//   • um adapter que exige consentimento NUNCA recebe evento sem 'granted',
//     e o registro nasce vazio — nada sai do servidor hoje.

import { describe, expect, it, vi } from 'vitest'
import {
  attributionFromStripeMetadata,
  attributionToStripeMetadata,
  STRIPE_META_KEYS,
} from '@/lib/analytics/stripe-metadata'
import {
  adapterMayReceive,
  forwardServerEvent,
  registeredServerAdapters,
  type ServerAdapter,
  type ServerAdapterEvent,
} from '@/lib/analytics/server-adapters'
import type { AttributionSnapshot } from '@/lib/marketing/ads/naming'

const ANON = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

const SNAPSHOT: AttributionSnapshot = {
  first: {
    source: 'meta', medium: 'paid_social', campaign: 'sn_meta_aquisicao',
    content: 'video01', landing_path: '/lp/print-do-sketchup', at: '2026-09-10T10:00:00.000Z',
  },
  last: {
    source: 'google', medium: 'cpc', campaign: 'sn_search_marca',
    content: 'rsa02', landing_path: '/', at: '2026-09-17T18:30:00.000Z',
  },
}

describe('attributionToStripeMetadata', () => {
  it('grava identidade, último toque e página de ENTRADA (primeiro toque)', () => {
    const meta = attributionToStripeMetadata({ anonymousId: ANON, attribution: SNAPSHOT, consent: 'granted' })
    expect(meta).toEqual({
      sn_aid: ANON,
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'sn_search_marca',
      utm_content: 'rsa02',
      landing_path: '/lp/print-do-sketchup',
      attr_at: '2026-09-17T18:30:00.000Z',
      consent: 'granted',
    })
  })

  it('sem atribuição, só identidade e consentimento', () => {
    expect(attributionToStripeMetadata({ anonymousId: null, attribution: null, consent: 'unknown' }))
      .toEqual({ consent: 'unknown' })
    expect(attributionToStripeMetadata({ anonymousId: ANON, consent: 'denied' }))
      .toEqual({ sn_aid: ANON, consent: 'denied' })
  })

  it('corta valores longos e omite vazios (limites do Stripe)', () => {
    const meta = attributionToStripeMetadata({
      attribution: { last: { campaign: 'x'.repeat(600), content: '   ', at: '' } },
      consent: 'unknown',
    })
    expect(meta.utm_campaign).toHaveLength(200)
    expect(meta).not.toHaveProperty('utm_content')
    expect(meta).not.toHaveProperty('attr_at')
    expect(Object.keys(meta).every(k => k.length <= 40)).toBe(true)
  })
})

describe('attributionFromStripeMetadata', () => {
  it('ida e volta recompõe identidade, campanha e consentimento', () => {
    const meta = attributionToStripeMetadata({ anonymousId: ANON, attribution: SNAPSHOT, consent: 'granted' })
    const back = attributionFromStripeMetadata({ user_id: 'u1', plan_id: 'essence', ...meta })
    expect(back.anonymousId).toBe(ANON)
    expect(back.consent).toBe('granted')
    expect(back.attribution?.last).toEqual({
      source: 'google', medium: 'cpc', campaign: 'sn_search_marca', content: 'rsa02',
      landing_path: '/lp/print-do-sketchup', at: '2026-09-17T18:30:00.000Z',
    })
  })

  it('metadata ausente, vazio ou hostil vira sem atribuição', () => {
    for (const meta of [null, undefined, {}, { user_id: 'u1' }]) {
      const out = attributionFromStripeMetadata(meta)
      expect(out).toEqual({ anonymousId: null, attribution: null, consent: 'unknown' })
    }
    const hostile = attributionFromStripeMetadata({
      [STRIPE_META_KEYS.anonymousId]: 'not-a-uuid',
      [STRIPE_META_KEYS.consent]: 'yes',
    })
    expect(hostile.anonymousId).toBeNull()
    expect(hostile.consent).toBe('unknown')
  })
})

describe('server adapters', () => {
  const base: ServerAdapterEvent = {
    event: 'subscription_started', userId: 'u1', anonymousId: ANON, planId: 'essence',
    valueCents: 9900, page: null, occurredAt: null, dedupeKey: 'subscription:sub_1',
    consent: 'unknown', props: {},
  }

  it('o registro nasce vazio — nada sai do servidor', () => {
    expect(registeredServerAdapters()).toHaveLength(0)
  })

  it('adapter com consentimento obrigatório só recebe com granted', () => {
    const send = vi.fn(async () => {})
    const capi: ServerAdapter = {
      name: 'fake-capi', requiresConsent: true,
      accepts: new Set(['subscription_started', 'checkout_started']), send,
    }
    expect(adapterMayReceive(capi, { ...base, consent: 'unknown' })).toBe(false)
    expect(adapterMayReceive(capi, { ...base, consent: 'denied' })).toBe(false)
    expect(adapterMayReceive(capi, { ...base, consent: 'granted' })).toBe(true)
    expect(adapterMayReceive(capi, { ...base, consent: 'granted', event: 'landing_view' })).toBe(false)
  })

  it('forwardServerEvent respeita a regra e engole falha do adapter', async () => {
    const send = vi.fn(async () => { throw new Error('boom') })
    const capi: ServerAdapter = {
      name: 'fake-capi', requiresConsent: true, accepts: new Set(['subscription_started']), send,
    }
    await forwardServerEvent({ ...base, consent: 'denied' }, [capi])
    expect(send).not.toHaveBeenCalled()
    await expect(forwardServerEvent({ ...base, consent: 'granted' }, [capi])).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledTimes(1)
  })
})
