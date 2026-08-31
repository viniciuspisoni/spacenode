'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { formatDateTime } from '@/lib/marketing/ads/format'
import type { AdReport } from '@/lib/marketing/ads/types'

// Geração e leitura de relatórios. O summary_md é renderizado por um parser
// mínimo próprio (headings "##", listas "-", negrito "**x**") — sem lib
// externa de markdown de propósito: o formato do gerador é controlado.

const API = '/api/admin/marketing/ads'

const inputCls =
  'rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'

/** Data (YYYY-MM-DD) formatada sem passar por Date — evita o deslize de fuso
 *  (meia-noite UTC vira véspera em BRT). */
function formatDay(day: string): string {
  const [y, m, d] = day.split('-')
  return y && m && d ? `${d}/${m}/${y}` : day
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Parser mínimo de markdown ──────────────────────────────────────────────────

function renderInline(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-text-primary">{part}</strong>
    ) : (
      part
    ),
  )
}

function MarkdownLite({ md }: { md: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []

  const flushList = () => {
    if (list.length === 0) return
    const items = list
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trimEnd()
    const heading = line.match(/^#{1,3}\s+(.*)$/)
    if (heading) {
      flushList()
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="mt-4 text-sm font-semibold tracking-tight first:mt-0">
          {renderInline(heading[1])}
        </h3>,
      )
    } else if (line.startsWith('- ')) {
      list.push(line.slice(2))
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      blocks.push(
        <p key={`p-${blocks.length}`} className="whitespace-pre-wrap text-sm text-text-secondary">
          {renderInline(line)}
        </p>,
      )
    }
  }
  flushList()

  return <div className="space-y-2">{blocks}</div>
}

// ── Cartão de relatório ────────────────────────────────────────────────────────

function ReportCard({ report }: { report: AdReport }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{report.title}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
            <span>{formatDay(report.period_start)} — {formatDay(report.period_end)}</span>
            <span>{report.status === 'final' ? 'Final' : 'Rascunho'}</span>
            <span>gerado {formatDateTime(report.created_at)}</span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-text-tertiary">{open ? 'Fechar' : 'Abrir'}</span>
      </button>

      {open && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <MarkdownLite md={report.summary_md} />
        </div>
      )}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────

interface Props {
  reports: AdReport[]
}

export function ReportsClient({ reports }: Props) {
  const router = useRouter()
  const now = new Date()
  const [periodStart, setPeriodStart] = useState(() => isoDay(new Date(now.getTime() - 7 * 86_400_000)))
  const [periodEnd, setPeriodEnd] = useState(() => isoDay(now))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao gerar o relatório')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Relatórios</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Consolidação do período: investimento, funil, vencedores/perdedores e próximos testes.
          Métricas sem amostra confiável vêm marcadas — não decidir por elas.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-bg-elevated p-4">
        <div className="text-xs text-text-tertiary">Gerar relatório do período</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={periodStart}
            onChange={e => setPeriodStart(e.target.value)}
            className={inputCls}
            aria-label="Início do período"
          />
          <span className="text-xs text-text-tertiary">até</span>
          <input
            type="date"
            value={periodEnd}
            onChange={e => setPeriodEnd(e.target.value)}
            className={inputCls}
            aria-label="Fim do período"
          />
          <button onClick={generate} disabled={busy || !periodStart || !periodEnd} className={primaryBtn}>
            {busy ? 'Gerando…' : 'Gerar relatório'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhum relatório gerado. O padrão é um por semana, comparando com o período anterior.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {reports.map(report => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  )
}
