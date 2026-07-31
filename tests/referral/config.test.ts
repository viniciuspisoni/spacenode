import { describe, it, expect } from 'vitest'
import {
  MAX_PERCENT_OFF_PER_INVOICE,
  REFERRALS_FOR_FREE_MONTH,
  REFERRAL_PROGRAM_STARTS_AT,
  REFERRED_PERCENT_OFF,
  REFERRER_PERCENT_OFF,
  isReferralProgramOpen,
  resolveCheckoutDiscount,
} from '@/lib/referral/config'
import { LAUNCH_OFFER_ENDS_AT } from '@/lib/launch-offer'

const MINUTE = 60 * 1000
const before = new Date(REFERRAL_PROGRAM_STARTS_AT.getTime() - MINUTE)
const after  = new Date(REFERRAL_PROGRAM_STARTS_AT.getTime() + MINUTE)

describe('janela do programa', () => {
  it('fica fechado antes da entrada em vigor', () => {
    expect(isReferralProgramOpen(before)).toBe(false)
  })

  it('abre no instante exato', () => {
    expect(isReferralProgramOpen(REFERRAL_PROGRAM_STARTS_AT)).toBe(true)
  })

  it('segue aberto depois', () => {
    expect(isReferralProgramOpen(after)).toBe(true)
  })

  it('começa exatamente quando a promoção de lançamento acaba', () => {
    // 1 segundo entre 31/08 23:59:59 e 01/09 00:00:00 — as janelas não se
    // sobrepõem por um único instante.
    expect(REFERRAL_PROGRAM_STARTS_AT.getTime() - LAUNCH_OFFER_ENDS_AT.getTime()).toBe(1000)
  })
})

describe('regras de valor', () => {
  it('cinco indicações fecham uma mensalidade', () => {
    expect(REFERRER_PERCENT_OFF * REFERRALS_FOR_FREE_MONTH).toBe(MAX_PERCENT_OFF_PER_INVOICE)
    expect(REFERRALS_FOR_FREE_MONTH).toBe(5)
  })

  it('o indicado recebe 10%', () => {
    expect(REFERRED_PERCENT_OFF).toBe(10)
  })
})

describe('não-acúmulo com a promoção de lançamento', () => {
  const base = {
    hasPendingReferral: true,
    firstSubscription:  true,
    billing:            'monthly' as const,
  }

  it('lançamento vence quando as duas seriam elegíveis', () => {
    const d = resolveCheckoutDiscount({ ...base, launchEligible: true, now: before })
    expect(d).toEqual({ kind: 'launch', percentOff: 50 })
  })

  it('indicação não entra enquanto a campanha de lançamento estiver no ar', () => {
    // launchEligible false (ex.: já assinou antes) mas a campanha aberta:
    // ainda assim nada de indicação — nenhum desconto se soma ao lançamento.
    const d = resolveCheckoutDiscount({ ...base, launchEligible: false, now: before })
    expect(d.kind).toBe('none')
  })

  it('indicação entra assim que o programa vigora', () => {
    const d = resolveCheckoutDiscount({ ...base, launchEligible: false, now: after })
    expect(d).toEqual({ kind: 'referral', percentOff: 10 })
  })

  it('nunca devolve os dois descontos', () => {
    for (const launchEligible of [true, false]) {
      for (const now of [before, after]) {
        const d = resolveCheckoutDiscount({ ...base, launchEligible, now })
        expect(['launch', 'referral', 'none']).toContain(d.kind)
      }
    }
  })
})

describe('elegibilidade do indicado', () => {
  const open = { launchEligible: false, now: after }

  it('exige indicação vinculada', () => {
    expect(resolveCheckoutDiscount({
      ...open, hasPendingReferral: false, firstSubscription: true, billing: 'monthly',
    }).kind).toBe('none')
  })

  it('é da PRIMEIRA mensalidade — reassinatura não conta', () => {
    expect(resolveCheckoutDiscount({
      ...open, hasPendingReferral: true, firstSubscription: false, billing: 'monthly',
    }).kind).toBe('none')
  })

  it('não vale no ciclo anual', () => {
    expect(resolveCheckoutDiscount({
      ...open, hasPendingReferral: true, firstSubscription: true, billing: 'annual',
    }).kind).toBe('none')
  })
})
