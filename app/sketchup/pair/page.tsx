'use client'

// Aprovação do pareamento do plugin SketchUp — aberta no NAVEGADOR DO
// SISTEMA (onde a sessão do usuário vive; o Google bloqueia login em
// webview embutido). O usuário confere o código mostrado no SketchUp e
// autoriza; o plugin recebe a sessão via polling no /pair/claim.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { Brandmark } from '@/components/brand'
import { createClient } from '@/lib/supabase/client'

type PairState = 'checking' | 'signed-out' | 'ready' | 'approving' | 'done' | 'error'

export default function SketchUpPairPage() {
  const supabase = useMemo(() => createClient(), [])

  const [state, setState] = useState<PairState>('checking')
  // O código NUNCA vem da URL — o usuário o digita a partir do painel do
  // SketchUp. Prefill viraria um link de takeover em 1 clique (RFC 8628).
  const [code, setCode] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      if (data.session?.user) {
        setEmail(data.session.user.email ?? null)
        setState('ready')
      } else {
        setState('signed-out')
      }
    })
    return () => { alive = false }
  }, [supabase])

  async function approve() {
    setState('approving')
    setError(null)
    try {
      const res = await fetch('/api/sketchup/pair/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível autorizar. Tente de novo.')
        setState('error')
        return
      }
      setState('done')
    } catch {
      setError('Sem conexão. Tente de novo.')
      setState('error')
    }
  }

  const loginNext = '/sketchup/pair'
  const codeValid = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code.replace(/\s/g, ''))

  return (
    <main style={S.main}>
      <section style={S.panel}>
        <div style={S.brand}>
          <Brandmark variant="horizontal" size={26} color="#f5f5f7" />
        </div>

        <h1 style={S.title}>
          {state === 'checking' && 'Verificando sessão'}
          {state === 'signed-out' && 'Entre pra conectar o SketchUp'}
          {(state === 'ready' || state === 'approving' || state === 'error') && 'Conectar o SketchUp'}
          {state === 'done' && 'SketchUp conectado'}
        </h1>

        {state === 'signed-out' && (
          <>
            <p style={S.copy}>Entre na sua conta SPACENODE pra autorizar o plugin.</p>
            <Link href={`/login?next=${encodeURIComponent(loginNext)}`} style={S.primary}>
              Entrar na SPACENODE
            </Link>
          </>
        )}

        {(state === 'ready' || state === 'approving' || state === 'error') && (
          <>
            <p style={S.copy}>
              Confirme que este é o código mostrado no painel do SketchUp
              {email ? <> — conectando à conta <b style={S.emailInline}>{email}</b></> : null}.
            </p>
            <input
              style={S.codeInput}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              maxLength={9}
              spellCheck={false}
              autoFocus
            />
            {error && <div style={S.error}>{error}</div>}
            <button
              type="button"
              onClick={approve}
              disabled={!codeValid || state === 'approving'}
              style={{ ...S.primary, opacity: !codeValid || state === 'approving' ? 0.45 : 1 }}
            >
              {state === 'approving' ? 'Autorizando…' : 'Autorizar este SketchUp'}
            </button>
            <div style={S.note}>
              O plugin recebe um acesso próprio, revogável a qualquer momento — a senha nunca
              passa por ele.
            </div>
          </>
        )}

        {state === 'done' && (
          <>
            <p style={S.copy}>Pode voltar ao SketchUp — o painel conecta sozinho em instantes.</p>
            <div style={S.doneDot} />
          </>
        )}
      </section>
    </main>
  )
}

const S: Record<string, CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#0a0a0a',
    color: '#f5f5f7',
    fontFamily: 'var(--font-geist), system-ui, -apple-system, sans-serif',
    letterSpacing: '-0.011em',
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    textAlign: 'center',
  },
  brand: { marginBottom: 18 },
  title: { margin: 0, fontSize: 22, fontWeight: 520, lineHeight: 1.15 },
  copy: { margin: 0, color: '#a1a1a6', fontSize: 13, lineHeight: 1.55, maxWidth: 320 },
  emailInline: { color: '#f5f5f7', fontWeight: 560 },
  codeInput: {
    width: '100%',
    height: 52,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 650,
    letterSpacing: '0.18em',
    color: '#f5f5f7',
    background: 'rgba(255,255,255,0.05)',
    border: '0.5px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    outline: 'none',
    fontFamily: 'inherit',
  },
  error: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    fontSize: 12,
    color: '#e0584a',
    background: 'rgba(224,88,74,0.08)',
    border: '0.5px solid rgba(224,88,74,0.20)',
  },
  primary: {
    width: '100%',
    padding: '13px 18px',
    borderRadius: 10,
    border: 'none',
    background: '#f5f5f7',
    color: '#0a0a0a',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  note: { color: '#6e6e73', fontSize: 11, lineHeight: 1.5, maxWidth: 300 },
  doneDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#30d158',
    boxShadow: '0 0 18px rgba(48,209,88,0.4)',
  },
}
