import { describe, it, expect } from 'vitest'
import {
  isLaunchOfferOpen,
  launchOfferPrice,
  launchOfferDeadlineLabel,
  formatBRL,
  LAUNCH_OFFER_ENDS_AT,
  LAUNCH_OFFER_PERCENT_OFF,
} from '@/lib/launch-offer'
import { PLANS } from '@/lib/plans'

const MINUTE = 60 * 1000

describe('janela da campanha', () => {
  it('está aberta antes do fim', () => {
    expect(isLaunchOfferOpen(new Date(LAUNCH_OFFER_ENDS_AT.getTime() - MINUTE))).toBe(true)
  })

  it('fecha depois do fim', () => {
    expect(isLaunchOfferOpen(new Date(LAUNCH_OFFER_ENDS_AT.getTime() + MINUTE))).toBe(false)
  })

  it('inclui o instante exato do fim', () => {
    expect(isLaunchOfferOpen(new Date(LAUNCH_OFFER_ENDS_AT.getTime()))).toBe(true)
  })
})

describe('preço com desconto', () => {
  it('corta metade do valor', () => {
    expect(LAUNCH_OFFER_PERCENT_OFF).toBe(50)
    expect(launchOfferPrice(199)).toBe(99.5)
    expect(launchOfferPrice(89)).toBe(44.5)
  })

  it('nenhum plano vira preço quebrado feio (todos caem em .50)', () => {
    for (const plan of PLANS) {
      const discounted = launchOfferPrice(plan.monthlyPrice)
      expect(discounted * 2).toBe(plan.monthlyPrice)
      expect(formatBRL(discounted)).toMatch(/^\d+(\.\d{3})*,50$/)
    }
  })
})

describe('formatBRL', () => {
  it('não põe centavos em valor inteiro', () => {
    expect(formatBRL(199)).toBe('199')
    expect(formatBRL(1990)).toBe('1.990')
  })

  it('sempre usa duas casas quando há centavos', () => {
    expect(formatBRL(99.5)).toBe('99,50')
    expect(formatBRL(349.5)).toBe('349,50')
  })
})

describe('rótulo do prazo', () => {
  it('é estável entre servidor e cliente (timezone fixa)', () => {
    // Sem `timeZone` explícita, um servidor em UTC renderizaria "1 de setembro"
    // e o browser em BRT "31 de agosto" — hydration mismatch na landing.
    const original = process.env.TZ
    process.env.TZ = 'UTC'
    const utc = launchOfferDeadlineLabel()
    process.env.TZ = 'America/Sao_Paulo'
    const brt = launchOfferDeadlineLabel()
    process.env.TZ = original
    expect(utc).toBe(brt)
  })
})
