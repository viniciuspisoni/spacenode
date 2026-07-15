'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Brandmark } from '@/components/brand'

type Mode = 'login' | 'signup'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials'))       return 'Email ou senha incorretos.'
  if (msg.includes('Email not confirmed'))             return 'Confirme seu email antes de entrar.'
  if (msg.includes('User already registered'))         return 'Email já cadastrado. Tente entrar.'
  if (msg.includes('Password should be at least'))     return 'A senha deve ter pelo menos 6 caracteres.'
  if (msg.includes('Unable to validate email'))        return 'Email inválido.'
  if (msg.includes('signup is disabled'))              return 'Cadastros temporariamente desativados.'
  return 'Algo deu errado. Tente novamente.'
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mode,          setMode]          = useState<Mode>(searchParams.get('mode') === 'signup' ? 'signup' : 'login')
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleHovered, setGoogleHovered] = useState(false)
  const [submitHovered, setSubmitHovered] = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState<string | null>(null)

  // Clear feedback when the user edits
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setError(null); setSuccess(null) }, [mode, email, password])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(translateError(error.message)); setLoading(false) }
      else        { router.push('/app') }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        setError(translateError(error.message))
        setLoading(false)
      } else if (data.session) {
        router.push('/app')
      } else {
        setSuccess('Verifique seu email para confirmar o cadastro.')
        setLoading(false)
      }
    }
  }

  async function signInWithGoogle() {
    setGoogleLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
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

      {/* Placeholder color for dark inputs */}
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

        {/* Mode toggle */}
        <div style={{
          display: 'flex', width: '100%', marginBottom: 28,
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 10, padding: 3,
        }}>
          {(['login', 'signup'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '9px 0', borderRadius: 8,
              fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
              cursor: 'pointer', border: 'none',
              background: mode === m ? 'var(--color-surface-hover)' : 'transparent',
              color: mode === m ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              transition: 'all 0.15s ease',
            }}>
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            width: '100%', padding: '11px 14px', borderRadius: 9, marginBottom: 16,
            background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
            fontSize: 13, color: 'var(--color-error)', letterSpacing: '-0.01em', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div style={{
            width: '100%', padding: '11px 14px', borderRadius: 9, marginBottom: 16,
            background: 'var(--color-accent-green-bg)', border: '0.5px solid var(--color-accent-green-border)',
            fontSize: 13, color: 'var(--color-accent-green)', letterSpacing: '-0.01em', lineHeight: 1.5,
          }}>
            {success}
          </div>
        )}

        {/* Form */}
        {!success && (
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
              onFocus={e  => { e.currentTarget.style.borderColor = 'var(--color-border-focus)' }}
              onBlur={e   => { e.currentTarget.style.borderColor = 'var(--color-input-border)'  }}
            />
            <input
              className="spn-input"
              type="password"
              placeholder={mode === 'signup' ? 'Senha (mín. 6 caracteres)' : 'Senha'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={inputStyle}
              onFocus={e  => { e.currentTarget.style.borderColor = 'var(--color-border-focus)' }}
              onBlur={e   => { e.currentTarget.style.borderColor = 'var(--color-input-border)'  }}
            />

            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => setSubmitHovered(true)}
              onMouseLeave={() => setSubmitHovered(false)}
              style={{
                width: '100%', padding: '14px 24px', marginTop: 2,
                background: loading ? 'var(--color-surface-hover)' : submitHovered ? 'var(--color-inverse-hover)' : 'var(--color-inverse)',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
                color: loading ? 'var(--color-text-tertiary)' : 'var(--color-inverse-foreground)',
                cursor: loading ? 'default' : 'pointer',
                transform: submitHovered && !loading ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: submitHovered && !loading ? 'var(--shadow-md)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>

            {mode === 'login' && (
              <div style={{ textAlign: 'right', marginTop: 2 }}>
                <a href="/forgot-password" style={{
                  fontSize: 11, color: 'var(--color-text-quaternary)',
                  letterSpacing: '-0.005em', textDecoration: 'none',
                }}>
                  Esqueci minha senha
                </a>
              </div>
            )}
          </form>
        )}

        {/* Divider */}
        <div style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          margin: '24px 0 12px',
        }}>
          <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border)' }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-quaternary)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ou</span>
          <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border)' }} />
        </div>

        {/* Google button */}
        <button
          onClick={signInWithGoogle}
          disabled={googleLoading}
          onMouseEnter={() => setGoogleHovered(true)}
          onMouseLeave={() => setGoogleHovered(false)}
          style={{
            width: '100%', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            padding: '14px 24px',
            background: googleHovered ? 'var(--color-surface-hover)' : 'var(--color-surface)',
            border: `0.5px solid ${googleHovered ? 'var(--color-border-focus)' : 'var(--color-border-strong)'}`,
            borderRadius: 10, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
            color: googleLoading ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            cursor: googleLoading ? 'default' : 'pointer',
            transform: googleHovered && !googleLoading ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: googleHovered && !googleLoading ? 'var(--shadow-md)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <GoogleIcon />
          {googleLoading ? 'Redirecionando...' : 'Continuar com Google'}
        </button>

        {/* Aceite legal — vínculo de concordância no cadastro/login */}
        <p style={{
          fontSize: 11, color: 'var(--color-text-quaternary)',
          textAlign: 'center', lineHeight: 1.6, letterSpacing: '-0.005em',
          margin: '0 0 20px',
        }}>
          Ao continuar, você concorda com os{' '}
          <a href="/termos" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Termos de Uso
          </a>
          {' '}e a{' '}
          <a href="/privacidade" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Política de Privacidade
          </a>.
        </p>

        {/* Trust signals */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
          gap: 8, fontSize: 10, color: 'var(--color-text-quaternary)', letterSpacing: '0.02em',
        }}>
          {(['40 nodes grátis', 'Sem cartão', 'Suporte em português'] as const).map((item, i, arr) => (
            <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item}
              {i < arr.length - 1 && <span style={{ opacity: 0.45 }}>·</span>}
            </span>
          ))}
        </div>

      </div>
    </main>
  )
}
