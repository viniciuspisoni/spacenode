'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Brandmark } from '@/components/brand'

// Tela única usada nos dois cenários:
//
// 1. Recovery via email (esqueci minha senha) — usuário chega aqui depois do
//    /auth/callback fazer o exchangeCodeForSession, então já tem sessão.
//
// 2. Usuário Google logado que quer definir uma senha — vem pelo "conta" no
//    sidebar. Já está autenticado pelo OAuth.
//
// Em ambos os casos basta chamar updateUser({ password }). Se não houver
// sessão (ex: link expirado, entrou direto sem auth), redireciona pro login.

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [done,      setDone]      = useState(false)
  const [checking,  setChecking]  = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.classList.remove('light')
  }, [])

  // Verifica se há sessão (necessária pra chamar updateUser). Em recovery,
  // o /auth/callback já criou a sessão antes de cair aqui.
  useEffect(() => {
    let alive = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return
      if (error || !data.user) {
        router.replace('/login?error=session')
        return
      }
      setUserEmail(data.user.email ?? null)
      setChecking(false)
    })
    return () => { alive = false }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6)   { setError('A senha deve ter pelo menos 6 caracteres.'); return }
    if (password !== confirm)  { setError('As senhas não coincidem.');                 return }

    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('Não foi possível atualizar a senha. Tente novamente.')
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
    setTimeout(() => router.push('/app'), 1600)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 10, fontSize: 14, color: '#ffffff',
    outline: 'none', letterSpacing: '-0.01em',
    transition: 'border-color 0.15s',
  }

  return (
    <main style={{
      minHeight: '100vh', background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>

      <style>{`.spn-input::placeholder { color: rgba(255,255,255,0.22); }`}</style>

      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(255,255,255,0.025) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 380,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative',
      }}>

        <div style={{ marginBottom: 44, color: '#ffffff' }}>
          <Brandmark size={28} />
        </div>

        <h1 style={{
          fontSize: 22, fontWeight: 500, color: '#ffffff',
          marginBottom: 8, letterSpacing: '-0.02em',
        }}>
          {done ? 'Senha atualizada' : 'Definir nova senha'}
        </h1>
        <p style={{
          fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 28,
          textAlign: 'center', lineHeight: 1.5, letterSpacing: '-0.005em',
        }}>
          {done
            ? 'Você já pode usar essa senha para entrar com seu email.'
            : userEmail
              ? <>Defina a senha para a conta <strong style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{userEmail}</strong>.</>
              : 'Defina sua senha para acessar com email.'}
        </p>

        {error && (
          <div style={{
            width: '100%', padding: '11px 14px', borderRadius: 9, marginBottom: 16,
            background: 'rgba(220,50,47,0.08)', border: '0.5px solid rgba(220,50,47,0.25)',
            fontSize: 13, color: '#e05252', letterSpacing: '-0.01em', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {!checking && !done && (
          <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="spn-input"
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null) }}
              required
              minLength={6}
              autoComplete="new-password"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'  }}
            />
            <input
              className="spn-input"
              type="password"
              placeholder="Confirme a senha"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(null) }}
              required
              minLength={6}
              autoComplete="new-password"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'  }}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px 24px', marginTop: 2,
                background: loading ? 'rgba(255,255,255,0.1)' : '#ffffff',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
                color: loading ? 'rgba(0,0,0,0.4)' : '#0a0a0a',
                cursor: loading ? 'default' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {loading ? 'Salvando...' : 'Salvar senha'}
            </button>
          </form>
        )}

        <Link href="/app" style={{
          marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.4)',
          textDecoration: 'none', letterSpacing: '-0.01em',
        }}>
          ← Voltar
        </Link>

      </div>
    </main>
  )
}
