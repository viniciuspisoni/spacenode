'use client'

// Painel de gestão da Equipe (só owner/admin). Convidar por link, revogar
// convites pendentes e gerenciar papéis/remoção de membros. Após cada ação,
// router.refresh() re-renderiza os dados do servidor.
//
// Eram três cartões empilhados, sempre abertos. Convidar é o que o gestor vem
// fazer — fica na superfície. Revogar convite e mexer em papel são manutenção
// ocasional: viram duas linhas que já dizem quantos são, e a folha abre só se
// ele quiser mexer.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RowIcon, SettingGroup, SettingRow, Sheet, summarize } from '@/components/app/glass'

export type ManagerMember = { userId: string; name: string; role: 'owner' | 'admin' | 'member'; isSelf: boolean }
export type ManagerInvite = { id: string; email: string; role: string; expiresAt: string }

interface Props {
  members: ManagerMember[]
  invites: ManagerInvite[]
}

const rowLine: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, padding: '11px 0', borderBottom: '0.5px solid var(--glass-line)',
}

export function TeamManager({ members, invites }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [emailed, setEmailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sheet, setSheet] = useState<'invites' | 'members' | null>(null)

  async function createInvite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setLink(null); setEmailed(false); setCopied(false)
    try {
      const res = await fetch('/api/workspaces/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Falha ao criar convite.'); return }
      setLink(json.url as string)
      setEmailed(Boolean(json.emailed))
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
  const admins = manageable.filter((m) => m.role === 'admin').length

  return (
    <div style={{ marginBottom: 26, display: 'grid', gap: 12 }}>
      {/* Convidar — a ação pela qual o gestor abriu esta tela. */}
      <div className="spn-glass" style={{ borderRadius: 'var(--r-card)', padding: '20px 22px' }}>
        <div className="spn-field-label">Convidar membro</div>
        <form onSubmit={createInvite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="email" required placeholder="email@pessoa.com" value={email}
            onChange={(e) => setEmail(e.target.value)} className="spn-input"
            style={{ flex: 1, minWidth: 180, width: 'auto' }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            className="spn-input" style={{ flex: '0 0 120px', width: 'auto' }}>
            <option value="member">membro</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" className="spn-cta" disabled={busy} style={{ width: 'auto', minHeight: 38 }}>
            {busy ? 'Gerando…' : 'Gerar link'}
          </button>
        </form>

        {link && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: emailed ? 'var(--color-accent-green)' : 'var(--color-text-tertiary)', marginBottom: 8 }}>
              {emailed
                ? '✓ Convite enviado por email. O link abaixo também funciona, se quiser enviar manualmente.'
                : 'Link gerado — envie para a pessoa (WhatsApp, email…). Só o email convidado consegue aceitar.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={link} className="spn-input" style={{ flex: 1, minWidth: 0, width: 'auto', color: 'var(--color-text-secondary)' }} />
              <button onClick={copy} className="spn-ghost">{copied ? 'copiado ✓' : 'copiar'}</button>
            </div>
          </div>
        )}

        {error && <div className="spn-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {/* Manutenção: duas linhas que já mostram o número, e abrem se precisar. */}
      {(invites.length > 0 || manageable.length > 0) && (
        <SettingGroup>
          {invites.length > 0 && (
            <SettingRow
              icon={<RowIcon name="direction" />}
              title="Convites pendentes"
              value={`${invites.length} aguardando`}
              onOpen={() => setSheet('invites')}
              controls="equipe-convites"
            />
          )}
          {manageable.length > 0 && (
            <SettingRow
              icon={<RowIcon name="scene" />}
              title="Gerenciar membros"
              value={summarize([
                `${manageable.length} pessoa${manageable.length === 1 ? '' : 's'}`,
                admins > 0 ? `${admins} admin${admins === 1 ? '' : 's'}` : '',
              ])}
              onOpen={() => setSheet('members')}
              controls="equipe-membros"
            />
          )}
        </SettingGroup>
      )}

      <Sheet open={sheet === 'invites'} title="Convites pendentes" onClose={() => setSheet(null)}>
        <div id="equipe-convites">
          {invites.map((inv) => (
            <div key={inv.id} style={rowLine}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                  {inv.role === 'admin' ? 'admin' : 'membro'} · expira {fmt(inv.expiresAt)}
                </div>
              </div>
              <button onClick={() => post(`/api/workspaces/invites/${inv.id}/revoke`)} className="spn-ghost">revogar</button>
            </div>
          ))}
        </div>
        {error && <div className="spn-error" style={{ marginTop: 12 }}>{error}</div>}
      </Sheet>

      <Sheet open={sheet === 'members'} title="Gerenciar membros" onClose={() => setSheet(null)}>
        <div id="equipe-membros">
          {manageable.map((m) => (
            <div key={m.userId} style={rowLine}>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.name}{m.isSelf && <span style={{ color: 'var(--color-text-tertiary)' }}> · você</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <select
                  value={m.role}
                  onChange={(e) => post(`/api/workspaces/members/${m.userId}`, { action: 'set_role', role: e.target.value })}
                  className="spn-ghost"
                  style={{ padding: '0 8px' }}
                >
                  <option value="member">membro</option>
                  <option value="admin">admin</option>
                </select>
                <button onClick={() => post(`/api/workspaces/members/${m.userId}`, { action: 'remove' })}
                  className="spn-ghost"
                  style={{ color: 'var(--color-error)', borderColor: 'var(--color-error-border)' }}>
                  remover
                </button>
              </div>
            </div>
          ))}
        </div>
        {error && <div className="spn-error" style={{ marginTop: 12 }}>{error}</div>}
      </Sheet>
    </div>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d)
}
