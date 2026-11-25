// CAPTCHA (Turnstile) nos formulários de senha — achado R1 da auditoria
// 2026-11-25.
//
// Com "Bot and Abuse Protection" ligado no Supabase Auth, TODA chamada de
// signUp / signInWithPassword / signInWithOtp / resetPasswordForEmail /
// signInAnonymously sem captchaToken é recusada. Este teste varre o código de
// browser e falha se alguma dessas chamadas não passar o token — quem criar um
// formulário novo e esquecer o CAPTCHA quebra o teste, não o login em produção.

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isCaptchaError } from '@/lib/auth/turnstile'

const ROOT = join(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib']
const CAPTCHA_GUARDED = /\.auth\.(signUp|signInWithPassword|signInWithOtp|resetPasswordForEmail|signInAnonymously)\(/g

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** Texto da chamada a partir do `(` até o parêntese que fecha. */
function callText(source: string, openParen: number): string {
  let depth = 0
  for (let i = openParen; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')' && --depth === 0) return source.slice(openParen, i + 1)
  }
  return source.slice(openParen)
}

describe('CAPTCHA nos formulários de senha', () => {
  const calls = SCAN_DIRS
    .flatMap(dir => sourceFiles(join(ROOT, dir)))
    .flatMap(file => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(CAPTCHA_GUARDED)].map(match => ({
        where: `${relative(ROOT, file)} → ${match[1]}`,
        text: callText(source, match.index! + match[0].length - 1),
      }))
    })

  it('encontra os três formulários conhecidos', () => {
    const methods = calls.map(c => c.where)
    expect(methods).toEqual(expect.arrayContaining([
      'app/login/page.tsx → signInWithPassword',
      'app/login/page.tsx → signUp',
      'app/forgot-password/page.tsx → resetPasswordForEmail',
    ]))
  })

  it('toda chamada protegida pelo CAPTCHA envia captchaToken', () => {
    const missing = calls.filter(c => !/\bcaptchaToken\b/.test(c.text)).map(c => c.where)
    expect(missing).toEqual([])
  })
})

describe('isCaptchaError', () => {
  it('reconhece a recusa do Supabase Auth', () => {
    expect(isCaptchaError({ code: 'captcha_failed', message: 'captcha protection: request disallowed (no-captcha-response)' })).toBe(true)
    expect(isCaptchaError({ message: 'captcha protection: request disallowed (timeout-or-duplicate)' })).toBe(true)
  })

  it('não confunde com outros erros de login', () => {
    expect(isCaptchaError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false)
    expect(isCaptchaError({ code: 'weak_password', message: 'Password is known to be weak' })).toBe(false)
    expect(isCaptchaError(null)).toBe(false)
    expect(isCaptchaError('captcha')).toBe(false)
  })
})
