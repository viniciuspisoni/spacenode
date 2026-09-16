// Cenários de cadastro do funil first-party (fases 1–3 do port da branch
// analytics-funnel). O que estes testes protegem:
//
//   • cadastro ORGÂNICO gera evento de signup — o bug que existia em dois
//     gates (cliente e servidor) e cegava o denominador do funil;
//   • cadastro PAGO continua preservando first+last touch;
//   • anonymous_id (sn_aid) é o único ponto de associação anônimo→usuário;
//   • atribuição NUNCA é inventada quando não há campanha;
//   • signup é único por usuário (índice parcial uq_mkt_acq_signup_per_user);
//   • o browser não consegue forjar identidade nem evento server-only;
//   • sem env de terceiro, nenhum adapter externo age.
//
// Sem rede e sem banco: o cliente Supabase é um duplo que captura o insert.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSignupAttribution, recordAcquisitionEvent } from '@/lib/marketing/ads/service'
import type { AttributionSnapshot } from '@/lib/marketing/ads/naming'
import { parseAnonymousId } from '@/lib/analytics/attribution'
import { CLIENT_EVENTS, isAnalyticsEvent, sanitizeProps } from '@/lib/analytics/events'
import { ga4Enabled, ga4Track } from '@/lib/analytics/adapters/ga4'
import { metaPixelEnabled, metaPixelTrack } from '@/lib/analytics/adapters/meta-pixel'

type Row = Record<string, unknown>
interface PgError { code: string; message: string }

/** Duplo do client: captura inserts e permite enfileirar erros do Postgres
 *  (23505 = índice único; 42703 = coluna inexistente, banco sem a migration). */
function fakeAdmin(queue: Array<PgError | null> = []) {
  const rows: Row[] = []
  const client = {
    schema: () => ({
      from: () => ({
        insert: async (row: Row) => {
          const error = queue.shift() ?? null
          if (!error) rows.push(row)
          return { error }
        },
      }),
    }),
  }
  // O service só usa .schema().from().insert() — o cast evita arrastar todo o
  // tipo do supabase-js para um duplo de três métodos.
  return { admin: client as never, rows }
}

const PAID: AttributionSnapshot = {
  first: {
    source: 'google', medium: 'cpc', campaign: 'SN_SEARCH_MARCA',
    content: 'RSA01', gclid: 'g-abc', landing_path: '/lp/print-do-sketchup',
    at: '2026-09-01T10:00:00.000Z',
  },
  last: {
    source: 'meta', medium: 'paid_social', campaign: 'SN_META_PROSPECCAO',
    content: 'VIDEO03', fbclid: 'fb-xyz', landing_path: '/lp/planta-humanizada',
    at: '2026-09-14T18:30:00.000Z',
  },
}

const ANON = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

afterEach(() => { vi.unstubAllGlobals() })

// ── A — cadastro vindo de campanha ────────────────────────────────────────────

describe('A · signup pago', () => {
  it('grava um único evento com user_id, anonymous_id e first+last touch', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'user-pago', PAID, { account_created_at: 'x' }, ANON)

    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.event_type).toBe('signup')
    expect(row.user_id).toBe('user-pago')
    expect(row.anonymous_id).toBe(ANON)

    // Os dois toques sobrevivem — é o que permite first-touch E last-touch
    // sobre a MESMA linha imutável na fase de atribuição por JOIN.
    const utm = row.utm as AttributionSnapshot
    expect(utm.first?.source).toBe('google')
    expect(utm.first?.gclid).toBe('g-abc')
    expect(utm.last.source).toBe('meta')
    expect(utm.last.fbclid).toBe('fb-xyz')

    // Colunas desnormalizadas seguem o LAST touch, normalizadas em minúsculo.
    expect(row.campaign_identifier).toBe('sn_meta_prospeccao')
    expect(row.ad_identifier).toBe('video03')

    expect((row.metadata as Record<string, unknown>).organic).toBe(false)
  })
})

// ── B — cadastro orgânico (o bug que esta fase conserta) ──────────────────────

describe('B · signup orgânico', () => {
  it('grava o evento mesmo sem cookie de atribuição', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'user-organico', null, {}, ANON)

    expect(rows).toHaveLength(1)
    expect(rows[0].event_type).toBe('signup')
    expect(rows[0].user_id).toBe('user-organico')
  })

  it('preserva o anonymous_id — a jornada anônima continua ligável', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'user-organico', null, {}, ANON)
    expect(rows[0].anonymous_id).toBe(ANON)
  })

  it('NÃO inventa atribuição: utm vazio e identificadores null', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'user-organico', null, {}, ANON, { origin: 'organic' })

    const row = rows[0]
    expect(row.utm).toEqual({})
    expect(row.campaign_identifier).toBeNull()
    expect(row.ad_identifier).toBeNull()
    expect(row.referrer).toBeNull()
    // `organic` é marcador explícito — nunca um source fabricado.
    expect(row.origin).toBe('organic')
    expect((row.metadata as Record<string, unknown>).organic).toBe(true)
  })
})

// ── C — sem sn_aid prévio ─────────────────────────────────────────────────────

describe('C · signup sem sn_aid', () => {
  it('grava o signup mesmo assim, com anonymous_id null', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'user-sem-aid', null, {})

    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe('user-sem-aid')
    // Fallback seguro: perde-se o join da jornada anônima, nunca o cadastro.
    expect(rows[0].anonymous_id).toBeNull()
  })

  it('cookie corrompido vira null em vez de virar id', () => {
    for (const lixo of ['', 'null', 'undefined', 'abc', '../../etc', '<script>', ANON + 'x']) {
      expect(parseAnonymousId(lixo)).toBeNull()
    }
    expect(parseAnonymousId(ANON.toUpperCase())).toBe(ANON)
  })
})

