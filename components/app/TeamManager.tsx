'use client'

// Painel de gestão da Equipe (só owner/admin). Convidar por link, revogar
// convites pendentes e gerenciar papéis/remoção de membros. Após cada ação,
// router.refresh() re-renderiza os dados do servidor.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type ManagerMember = { userId: string; name: string; role: 'owner' | 'admin' | 'member'; isSelf: boolean }
export type ManagerInvite = { id: string; email: string; role: string; expiresAt: string }

interface Props {
  members: ManagerMember[]
  invites: ManagerInvite[]
}

const card: React.CSSProperties = {
  background: 'var(--color-bg-elevated)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 14, padding: '20px 22px', marginBottom: 18,
}
const heading: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 16,
}
const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: '0.5px solid var(--color-border-strong)',
  color: 'var(--color-text-primary)', fontSize: 13, outline: 'none',
}
const btn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: 'none',
  background: 'var(--color-accent-green)', color: '#06140d',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 7,
  background: 'rgba(255,255,255,0.04)', border: '0.5px solid var(--color-border-strong)',
  color: 'var(--color-text-secondary)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
}

export function TeamManager({ members, invites }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function createInvite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setLink(null); setCopied(false)
    try {
      const res = await fetch('/api/workspaces/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Falha ao criar convite.'); return }
      setLink(json.url as string)
      setEmail('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function post(url: string, body?: unknown) {
    setError(null)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Ação não concluída.')
      return
    }
    router.refresh()
  }

  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  const manageable = members.filter((m) => m.role !== 'owner')

  return (
    <div style={{ marginBottom: 26 }}>
      {/* Convidar */}
      <div style={card}>
        <div style={heading}>Convidar membro</div>
        <form onSubmit={createInvite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="email" required placeholder="email@pessoa.com" value={email}
            onChange={(e) => setEmail(e.target.value)} style={inputStyle}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            style={{ ...inputStyle, flex: '0 0 120px' }}>
            <option value="member">membro</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Gerando…' : 'Gerar link'}
          </button>
        </form>

        {link && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
              Link gerado — envie para a pessoa (WhatsApp, email…). Só o email convidado consegue aceitar.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={link} style={{ ...inputStyle, fontSize: 12, color: 'var(--color-text-secondary)' }} />
              <button onClick={copy} style={ghostBtn}>{copied ? 'copiado ✓' : 'copiar'}</button>
            </div>
          </div>
        )}

        {error && <p style={{ marginTop: 12, fontSize: 12.5, color: '#e07570' }}>{error}</p>}
      </div>

      {/* Convites pendentes */}
      {invites.length > 0 && (
        <div style={card}>
          <div style={heading}>Convites pendentes</div>
          {invites.map((inv) => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '0.5px solid var(--color-border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                  {inv.role === 'admin' ? 'admin' : 'membro'} · expira {fmt(inv.expiresAt)}
                </div>
              </div>
              <button onClick={() => post(`/api/workspaces/invites/${inv.id}/revoke`)} style={ghostBtn}>revogar</button>
            </div>
          ))}
        </div>
      )}

      {/* Gerenciar membros */}
      {manageable.length > 0 && (
        <div style={card}>
          <div style={heading}>Gerenciar membros</div>
          {manageable.map((m) => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '0.5px solid var(--color-border)' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.name}{m.isSelf && <span style={{ color: 'var(--color-text-tertiary)' }}> · você</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <select
                  value={m.role}
                  onChange={(e) => post(`/api/workspaces/members/${m.userId}`, { action: 'set_role', role: e.target.value })}
                  style={{ ...ghostBtn, padding: '6px 8px' }}
                >
                  <option value="member">membro</option>
                  <option value="admin">admin</option>
                </select>
                <button onClick={() => post(`/api/workspaces/members/${m.userId}`, { action: 'remove' })}
                  style={{ ...ghostBtn, color: '#e07570', borderColor: 'rgba(220,50,47,0.25)' }}>
                  remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d)
}
