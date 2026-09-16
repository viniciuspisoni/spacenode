// Confiabilidade do funil de aquisição — o que estes testes protegem, medido
// em produção em 16/09/26 (144 contas, 70 sem evento de signup):
//
//   • data de cadastro é a de auth.users, NUNCA a hora em que o evento foi
//     gravado (o bind roda no 1º acesso ao /app — vimos conta de 10/09 com
//     evento gravado em 16/09);
//   • `unknown` é um valor de primeira classe: ausência de cookie de campanha
//     não vira "orgânico";
//   • tráfego de dev/preview é MARCADO (nunca apagado) e fica fora do relatório;
//   • gravação que falha devolve `false` — quem grava flag permanente no
//     browser precisa saber a diferença entre "gravado" e "respondeu 200".
//
// Sem rede e sem banco: o cliente Supabase é um duplo que captura o insert.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bindSignupAttribution,
  classifySignupOrigin,
  recordAcquisitionEvent,
} from '@/lib/marketing/ads/service'
import type { AttributionSnapshot } from '@/lib/marketing/ads/naming'
import {
  isBotUserAgent,
  isInternalHost,
  isInternalRequest,
  isNonProductionRuntime,
} from '@/lib/analytics/internal'

type Row = Record<string, unknown>
interface PgError { code: string; message: string }

/** Duplo do client: captura inserts, enfileira erros do Postgres e responde
 *  select() com as linhas que o teste programar (jornada anônima). */
function fakeAdmin(opts: { errors?: Array<PgError | null>; journey?: Row[]; selectError?: PgError } = {}) {
  const queue = [...(opts.errors ?? [])]
  const rows: Row[] = []
  const client = {
    schema: () => ({
      from: () => ({
        insert: async (row: Row) => {
          const error = queue.shift() ?? null
          if (!error) rows.push(row)
          return { error }
        },
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: opts.selectError ? null : (opts.journey ?? []),
              error: opts.selectError ?? null,
            }),
          }),
        }),
      }),
    }),
  }
  return { admin: client as never, rows }
}

const ANON = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const CONTA_CRIADA_EM = '2026-09-10T21:40:15.897Z'

const PAGO: AttributionSnapshot = {
  last: {
    source: 'meta', medium: 'paid_social', campaign: 'SN_META_AQUISICAO',
    content: 'VIDEO03', at: '2026-09-15T18:30:00.000Z',
  },
}

// ── 1 · a data do cadastro ────────────────────────────────────────────────────

describe('1 · occurred_at é a data do cadastro, não a do bind', () => {
  it('signup carrega occurred_at = auth.users.created_at', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'u1', null, {}, ANON, {
      accountCreatedAt: CONTA_CRIADA_EM,
      origin: 'unknown',
    })
    expect(rows[0].occurred_at).toBe(CONTA_CRIADA_EM)
  })

  it('sem data conhecida, a coluna é OMITIDA (o default do banco assume)', async () => {
    // Mandar `null` explodiria contra o NOT NULL: default só vale para coluna
    // ausente do INSERT.
    const { admin, rows } = fakeAdmin()
    await recordAcquisitionEvent(admin, { event_type: 'lp_view' })
    expect(rows[0]).not.toHaveProperty('occurred_at')
  })

  it('a hora do bind continua registrada (created_at do banco) — nada se perde', async () => {
    // O insert não manda created_at: quem carimba é o default da tabela. O
    // teste fixa o contrato de que o código NÃO sobrescreve esse carimbo.
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'u1', null, {}, ANON, {
      accountCreatedAt: CONTA_CRIADA_EM,
    })
    expect(rows[0]).not.toHaveProperty('created_at')
  })
})

// ── 2 · origem: desconhecido ≠ orgânico ───────────────────────────────────────

describe('2 · origem nunca é inventada', () => {
  it('sem cookie e sem jornada anônima → unknown', async () => {
    const { admin } = fakeAdmin()
    expect(await classifySignupOrigin(admin, null, null)).toBe('unknown')
  })

  it('sem cookie e com jornada VAZIA → unknown (não há o que observar)', async () => {
    const { admin } = fakeAdmin({ journey: [] })
    expect(await classifySignupOrigin(admin, null, ANON)).toBe('unknown')
  })

  it('jornada observada sem marcador pago → organic (evidência positiva)', async () => {
    const { admin } = fakeAdmin({
      journey: [
        { campaign_identifier: null, ad_identifier: null },
        { campaign_identifier: null, ad_identifier: null },
      ],
    })
    expect(await classifySignupOrigin(admin, null, ANON)).toBe('organic')
  })

  it('jornada com marcador de campanha → paid mesmo sem cookie no bind', async () => {
    const { admin } = fakeAdmin({
      journey: [
        { campaign_identifier: null, ad_identifier: null },
        { campaign_identifier: 'sn_meta_aquisicao', ad_identifier: null },
      ],
    })
    expect(await classifySignupOrigin(admin, null, ANON)).toBe('paid')
  })

  it('cookie de campanha → paid sem nem consultar a jornada', async () => {
    const { admin } = fakeAdmin({ selectError: { code: '42501', message: 'nunca chamado' } })
    expect(await classifySignupOrigin(admin, PAGO, ANON)).toBe('paid')
  })

  it('falha ao ler a jornada → unknown, jamais organic', async () => {
    const { admin } = fakeAdmin({ selectError: { code: '08006', message: 'connection failure' } })
    expect(await classifySignupOrigin(admin, null, ANON)).toBe('unknown')
  })

  it('o default do bind sem origem explícita é unknown, não organic', async () => {
    const { admin, rows } = fakeAdmin()
    await bindSignupAttribution(admin, 'u2', null, {}, ANON)
    expect(rows[0].origin).toBe('unknown')
    expect((rows[0].metadata as Record<string, unknown>).organic).toBe(false)
  })

  it('evento comum sem origem explícita: paid com marcador, unknown sem — nunca NULL', async () => {
    // Se a coluna nascesse NULL nas linhas novas, um "group by origin"
    // misturaria "sem informação" com "campo não preenchido".
    const { admin, rows } = fakeAdmin()
    await recordAcquisitionEvent(admin, {
      event_type: 'lp_view',
      utm: { utm_source: 'meta', utm_campaign: 'SN_META_AQUISICAO' },
    })
    await recordAcquisitionEvent(admin, { event_type: 'lp_view', utm: {} })
    expect(rows[0].origin).toBe('paid')
    expect(rows[1].origin).toBe('unknown')
  })
})

