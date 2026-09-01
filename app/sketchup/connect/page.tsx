'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { Brandmark } from '@/components/brand'
import { createClient } from '@/lib/supabase/client'

type ConnectionState = 'checking' | 'signed-out' | 'ready' | 'sent' | 'outside-sketchup'

declare global {
  interface Window {
    sketchup?: {
      receiveSpaceNodeSession?: (payload: string) => void
    }
  }
}

interface SketchUpSessionPayload {
  accessToken: string
  expiresAt: number | null
  userEmail: string | null
}

export default function SketchUpConnectPage() {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<ConnectionState>('checking')
  const [sessionPayload, setSessionPayload] = useState<SketchUpSessionPayload | null>(null)

  useEffect(() => {
    let alive = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      if (!alive) return

      const session = data.session
      if (!session?.access_token) {
        setState('signed-out')
        setSessionPayload(null)
        return
      }

      const payload = {
        accessToken: session.access_token,
        expiresAt: session.expires_at ?? null,
        userEmail: session.user.email ?? null,
      }
      setSessionPayload(payload)
      setState(deliverToSketchUp(payload) ? 'sent' : 'ready')
    }

    loadSession()
    const { data: authListener } = supabase.auth.onAuthStateChange(() => loadSession())
    return () => {
      alive = false
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  function deliverToSketchUp(payload: SketchUpSessionPayload): boolean {
    const callback = window.sketchup?.receiveSpaceNodeSession
    if (!callback) return false

    callback(JSON.stringify(payload))
    return true
  }

  function sendToSketchUp() {
    if (!sessionPayload) return
    setState(deliverToSketchUp(sessionPayload) ? 'sent' : 'outside-sketchup')
  }

  const signedIn = state === 'ready' || state === 'sent' || state === 'outside-sketchup'

  return (
    <main style={S.main}>
      <section style={S.panel}>
        <div style={S.brand}>
          <Brandmark variant="horizontal" size={26} color="#f5f5f7" accent />
        </div>

        <div style={S.statusDotWrap}>
          <span style={{
            ...S.statusDot,
            background: signedIn ? '#30d158' : state === 'signed-out' ? '#d4a327' : '#6e6e73',
            boxShadow: signedIn ? '0 0 18px rgba(48,209,88,0.38)' : 'none',
          }} />
        </div>

        <h1 style={S.title}>
          {state === 'checking' && 'Verificando sessão'}
          {state === 'signed-out' && 'Conecte sua conta'}
          {state === 'ready' && 'Sessão encontrada'}
          {state === 'sent' && 'SketchUp conectado'}
          {state === 'outside-sketchup' && 'Abra esta tela pelo SketchUp'}
        </h1>

        <p style={S.copy}>
          {state === 'checking' && 'A SpaceNode está procurando uma sessão ativa neste navegador.'}
          {state === 'signed-out' && 'Entre na SpaceNode para liberar o plugin sem informar sua senha dentro do SketchUp.'}
          {state === 'ready' && 'A conexão está pronta para ser enviada ao painel do SketchUp.'}
          {state === 'sent' && 'Você já pode voltar ao painel da SpaceNode no SketchUp e gerar a vista atual.'}
          {state === 'outside-sketchup' && 'Esta página precisa ser aberta pelo botão Conectar do plugin.'}
        </p>

        {sessionPayload?.userEmail && (
          <div style={S.email}>{sessionPayload.userEmail}</div>
        )}

        {state === 'signed-out' ? (
          <Link href="/login?next=/sketchup/connect" style={S.primary}>
            Entrar na SpaceNode
          </Link>
        ) : (
          <button
            type="button"
            onClick={sendToSketchUp}
            disabled={!sessionPayload || state === 'checking'}
            style={{
              ...S.primary,
              opacity: !sessionPayload || state === 'checking' ? 0.45 : 1,
              cursor: !sessionPayload || state === 'checking' ? 'default' : 'pointer',
            }}
          >
            Enviar para o SketchUp
          </button>
        )}

        <div style={S.note}>A senha não é enviada ao plugin. O acesso expira com a sua sessão da SpaceNode.</div>
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
    fontFamily: 'var(--font-geist), system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
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
  brand: { marginBottom: 22 },
  statusDotWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '0.5px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.05)',
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    display: 'block',
  },
  title: {
    margin: '6px 0 0',
    fontSize: 22,
    fontWeight: 520,
    letterSpacing: 0,
    lineHeight: 1.12,
  },
  copy: {
    margin: 0,
    color: '#a1a1a6',
    fontSize: 13,
    lineHeight: 1.55,
    maxWidth: 310,
  },
  email: {
    maxWidth: '100%',
    padding: '7px 10px',
    borderRadius: 8,
    color: '#a1a1a6',
    background: 'rgba(255,255,255,0.05)',
    border: '0.5px solid rgba(255,255,255,0.08)',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  primary: {
    width: '100%',
    marginTop: 6,
    padding: '12px 18px',
    borderRadius: 9,
    border: 'none',
    background: '#f5f5f7',
    color: '#0a0a0a',
    fontSize: 13,
    fontWeight: 560,
    letterSpacing: 0,
    textDecoration: 'none',
    fontFamily: 'inherit',
  },
  note: {
    marginTop: 4,
    color: '#6e6e73',
    fontSize: 11,
    lineHeight: 1.45,
    maxWidth: 300,
  },
}
