// Identificadores, UTMs e atribuição first-party — a convenção SN_* é a chave
// que liga clique → cadastro → assinatura; regressão aqui quebra a atribuição
// inteira, então o contrato de lib/marketing/ads/naming.ts é fixado em teste.

import { describe, expect, it } from 'vitest'
import {
  appendUtmToUrl,
  buildIdentifier,
  buildUtmParams,
  mergeAttribution,
  parseAttributionCookie,
  parseIdentifier,
  sanitizeSegment,
  serializeAttributionCookie,
  touchFromSearchParams,
  type AttributionTouch,
} from '@/lib/marketing/ads/naming'

describe('sanitizeSegment', () => {
  it('remove acentos e sobe para maiúsculas', () => {
    expect(sanitizeSegment('prospecção')).toBe('PROSPECCAO')
    expect(sanitizeSegment('Arquiteto Autônomo')).toBe('ARQUITETOAUTONOMO')
  })

  it('remove espaços e símbolos, preservando dígitos', () => {
    expect(sanitizeSegment('video 01!')).toBe('VIDEO01')
    expect(sanitizeSegment('copy_02-b')).toBe('COPY02B')
  })

  it('devolve vazio quando não sobra nada', () => {
    expect(sanitizeSegment('!!!')).toBe('')
    expect(sanitizeSegment('')).toBe('')
  })
})

describe('buildIdentifier', () => {
  it('monta o identificador completo do plano', () => {
    expect(
      buildIdentifier({
        channel: 'meta',
        objective: 'prospeccao',
        persona: 'arquiteto',
        promise: 'fidelidade',
        creative: 'video01',
        copy: 'copy02',
      }),
    ).toBe('SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_VIDEO01_COPY02')
  })

  it('omite segmentos opcionais (identificador de campanha)', () => {
    expect(
      buildIdentifier({ channel: 'META', objective: 'PROSPECCAO', persona: 'ARQUITETO' }),
    ).toBe('SN_META_PROSPECCAO_ARQUITETO')
  })

  it('sanitiza acentos/espaços em cada segmento', () => {
    expect(
      buildIdentifier({ channel: 'meta', objective: 'prospecção', persona: 'arquiteto autônomo' }),
    ).toBe('SN_META_PROSPECCAO_ARQUITETOAUTONOMO')
  })

  it('lança quando falta canal, objetivo ou persona', () => {
    expect(() =>
      buildIdentifier({ channel: 'meta', objective: '', persona: 'arquiteto' }),
    ).toThrow('Identificador exige canal, objetivo e persona')
    expect(() =>
      buildIdentifier({ channel: '!!!', objective: 'prospeccao', persona: 'arquiteto' }),
    ).toThrow()
  })
})

describe('parseIdentifier', () => {
  it('faz o roundtrip do identificador de anúncio', () => {
    const id = buildIdentifier({
      channel: 'meta',
      objective: 'prospeccao',
      persona: 'arquiteto',
      promise: 'fidelidade',
      creative: 'video01',
      copy: 'copy02',
    })
    expect(parseIdentifier(id)).toEqual({
      channel: 'META',
      objective: 'PROSPECCAO',
      persona: 'ARQUITETO',
      promise: 'FIDELIDADE',
      creative: 'VIDEO01',
      copy: 'COPY02',
    })
  })

  it('aceita identificador de campanha (opcionais undefined)', () => {
    const parsed = parseIdentifier('SN_META_PROSPECCAO_ARQUITETO')
    expect(parsed).not.toBeNull()
    expect(parsed?.channel).toBe('META')
    expect(parsed?.promise).toBeUndefined()
    expect(parsed?.creative).toBeUndefined()
  })

  it('rejeita prefixo errado, segmentos de menos e lixo', () => {
    expect(parseIdentifier('XX_META_PROSPECCAO_ARQUITETO')).toBeNull()
    expect(parseIdentifier('SN_META_PROSPECCAO')).toBeNull()
    expect(parseIdentifier('')).toBeNull()
    expect(parseIdentifier('qualquer coisa')).toBeNull()
  })
})

describe('buildUtmParams', () => {
  it('meta → paid_social, tudo minúsculo', () => {
    const utm = buildUtmParams({
      channelSlug: 'meta',
      campaignIdentifier: 'SN_META_PROSPECCAO_ARQUITETO',
      adIdentifier: 'SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_VIDEO01_COPY02',
      objective: 'prospeccao',
      persona: 'Arquiteto Autônomo',
    })
    expect(utm.source).toBe('meta')
    expect(utm.medium).toBe('paid_social')
    expect(utm.campaign).toBe('sn_meta_prospeccao_arquiteto')
    expect(utm.content).toBe('sn_meta_prospeccao_arquiteto_fidelidade_video01_copy02')
    expect(utm.term).toBe('arquitetoautonomo')
  })

  it('google_ads → cpc com source google', () => {
    const utm = buildUtmParams({
      channelSlug: 'google_ads',
      campaignIdentifier: 'SN_GOOGLE_CONVERSAO_ARQUITETO',
    })
    expect(utm.source).toBe('google')
    expect(utm.medium).toBe('cpc')
  })

  it('objetivo remarketing sobrepõe o medium do canal', () => {
    const utm = buildUtmParams({
      channelSlug: 'meta',
      campaignIdentifier: 'SN_META_REMARKETING_ARQUITETO',
      objective: 'remarketing',
    })
    expect(utm.medium).toBe('remarketing')
  })

  it('canal desconhecido cai no slug sanitizado', () => {
    const utm = buildUtmParams({ channelSlug: 'canal_novo', campaignIdentifier: 'SN_X_Y_Z' })
    expect(utm.source).toBe('canalnovo')
    expect(utm.medium).toBe('paid_social')
  })
})

