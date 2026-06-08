'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workspaces/invites/accept', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Não foi possível aceitar o convite.')
        setLoading(false)
        return
      }
      router.push('/app/equipe')
      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={accept}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 20px', borderRadius: 9,
          background: 'var(--color-accent-green)', color: '#06140d',
          border: 'none', fontSize: 13.5, fontWeight: 600,
          letterSpacing: '-0.01em', cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Aceitando…' : 'Aceitar convite'}
      </button>
      {error && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: '#e07570' }}>{error}</p>
      )}
    </div>
  )
}
