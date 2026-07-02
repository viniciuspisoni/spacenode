'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Brandmark } from '@/components/brand'

// Fluxo "esqueci minha senha". Também serve pra usuários Google que querem
// definir uma senha pela primeira vez — o email de recovery do Supabase chega
// pra qualquer user com aquele email cadastrado, OAuth ou não.
//
// O link no email redireciona pra /auth/callback?next=/update-password, que
// faz o exchange do code (PKCE) e leva o usuário até a tela de nova senha.
export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [sent,    setSent]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    })

    if (error) {
      setError('Não foi possível enviar o email. Verifique o endereço e tente novamente.')
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px',
    background: 'var(--color-input)',
    border: '0.5px solid var(--color-input-border)',
    borderRadius: 10, fontSize: 14, color: 'var(--color-text-primary)',
    outline: 'none', letterSpacing: '-0.01em',
    transition: 'border-color 0.15s',
  }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>

      <style>{`.spn-input::placeholder { color: var(--color-text-quaternary); }`}</style>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse 70% 50% at 50% 40%, var(--color-surface-subtle) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 380,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative',
      }}>

        {/* Brand lockup */}
        <div style={{ marginBottom: 44, color: 'var(--color-text-primary)' }}>
          <Brandmark size={28} />
        </div>

        <h1 style={{
          fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)',
          marginBottom: 8, letterSpacing: '-0.02em',
        }}>
          {sent ? 'Email enviado' : 'Recuperar acesso'}
        </h1>
        <p style={{
          fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 28,
          textAlign: 'center', lineHeight: 1.5, letterSpacing: '-0.005em',
        }}>
          {sent
            ? 'Verifique sua caixa de entrada e clique no link para definir uma nova senha.'
            : 'Digite seu email e enviaremos um link para você definir uma nova senha. Vale também para contas criadas via Google.'}
        </p>

        {error && (
          <div style={{
            width: '100%', padding: '11px 14px', borderRadius: 9, marginBottom: 16,
            background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
            fontSize: 13, color: 'var(--color-error)', letterSpacing: '-0.01em', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {!sent && (
          <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="spn-input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-border-focus)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--color-input-border)'  }}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px 24px', marginTop: 2,
                background: loading ? 'var(--color-surface-hover)' : 'var(--color-inverse)',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
                color: loading ? 'var(--color-text-tertiary)' : 'var(--color-inverse-foreground)',
                cursor: loading ? 'default' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {loading ? 'Enviando...' : 'Enviar link'}
            </button>
          </form>
        )}

        <Link href="/login" style={{
          marginTop: 24, fontSize: 12, color: 'var(--color-text-tertiary)',
          textDecoration: 'none', letterSpacing: '-0.01em',
        }}>
          ← Voltar para login
        </Link>

      </div>
    </main>
  )
}