// ── D — retorno do usuário já vinculado ───────────────────────────────────────

describe('D · reload / login posterior', () => {
  it('conflito do índice único (23505) não gera segundo signup nem lança', async () => {
    const { admin, rows } = fakeAdmin([null, { code: '23505', message: 'duplicate key' }])

    await bindSignupAttribution(admin, 'user-repetido', PAID, {}, ANON)
    await bindSignupAttribution(admin, 'user-repetido', PAID, {}, ANON)

    expect(rows).toHaveLength(1)
  })
})

// ── E — o browser não manda em nada ───────────────────────────────────────────

describe('E · anti-spoof', () => {
  it('eventos de dinheiro/cadastro/geração não saem do browser', () => {
    for (const serverOnly of [
      'signup_completed', 'checkout_started', 'checkout_completed',
      'subscription_started', 'subscription_cancelled', 'project_created',
      'generation_started', 'generation_completed', 'generation_failed',
    ] as const) {
      expect(CLIENT_EVENTS.has(serverOnly)).toBe(false)
    }
  })

  it('nome de evento fora do catálogo é recusado', () => {
    for (const forjado of ['subscription_started ', 'SIGNUP', 'drop table', '', null, 42, {}]) {
      expect(isAnalyticsEvent(forjado)).toBe(false)
    }
  })

  it('props não carregam identidade nem atribuição forjada', () => {
    // O coletor monta o evento a partir dos COOKIES; o que vier em props é
    // apenas metadata. Objetos aninhados (um snapshot falso, por exemplo) são
    // descartados por sanitizeProps antes de chegar ao banco.
    const sujo = sanitizeProps({
      user_id: 'admin',
      utm: { last: { source: 'google' } },
      attribution: PAID,
      nested: { a: 1 },
      ok: 'valor',
    })
    expect(sujo.utm).toBeUndefined()
    expect(sujo.attribution).toBeUndefined()
    expect(sujo.nested).toBeUndefined()
    expect(sujo.ok).toBe('valor')
    // `user_id` sobrevive como STRING solta em metadata, mas não é identidade:
    // a coluna user_id vem da sessão no servidor, nunca do corpo.
    expect(sujo.user_id).toBe('admin')
  })
})

// ── F — terceiros desligados ──────────────────────────────────────────────────

describe('F · providers externos ausentes', () => {
  it('GA4 e Meta Pixel ficam desabilitados sem env', () => {
    expect(process.env.NEXT_PUBLIC_GA4_ID).toBeUndefined()
    expect(process.env.NEXT_PUBLIC_META_PIXEL_ID).toBeUndefined()
    expect(ga4Enabled()).toBe(false)
    expect(metaPixelEnabled()).toBe(false)
  })

  it('chamar os adapters não faz requisição nem lança', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(() => ga4Track('landing_view', { page: '/' })).not.toThrow()
    expect(() => metaPixelTrack('plans_viewed', { source: 'landing' })).not.toThrow()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('o first-party continua gravando com os terceiros desligados', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'user-sem-terceiros', null, {}, ANON)
    expect(rows).toHaveLength(1)
  })
})

// ── Degradação quando a migration ainda não foi aplicada ──────────────────────

describe('banco atrás das migrations (deploy fora de ordem)', () => {
  // A escada tem DOIS degraus, um por migration: primeiro cai para o shape do
  // funil completo (20260818000000), só depois para o shape original. Um banco
  // na versão intermediária não perde anonymous_id/dedupe_key por causa das
  // colunas de confiabilidade (20260916173000).
  it('sem as colunas de confiabilidade → mantém as do funil completo', async () => {
    const { admin, rows } = fakeAdmin([{ code: '42703', message: 'column origin does not exist' }])
    await recordAcquisitionEvent(admin, {
      event_type: 'signup',
      user_id: 'user-intermediario',
      anonymous_id: ANON,
      page: '/app',
      origin: 'unknown',
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].anonymous_id).toBe(ANON)
    expect(rows[0]).not.toHaveProperty('origin')
    expect(rows[0]).not.toHaveProperty('is_internal')
  })

  it('sem nenhuma das duas → regrava com o shape antigo, evento não se perde', async () => {
    const { admin, rows } = fakeAdmin([
      { code: '42703', message: 'column origin does not exist' },
      { code: '42703', message: 'column anonymous_id does not exist' },
    ])
    await recordAcquisitionEvent(admin, {
      event_type: 'signup',
      user_id: 'user-legado',
      anonymous_id: ANON,
      page: '/app',
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe('user-legado')
    // O shape antigo não tem as colunas novas — é exatamente o ponto.
    expect(rows[0]).not.toHaveProperty('anonymous_id')
    expect(rows[0]).not.toHaveProperty('dedupe_key')
  })

  it('PGRST204 (cache do PostgREST) segue o mesmo caminho', async () => {
    const { admin, rows } = fakeAdmin([
      { code: 'PGRST204', message: 'schema cache' },
      { code: 'PGRST204', message: 'schema cache' },
    ])
    await recordAcquisitionEvent(admin, { event_type: 'lp_view', anonymous_id: ANON })
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('anonymous_id')
  })
})
