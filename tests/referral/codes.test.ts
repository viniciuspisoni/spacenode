import { describe, it, expect } from 'vitest'
import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  isReferralCode,
  normalizeReferralCode,
  referralLink,
  referralShareMessage,
} from '@/lib/referral/codes'

describe('normalização do código', () => {
  it('aceita o código canônico', () => {
    expect(normalizeReferralCode('A2B3C4D5')).toBe('A2B3C4D5')
  })

  it('aceita o que a pessoa realmente cola', () => {
    expect(normalizeReferralCode(' a2b3-c4d5 ')).toBe('A2B3C4D5')
    expect(normalizeReferralCode('a2b3 c4d5')).toBe('A2B3C4D5')
  })

  it('recusa comprimento errado', () => {
    expect(normalizeReferralCode('A2B3C4D')).toBeNull()
    expect(normalizeReferralCode('A2B3C4D55')).toBeNull()
  })

  it('recusa os caracteres ambíguos que o gerador nunca produz', () => {
    for (const ambiguous of ['0', 'O', '1', 'I']) {
      expect(normalizeReferralCode(`A2B3C4D${ambiguous}`)).toBeNull()
    }
  })

  it('recusa entrada não textual', () => {
    expect(normalizeReferralCode(null)).toBeNull()
    expect(normalizeReferralCode(undefined)).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
  })

  it('o alfabeto do gerador passa pela própria validação', () => {
    expect(REFERRAL_CODE_ALPHABET.length).toBe(32)
    const sample = REFERRAL_CODE_ALPHABET.slice(0, REFERRAL_CODE_LENGTH)
    expect(isReferralCode(sample)).toBe(true)
    for (const char of REFERRAL_CODE_ALPHABET) {
      expect(isReferralCode(char.repeat(REFERRAL_CODE_LENGTH))).toBe(true)
    }
  })
})

describe('link de convite', () => {
  it('monta a URL do convite', () => {
    expect(referralLink('A2B3C4D5', 'https://spacenode.app')).toBe(
      'https://spacenode.app/convite/A2B3C4D5',
    )
  })

  it('não duplica a barra da origem', () => {
    expect(referralLink('A2B3C4D5', 'https://spacenode.app/')).toBe(
      'https://spacenode.app/convite/A2B3C4D5',
    )
  })

  it('a mensagem de compartilhamento carrega o link e nada de urgência', () => {
    const msg = referralShareMessage('https://spacenode.app/convite/A2B3C4D5')
    expect(msg).toContain('https://spacenode.app/convite/A2B3C4D5')
    expect(msg).toMatch(/10%/)
    expect(msg.toLowerCase()).not.toMatch(/imperd|últim|corra|promoç/)
  })
})
