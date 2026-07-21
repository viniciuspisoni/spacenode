'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ACTION_TYPE_LABELS } from '@/lib/marketing/ads/workflow'
import { formatBRLFromCents, formatDateTime } from '@/lib/marketing/ads/format'
import type { AdPendingAction } from '@/lib/marketing/ads/types'
import { ActionStatusBadge } from './AdBadges'

// Fila de aprovação: pendentes no topo, histórico decidido abaixo. Rejeitar
// exige nota (a decisão precisa ser explicável depois); aprovar registra quem
// autorizou — a execução no gerenciador é sempre um passo separado.

const API = '/api/admin/marketing/ads'

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const dangerBtn =
  'rounded-lg border border-error-border bg-error-bg px-3 py-1.5 text-xs text-error transition-colors hover:opacity-80 disabled:opacity-50'

const ENTITY_LEVEL_LABELS: Record<string, string> = {
  campaign: 'Campanha',
  ad_set: 'Conjunto de anúncios',
  ad: 'Anúncio',
}

/** Chaves conhecidas do payload com rótulo legível; *_cents vira R$. */
const PAYLOAD_LABELS: Record<string, string> = {
  daily_budget_cents: 'Orçamento diário',
  lifetime_budget_cents: 'Orçamento total',
  budget_cents: 'Orçamento',
  to: 'Status de destino',
  from: 'Status atual',
  note: 'Observação',
}

function payloadLines(payload: Record<string, unknown>): string[] {
  return Object.entries(payload).map(([key, value]) => {
    const label = PAYLOAD_LABELS[key] ?? key
    if (key.endsWith('_cents') && typeof value === 'number') {
      return `${label}: ${formatBRLFromCents(value)}`
    }
    if (typeof value === 'object' && value !== null) {
      return `${label}: ${JSON.stringify(value)}`
    }
    return `${label}: ${String(value)}`
  })
}

function ActionSummary({ action }: { action: AdPendingAction }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {ACTION_TYPE_LABELS[action.action_type] ?? action.action_type}
        </span>
        <ActionStatusBadge status={action.status} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
        <span>
          {ENTITY_LEVEL_LABELS[action.entity_level] ?? action.entity_level} ·{' '}
          <span className="font-mono">{action.entity_id}</span>
        </span>
        <span>
          Solicitado por: {action.requested_by ? <span className="font-mono">{action.requested_by.slice(0, 8)}…</span> : 'Sistema'}
        </span>
        <span>{formatDateTime(action.created_at)}</span>
      </div>
      {payloadLines(action.payload).length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-secondary">
          {payloadLines(action.payload).map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      )}
      {action.reason && (
        <p className="mt-1 text-xs text-text-secondary">Motivo: {action.reason}</p>
      )}
    </div>
  )
}

function PendingActionCard({ action }: { action: AdPendingAction }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  async function decide(decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && !notes.trim()) {
      setError('Rejeição exige uma nota explicando o motivo.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/actions/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao registrar a decisão')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="p-4">
      <ActionSummary action={action} />
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
      <div className="mt-3 space-y-2">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notas da decisão (obrigatórias ao rejeitar)"
          rows={2}
          className={inputCls}
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => decide('approved')} disabled={busy} className={primaryBtn}>
            {busy ? 'Registrando…' : 'Aprovar'}
          </button>
          <button onClick={() => decide('rejected')} disabled={busy} className={dangerBtn}>
            Rejeitar
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  actions: AdPendingAction[]
}

export function ActionsQueueClient({ actions }: Props) {
  const pending = actions.filter(a => a.status === 'pending')
  const decided = actions
    .filter(a => a.status !== 'pending')
    .sort((a, b) => (b.decided_at ?? b.updated_at).localeCompare(a.decided_at ?? a.updated_at))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Aprovação</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Toda mudança de campanha, orçamento ou veiculação passa por decisão humana registrada aqui.
        </p>
      </div>

      <div className="rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning">
        Aprovar autoriza a execução — a publicação no gerenciador entra sempre pausada.
      </div>

      <section>
        <h2 className="text-sm font-medium text-text-secondary">Pendentes ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
            Fila vazia. Recomendações do sistema e pedidos de mudança aparecem aqui.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-bg-elevated">
            {pending.map(action => (
              <PendingActionCard key={action.id} action={action} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-text-secondary">Histórico de decisões</h2>
        {decided.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
            Nenhuma decisão registrada ainda.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-bg-elevated">
            {decided.map(action => (
              <div key={action.id} className="p-4">
                <ActionSummary action={action} />
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
                  {action.decided_by && (
                    <span>Decidido por: <span className="font-mono">{action.decided_by.slice(0, 8)}…</span></span>
                  )}
                  {action.decided_at && <span>{formatDateTime(action.decided_at)}</span>}
                  {action.executed_at && <span>executada {formatDateTime(action.executed_at)}</span>}
                </div>
                {action.decision_notes && (
                  <p className="mt-1 text-xs text-text-secondary">Notas: {action.decision_notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
