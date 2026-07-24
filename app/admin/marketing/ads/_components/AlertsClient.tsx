'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ALERT_STATUS_LABELS, type AlertStatus } from '@/lib/marketing/ads/workflow'
import { formatBRLFromCents, formatDateTime } from '@/lib/marketing/ads/format'
import type { AdAlert } from '@/lib/marketing/ads/types'
import { AlertSeverityBadge } from './AdBadges'

// Lista de alertas por status, críticos primeiro. "Verificar agora" roda o
// motor de regras no servidor (POST /alerts/run) e mostra o resultado.

const API = '/api/admin/marketing/ads'

const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const ghostBtn =
  'rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface disabled:opacity-50'

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 }

/** Ações disponíveis por status do alerta. */
const NEXT_BY_STATUS: Record<string, Array<{ to: AlertStatus; label: string }>> = {
  open: [
    { to: 'acknowledged', label: 'Visto' },
    { to: 'resolved', label: 'Resolver' },
    { to: 'dismissed', label: 'Descartar' },
  ],
  acknowledged: [
    { to: 'resolved', label: 'Resolver' },
    { to: 'dismissed', label: 'Descartar' },
  ],
}

const FILTERS: Array<{ value: string | null; label: string }> = [
  { value: 'open', label: 'Abertos' },
  { value: 'acknowledged', label: 'Vistos' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'dismissed', label: 'Descartados' },
  { value: null, label: 'Todos' },
]

/** Números do alerta (data jsonb) em texto pequeno; *_cents vira R$. */
function dataLine(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => {
      if (key.endsWith('_cents') && typeof value === 'number') return `${key}: ${formatBRLFromCents(value)}`
      if (typeof value === 'number') return `${key}: ${value.toLocaleString('pt-BR')}`
      if (typeof value === 'object' && value !== null) return `${key}: ${JSON.stringify(value)}`
      return `${key}: ${String(value)}`
    })
    .join(' · ')
}

function AlertRow({ alert }: { alert: AdAlert }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(to: AlertStatus) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/alerts/${alert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao atualizar o alerta')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const actions = NEXT_BY_STATUS[alert.status] ?? []
  const numbers = dataLine(alert.data)

  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <AlertSeverityBadge severity={alert.severity} />
          <span className="text-[11px] text-text-tertiary">{alert.alert_type}</span>
          <span className="text-[11px] text-text-tertiary">
            {ALERT_STATUS_LABELS[alert.status] ?? alert.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-text-secondary">{alert.message}</p>
        {numbers && (
          <p className="mt-1 font-mono text-[11px] text-text-tertiary">{numbers}</p>
        )}
        <div className="mt-1 text-[11px] text-text-tertiary">{formatDateTime(alert.created_at)}</div>
        {error && <p className="mt-1 text-sm text-error">{error}</p>}
      </div>
      {actions.length > 0 && (
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {actions.map(a => (
            <button key={a.to} onClick={() => setStatus(a.to)} disabled={busy} className={ghostBtn}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  alerts: AdAlert[]
}

export function AlertsClient({ alerts }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<string | null>('open')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<{ created: number; evaluated: number } | null>(null)

  async function runNow() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/alerts/run`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao rodar as verificações')
      setRunResult({ created: Number(data.created ?? 0), evaluated: Number(data.evaluated ?? 0) })
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const visible = alerts
    .filter(a => !filter || a.status === filter)
    .sort((a, b) => {
      const bySeverity = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
      if (bySeverity !== 0) return bySeverity
      return b.created_at.localeCompare(a.created_at)
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Alertas</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Anomalias e oportunidades detectadas pelo motor de regras. O alerta recomenda — a ação
            passa pela fila de aprovação.
          </p>
        </div>
        <button onClick={runNow} disabled={busy} className={primaryBtn}>
          {busy ? 'Verificando…' : 'Verificar agora'}
        </button>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      {runResult && (
        <p className="text-sm text-text-secondary">
          Avaliação concluída: {runResult.evaluated.toLocaleString('pt-BR')} verificações,{' '}
          {runResult.created.toLocaleString('pt-BR')} alertas novos.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        {FILTERS.map(f => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 transition-colors ${
              filter === f.value
                ? 'border-border-strong bg-surface text-text-primary'
                : 'border-border text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhum alerta {filter ? 'neste filtro' : 'registrado'}.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {visible.map(alert => (
            <AlertRow key={`${alert.id}:${alert.updated_at}`} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}
