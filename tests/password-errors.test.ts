// Senha vazada/fraca recusada pelo Supabase Auth vira mensagem em português
// (lib/auth/password-errors.ts) — cadastro e troca de senha.

import { describe, expect, it } from 'vitest'
import { AuthApiError, AuthWeakPasswordError, createClient } from '@supabase/supabase-js'
import { LEAKED_PASSWORD_MESSAGE, weakPasswordMessage } from '@/lib/auth/password-errors'

describe('weakPasswordMessage', () => {
  it('senha vazada (pwned) → mensagem de vazamento', () => {
    expect(weakPasswordMessage(new AuthWeakPasswordError('weak', 422, ['pwned']))).toBe(LEAKED_PASSWORD_MESSAGE)
  })

  it('vazada vence os outros motivos', () => {
    expect(weakPasswordMessage(new AuthWeakPasswordError('weak', 422, ['length', 'pwned']))).toBe(LEAKED_PASSWORD_MESSAGE)
  })

  it('curta demais → mínimo de caracteres', () => {
    expect(weakPasswordMessage(new AuthWeakPasswordError('weak', 422, ['length']))).toMatch(/pelo menos 6/)
  })

  it('aceita o formato serializado (code + reasons)', () => {
    expect(weakPasswordMessage({ code: 'weak_password', reasons: ['pwned'] })).toBe(LEAKED_PASSWORD_MESSAGE)
    expect(weakPasswordMessage({ code: 'weak_password' })).toMatch(/fraca/)
  })

  it('outros erros seguem para a tradução de quem chamou', () => {
    expect(weakPasswordMessage(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBeNull()
    expect(weakPasswordMessage(null)).toBeNull()
    expect(weakPasswordMessage(new Error('rede'))).toBeNull()
  })
})

describe('resposta real do Supabase Auth com a proteção ligada', () => {
  // Corpo que o GoTrue devolve quando a senha está no HaveIBeenPwned.
  const gotrueWeakPassword = () =>
    new Response(JSON.stringify({
      code: 'weak_password',
      message: 'Password is known to be weak and easy to guess, please choose a different one.',
      weak_password: { reasons: ['pwned'] },
    }), {
      status: 422,
      headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
    })

  it('signUp com senha vazada chega como erro mapeável', async () => {
    const supabase = createClient('https://exemplo.supabase.co', 'sb_publishable_teste', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => gotrueWeakPassword() },
    })
    const { error } = await supabase.auth.signUp({ email: 'arq@example.com', password: 'senha123' })
    expect(error).not.toBeNull()
    expect(weakPasswordMessage(error)).toBe(LEAKED_PASSWORD_MESSAGE)
  })
})
