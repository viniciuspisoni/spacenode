// Gate mínimo de consentimento de marketing (lib/analytics/consent.ts).
//
// O que estes testes protegem: o padrão é NÃO consentido. Google Ads e Meta
// Pixel só podem carregar depois de um "Aceitar" explícito — qualquer outro
// estado (ausente, recusado, lixo no cookie) tem que responder false.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_COOKIE,
  marketingConsentClient,
  marketingConsentServer,
  parseConsentCookie,
} from '@/lib/analytics/consent'
import { metaPixelEnabled } from '@/lib/analytics/adapters/meta-pixel'

afterEach(() => { vi.unstubAllGlobals() })

/** Simula o browser com um cookie qualquer (ou sem cookie nenhum). */
function stubDocumentCookie(value: string) {
  vi.stubGlobal('document', { cookie: value })
}

describe('parseConsentCookie', () => {
  it('aceita só os dois valores do contrato', () => {
    expect(parseConsentCookie('granted')).toBe('granted')
    expect(parseConsentCookie('denied')).toBe('denied')
  })

  it('cookie é entrada hostil: qualquer outra coisa vira null', () => {
    for (const lixo of ['', 'true', '1', 'GRANTED', 'granted ', 'yes', '{}', null, undefined]) {
      expect(parseConsentCookie(lixo)).toBeNull()
    }
  })
})

describe('marketingConsentClient — padrão é negar', () => {
  it('sem document (SSR) não afirma consentimento', () => {
    expect(marketingConsentClient()).toBe(false)
  })

  it('sem o cookie, false', () => {
    stubDocumentCookie('sn_aid=abc; theme=dark')
    expect(marketingConsentClient()).toBe(false)
  })

  it('recusado, false', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=denied`)
    expect(marketingConsentClient()).toBe(false)
  })

  it('aceito, true', () => {
    stubDocumentCookie(`sn_aid=abc; ${CONSENT_COOKIE}=granted; theme=dark`)
    expect(marketingConsentClient()).toBe(true)
  })
})

describe('marketingConsentServer', () => {
  it('sem header de cookie, false', () => {
    expect(marketingConsentServer(null)).toBe(false)
    expect(marketingConsentServer(undefined)).toBe(false)
    expect(marketingConsentServer('')).toBe(false)
  })

  it('lê a escolha do header', () => {
    expect(marketingConsentServer(`${CONSENT_COOKIE}=granted`)).toBe(true)
    expect(marketingConsentServer(`${CONSENT_COOKIE}=denied`)).toBe(false)
    expect(marketingConsentServer(`sn_aid=x; ${CONSENT_COOKIE}=granted; y=1`)).toBe(true)
  })

  it('não confunde prefixo de outro cookie', () => {
    expect(marketingConsentServer(`${CONSENT_COOKIE}_other=granted`)).toBe(false)
  })
})

describe('adapter do Meta Pixel respeita as duas travas', () => {
  it('com consentimento mas sem env, segue desligado', () => {
    stubDocumentCookie(`${CONSENT_COOKIE}=granted`)
    expect(process.env.NEXT_PUBLIC_META_PIXEL_ID).toBeUndefined()
    expect(metaPixelEnabled()).toBe(false)
  })
})