// ── 3 · tráfego interno ───────────────────────────────────────────────────────

describe('3 · dev/preview separado do mercado', () => {
  const ENV = { ...process.env }
  beforeEach(() => { process.env.VERCEL_ENV = 'production' })
  afterEach(() => { process.env = { ...ENV } })

  it('host de produção é público', () => {
    expect(isInternalHost('spacenode.app')).toBe(false)
    expect(isInternalHost('www.spacenode.app')).toBe(false)
    expect(isInternalHost('SpaceNode.App')).toBe(false)
  })

  it('localhost, porta alternativa, IP e preview são internos', () => {
    for (const host of [
      'localhost', 'localhost:3000', 'localhost:3200', '127.0.0.1:3000',
      '[::1]:3000', 'spacenode-git-feat-x.vercel.app', 'staging.spacenode.app',
    ]) {
      expect(isInternalHost(host), host).toBe(true)
    }
  })

  it('a allowlist é configurável por env', () => {
    process.env.ANALYTICS_PUBLIC_HOSTS = 'spacenode.com.br, www.spacenode.com.br'
    expect(isInternalHost('spacenode.com.br')).toBe(false)
    expect(isInternalHost('spacenode.app')).toBe(true)
  })

  it('request de dev é interna; request de produção não', () => {
    const req = (host: string) => new Request('https://x/api', { headers: { host } })
    expect(isInternalRequest(req('localhost:3200'))).toBe(true)
    expect(isInternalRequest(req('spacenode.app'))).toBe(false)
    // x-forwarded-host (Vercel) tem precedência sobre host.
    const fwd = new Request('https://x/api', {
      headers: { host: 'spacenode.app', 'x-forwarded-host': 'preview.vercel.app' },
    })
    expect(isInternalRequest(fwd)).toBe(true)
  })

  it('sem header de host, o evento NÃO é escondido (não é interno)', () => {
    expect(isInternalHost(null)).toBe(false)
    expect(isInternalRequest(null)).toBe(false)
  })

  it('ambiente fora de produção é interno mesmo com host bom', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(isNonProductionRuntime()).toBe(true)
    process.env.VERCEL_ENV = 'production'
    expect(isNonProductionRuntime()).toBe(false)
  })

  it('rastreador de link é robô, navegador de gente não é', () => {
    // O rastreador do Meta respondeu por 184 dos 217 IPs distintos da landing
    // page em 16/09/26 — e chega pelo host de PRODUÇÃO, então só o user agent
    // o distingue.
    for (const ua of [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'meta-externalagent/1.1',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Twitterbot/1.0',
      'WhatsApp/2.23.20.0',
      'Mozilla/5.0 HeadlessChrome/120.0.0.0',
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true)
    }
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 Instagram 300.0',
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(false)
    }
    // Sem user agent NÃO é motivo para esconder visita: errar aqui some com
    // gente de verdade e o erro não aparece em lugar nenhum.
    expect(isBotUserAgent(null)).toBe(false)
    expect(isBotUserAgent('')).toBe(false)
  })

  it('a marcação vai para a coluna, e o default é false', async () => {
    const { admin, rows } = fakeAdmin()
    await recordAcquisitionEvent(admin, { event_type: 'lp_view', is_internal: true })
    await recordAcquisitionEvent(admin, { event_type: 'lp_view' })
    expect(rows[0].is_internal).toBe(true)
    expect(rows[1].is_internal).toBe(false)
  })
})

// ── 4 · gravação confirmada ───────────────────────────────────────────────────

describe('4 · o cliente só para de tentar quando o evento existe', () => {
  it('insert bem-sucedido → true', async () => {
    const { admin } = fakeAdmin()
    expect(await bindSignupAttribution(admin, 'u3', null, {}, ANON)).toBe(true)
  })

  it('conflito do índice único (23505) → true: o evento JÁ existe', async () => {
    const { admin } = fakeAdmin({ errors: [{ code: '23505', message: 'duplicate key' }] })
    expect(await bindSignupAttribution(admin, 'u3', null, {}, ANON)).toBe(true)
  })

  it('falha real de escrita → false, para o browser tentar de novo', async () => {
    const { admin } = fakeAdmin({
      errors: [
        { code: '08006', message: 'connection failure' },
        { code: '08006', message: 'connection failure' },
      ],
    })
    expect(await bindSignupAttribution(admin, 'u3', null, {}, ANON)).toBe(false)
  })

  it('erro inesperado não lança — rastreamento nunca derruba produto', async () => {
    const admin = {
      schema: () => ({ from: () => ({ insert: () => { throw new Error('boom') } }) }),
    } as never
    await expect(bindSignupAttribution(admin, 'u3', null, {}, ANON)).resolves.toBe(false)
  })
})
