// Gate de consentimento por categoria (lib/analytics/consent.ts).
//
// O que estes testes protegem:
//   1. o padrão é NÃO consentido — Google Ads, Meta Pixel e GA4 só podem
//      carregar depois de uma escolha explícita; qualquer outro estado
//      (ausente, recusado, lixo no cookie) responde false;
//   2. as categorias são independentes — aceitar análise não libera marketing;
//   3. a escolha de quem decidiu ANTES das categorias continua valendo, sem
//      pedir de novo (cookie legado 'granted'/'denied').

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_ALL,
  CONSENT_COOKIE,
  CONSENT_NONE,
  analyticsConsentClient,
  analyticsConsentServer,
  marketingConsentClient,
  marketingConsentServer,
  parseConsentCookie,
  readConsentState,
  serializeConsentState,
} from '@/lib/analytics/consent'
import { metaPixelEnabled } from '@/lib/analytics/adapters/meta-pixel'
import { ga4Enabled } from '@/lib/analytics/adapters/ga4'

afterEach(() => { vi.unstubAllGlobals() })

/** Simula o browser com um cookie qualquer (ou sem cookie nenhum). */
function stubDocumentCookie(value: string) {
  vi.stubGlobal('document', { cookie: value })
}

describe('parseConsentCookie', () => {
  it('lê o formato por categoria', () => {
    expect(parseConsentCookie('a1m1')).toEqual({ analytics: true,  marketing: true })
    expect(parseConsentCookie('a0m0')).toEqual({ analytics: false, marketing: false })
    expect(parseConsentCookie('a1m0')).toEqual({ analytics: true,  marketing: false })
    expect(parseConsentCookie('a0m1')).toEqual({ analytics: false, marketing: true })
  })

  it('preserva a escolha do gate binário anterior', () => {
    expect(parseConsentCookie('granted')).toEqual(CONSENT_ALL)
    expect(parseConsentCookie('denied')).toEqual(CONSENT_NONE)
  })

  it('cookie é entrada hostil: qualquer outra coisa vira null', () => {
    const lixo = ['', 'true', '1', 'GRANTED', 'granted ', 'yes', '{}', 'a1', 'm1',
                  'a2m0', 'a1m2', 'a1m1x', ' a1m1', null, undefined]
    for (const v of lixo) expect(parseConsentCookie(v)).toBeNull()
  })

  it('serializa no formato que sabe ler de volta', () => {
    for (const state of [CONSENT_ALL, CONSENT_NONE,
                         { analytics: true, marketing: false },
                         { analytics: false, marketing: true }]) {
      expect(parseConsentCookie(serializeConsentState(state))).toEqual(state)
    }
  })
})

describe('consentimento no client — padrão é negar', () => {
  it('sem document (SSR) não afirma consentimento', () => {
    expect(marketingConsentClient()).toBe(false)
    expect(analyticsConsentClient()).toBe(false)
  })

  it('sem o cookie, false', () => {
    stubDocumentCookie('sn_aid=abc; theme=dark')
    expect(marketingConsentClient()).toBe(false)
    expect(analyticsConsentClient()).toBe(false)
  })

  it('recusou as opcionais, false nas duas', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=a0m0`)
    expect(marketingConsentClient()).toBe(false)
    expect(analyticsConsentClient()).toBe(false)
  })

  it('aceitou todas, true nas duas', () => {
    stubDocumentCookie(`sn_aid=abc; ${CONSENT_COOKIE}=a1m1; theme=dark`)
    expect(marketingConsentClient()).toBe(true)
    expect(analyticsConsentClient()).toBe(true)
  })

  it('as categorias não vazam uma na outra', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=a1m0`)
    expect(analyticsConsentClient()).toBe(true)
    expect(marketingConsentClient()).toBe(false)

    stubDocumentCookie(`${CONSENT_COOKIE}=a0m1`)
    expect(analyticsConsentClient()).toBe(false)
    expect(marketingConsentClient()).toBe(true)
  })

  it('quem já tinha aceitado no gate binário continua aceito', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=granted`)
    expect(marketingConsentClient()).toBe(true)
    expect(analyticsConsentClient()).toBe(true)

    stubDocumentCookie(`${CONSENT_COOKIE}=denied`)
    expect(marketingConsentClient()).toBe(false)
    expect(analyticsConsentClient()).toBe(false)
  })
})

// readConsentState é o getSnapshot de um useSyncExternalStore: se devolver um
// objeto novo a cada chamada, o React entra em laço infinito de render. Este
// teste existe por causa de uma regressão real — o parse cru quebrou a página
// com "Maximum update depth exceeded".
describe('readConsentState devolve snapshot estável', () => {
  it('mesma referência enquanto o cookie não muda', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=a1m0`)
    const primeira = readConsentState()
    expect(readConsentState()).toBe(primeira)
    expect(readConsentState()).toBe(primeira)
  })

  it('referência nova quando o cookie muda', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=a1m0`)
    const antes = readConsentState()
    stubDocumentCookie(`${CONSENT_COOKIE}=a1m1`)
    const depois = readConsentState()
    expect(depois).not.toBe(antes)
    expect(depois).toEqual(CONSENT_ALL)
  })

  it('sem escolha, `null` — que já é estável', () => {
    stubDocumentCookie('theme=dark')
    expect(readConsentState()).toBeNull()
  })
})

describe('consentimento no server', () => {
  it('sem header de cookie, false', () => {
    for (const header of [null, undefined, '']) {
      expect(marketingConsentServer(header)).toBe(false)
      expect(analyticsConsentServer(header)).toBe(false)
    }
  })

  it('lê a escolha do header', () => {
    expect(marketingConsentServer(`${CONSENT_COOKIE}=a1m1`)).toBe(true)
    expect(marketingConsentServer(`${CONSENT_COOKIE}=a1m0`)).toBe(false)
    expect(analyticsConsentServer(`${CONSENT_COOKIE}=a1m0`)).toBe(true)
    expect(marketingConsentServer(`sn_aid=x; ${CONSENT_COOKIE}=granted; y=1`)).toBe(true)
  })

  it('não confunde prefixo de outro cookie', () => {
    expect(marketingConsentServer(`${CONSENT_COOKIE}_other=a1m1`)).toBe(false)
    expect(analyticsConsentServer(`${CONSENT_COOKIE}_other=a1m1`)).toBe(false)
  })
})

describe('adapters respeitam as duas travas (env + categoria)', () => {
  it('Meta Pixel: com consentimento mas sem env, segue desligado', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=a1m1`)
    expect(process.env.NEXT_PUBLIC_META_PIXEL_ID).toBeUndefined()
    expect(metaPixelEnabled()).toBe(false)
  })

  it('GA4: com consentimento mas sem env, segue desligado', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=a1m1`)
    expect(process.env.NEXT_PUBLIC_GA4_ID).toBeUndefined()
    expect(ga4Enabled()).toBe(false)
  })
})