describe('appendUtmToUrl', () => {
  const utm = {
    source: 'meta',
    medium: 'paid_social',
    campaign: 'sn_meta_prospeccao_arquiteto',
    content: 'sn_meta_prospeccao_arquiteto_fidelidade_video01_copy02',
  }

  it('preserva a query existente e acrescenta os UTMs', () => {
    const out = new URL(appendUtmToUrl('https://exemplo.com/pagina?a=1', utm))
    expect(out.searchParams.get('a')).toBe('1')
    expect(out.searchParams.get('utm_source')).toBe('meta')
    expect(out.searchParams.get('utm_medium')).toBe('paid_social')
    expect(out.searchParams.get('utm_content')).toBe(utm.content)
    expect(out.hostname).toBe('exemplo.com')
  })

  it('resolve caminho relativo contra spacenode.app', () => {
    const out = new URL(appendUtmToUrl('/lp/render-sem-espera?ref=x', utm))
    expect(out.origin).toBe('https://spacenode.app')
    expect(out.pathname).toBe('/lp/render-sem-espera')
    expect(out.searchParams.get('ref')).toBe('x')
    expect(out.searchParams.get('utm_campaign')).toBe(utm.campaign)
  })

  it('omite utm_term/utm_content quando ausentes', () => {
    const out = new URL(appendUtmToUrl('/login', { source: 'meta', medium: 'paid_social', campaign: 'c' }))
    expect(out.searchParams.has('utm_content')).toBe(false)
    expect(out.searchParams.has('utm_term')).toBe(false)
  })
})

describe('parseAttributionCookie', () => {
  const touch: AttributionTouch = {
    source: 'meta',
    campaign: 'sn_meta_prospeccao_arquiteto',
    at: '2026-07-18T12:00:00.000Z',
  }

  it('lixo e shapes inválidos viram null (conteúdo do browser — nunca confiar)', () => {
    expect(parseAttributionCookie(undefined)).toBeNull()
    expect(parseAttributionCookie(null)).toBeNull()
    expect(parseAttributionCookie('')).toBeNull()
    expect(parseAttributionCookie('nao-e-json')).toBeNull()
    expect(parseAttributionCookie('%')).toBeNull()
    expect(parseAttributionCookie(encodeURIComponent('{"foo":1}'))).toBeNull()
    // last sem `at` não é um toque válido
    expect(parseAttributionCookie(encodeURIComponent('{"last":{"source":"meta"}}'))).toBeNull()
  })

  it('faz roundtrip de um snapshot válido', () => {
    const snapshot = { last: touch, first: { ...touch, source: 'google', at: '2026-07-01T00:00:00.000Z' } }
    const parsed = parseAttributionCookie(serializeAttributionCookie(snapshot))
    expect(parsed).toEqual(snapshot)
  })

  it('trunca campos acima de 300 caracteres', () => {
    const raw = encodeURIComponent(
      JSON.stringify({ last: { source: 'x'.repeat(400), at: '2026-07-18T12:00:00.000Z' } }),
    )
    const parsed = parseAttributionCookie(raw)
    expect(parsed?.last.source).toHaveLength(300)
  })

  it('descarta chaves fora do shape', () => {
    const raw = encodeURIComponent(
      JSON.stringify({ last: { ...touch, senha: 'hunter2' }, extra: true }),
    )
    const parsed = parseAttributionCookie(raw)
    expect(parsed).toEqual({ last: touch })
  })
})

describe('mergeAttribution', () => {
  const t1: AttributionTouch = { source: 'google', at: '2026-07-01T00:00:00.000Z' }
  const t2: AttributionTouch = { source: 'meta', at: '2026-07-18T00:00:00.000Z' }

  it('primeiro toque vira first e last quando não há snapshot', () => {
    expect(mergeAttribution(null, t1)).toEqual({ last: t1, first: t1 })
  })

  it('atualiza o last e preserva o first existente', () => {
    const merged = mergeAttribution({ last: t1, first: t1 }, t2)
    expect(merged.last).toEqual(t2)
    expect(merged.first).toEqual(t1)
  })

  it('snapshot antigo sem first promove o last anterior a first', () => {
    const merged = mergeAttribution({ last: t1 }, t2)
    expect(merged.first).toEqual(t1)
  })
})

describe('touchFromSearchParams', () => {
  const ctx = { referrer: 'https://l.facebook.com/', path: '/lp/render-sem-espera', now: '2026-07-18T12:00:00.000Z' }

  it('sem sinal de campanha → null (não grava cookie à toa)', () => {
    expect(touchFromSearchParams(new URLSearchParams(''), ctx)).toBeNull()
    // utm_term sozinho não é sinal de campanha
    expect(touchFromSearchParams(new URLSearchParams('utm_term=arquiteto&foo=bar'), ctx)).toBeNull()
  })

  it('captura utm_* + contexto', () => {
    const touch = touchFromSearchParams(
      new URLSearchParams('utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto'),
      ctx,
    )
    expect(touch).not.toBeNull()
    expect(touch?.source).toBe('meta')
    expect(touch?.medium).toBe('paid_social')
    expect(touch?.campaign).toBe('sn_meta_prospeccao_arquiteto')
    expect(touch?.referrer).toBe(ctx.referrer)
    expect(touch?.landing_path).toBe(ctx.path)
    expect(touch?.at).toBe(ctx.now)
  })

  it('gclid/fbclid sozinhos já são sinal', () => {
    const gclid = touchFromSearchParams(new URLSearchParams('gclid=abc123'), { now: ctx.now })
    expect(gclid?.gclid).toBe('abc123')
    const fbclid = touchFromSearchParams(new URLSearchParams('fbclid=xyz'), { now: ctx.now })
    expect(fbclid?.fbclid).toBe('xyz')
  })
})
