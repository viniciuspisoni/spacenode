import { describe, expect, it } from 'vitest'
import { CONTACT_NOTICE_VERSION, needsContactCapture, normalizeWhatsApp, parseContactInput } from '@/lib/customer-contact/validation'

describe('WhatsApp obrigatório', () => {
  it('normaliza celular brasileiro e formato internacional', () => {
    for (const value of ['(11) 99999-1234', '11999991234', '+55 (11) 99999-1234', '5511999991234']) {
      expect(normalizeWhatsApp(value)).toBe('+5511999991234')
    }
    expect(normalizeWhatsApp('+351 912 345 678')).toBe('+351912345678')
  })
  it('rejeita vazio, fixo brasileiro, lixo e prefixos ambíguos', () => {
    for (const value of ['', '123', '11 3333-4444', '++5511999991234', '5511+999991234',
      '+5500999991234', '+5511888888888', '11999991234abc', '+00000000000', {}, null, '+1234567890123456']) {
      expect(normalizeWhatsApp(value)).toBeNull()
    }
  })
  it('aceita cadastro sem aceitar ajuda proativa ou ofertas', () => {
    expect(parseContactInput({ whatsapp: '11999991234', support_opt_in: false,
      marketing_opt_in: false, notice_version: CONTACT_NOTICE_VERSION })).toMatchObject({
      whatsapp_e164: '+5511999991234', support_opt_in: false, marketing_opt_in: false,
    })
  })
  it('não aceita identidade, privilégio ou prova de consentimento vindos do navegador', () => {
    const input = { whatsapp: '11999991234', support_opt_in: true, marketing_opt_in: false,
      notice_version: CONTACT_NOTICE_VERSION }
    for (const extra of [{ user_id: 'other' }, { signup_exempt: true }, { whatsapp_verified_at: 'now' }]) {
      expect(parseContactInput({ ...input, ...extra })).toBeNull()
    }
    expect(parseContactInput({ ...input, marketing_opt_in: 'true' })).toBeNull()
    expect(parseContactInput({ ...input, notice_version: 'old' })).toBeNull()
  })
  it('exige WhatsApp de novos usuários e preserva contas anteriores à migração', () => {
    expect(needsContactCapture(null)).toBe(true)
    expect(needsContactCapture({ whatsapp_e164: null, support_opt_in: false, marketing_opt_in: false, signup_exempt: true })).toBe(false)
    expect(needsContactCapture({ whatsapp_e164: '+5511999991234', support_opt_in: false, marketing_opt_in: false, signup_exempt: false })).toBe(false)
  })
})
