'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/Logo'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

export default function LoginPage() {
  const [hovered, setHovered] = useState(false)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    document.documentElement.classList.remove('light')
  }, [])

  async function signInWithGoogle() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Subtle ambient glow */}
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

        {/* Brand lockup */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 56, color: '#ffffff',
        }}>
          <Logo size={30} />
          <span style={{
            fontSize: 12, fontWeight: 500, letterSpacing: '0.2em',
            textTransform: 'uppercase' as const, color: '#ffffff',
          }}>
            Spacenode
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(21px, 5vw, 27px)',
          fontWeight: 400,
          letterSpacing: '-0.03em',
          color: '#f5f5f7',
          textAlign: 'center',
          lineHeight: 1.3,
          marginBottom: 14,
        }}>
          Entre e crie sua primeira imagem em minutos.
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.38)',
          textAlign: 'center',
          letterSpacing: '-0.01em',
          lineHeight: 1.65,
          marginBottom: 40,
        }}>
          12 nodes grátis. Sem cartão. Login seguro com Google.
        </p>

        {/* Google button */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            padding: '16px 24px',
            background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 12,
            fontSize: 14, fontWeight: 500,
            color: loading ? 'rgba(255,255,255,0.35)' : '#ffffff',
            letterSpacing: '-0.01em',
            cursor: loading ? 'default' : 'pointer',
            transform: hovered && !loading ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: hovered && !loading ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <GoogleIcon />
          {loading ? 'Redirecionando...' : 'Continuar com Google'}
        </button>

        {/* Divider */}
        <div style={{
          width: '100%', height: '0.5px',
          background: 'rgba(255,255,255,0.06)',
          margin: '40px 0 32px',
        }} />

        {/* Social proof */}
        <p style={{
          fontSize: 12, fontWeight: 400,
          color: 'rgba(255,255,255,0.22)',
          textAlign: 'center',
          letterSpacing: '-0.005em',
          lineHeight: 1.7,
          marginBottom: 16,
        }}>
          Projetos reais. Resultados em segundos.
        </p>

        {/* Trust signals */}
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center',
          gap: 8,
          fontSize: 10, color: 'rgba(255,255,255,0.18)',
          letterSpacing: '0.02em',
        }}>
          {(['Sem cartão de crédito', 'Cancele quando quiser', 'Suporte em português'] as const).map((item, i, arr) => (
            <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item}
              {i < arr.length - 1 && <span style={{ opacity: 0.5 }}>·</span>}
            </span>
          ))}
        </div>

      </div>
    </main>
  )
}
