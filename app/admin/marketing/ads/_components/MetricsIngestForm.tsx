'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Importação manual de métricas: cola o CSV exportado do Gerenciador de
// Anúncios e a rota /api/admin/marketing/ads/metrics faz o upsert por
// (data, nível, entidade). A importação por API do canal fica para quando o
// token estiver configurado — até lá, este é o caminho oficial.

const PLACEHOLDER = `data,identificador,impressoes,cliques,investimento,leads
2026-07-17,SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_VIDEO01_COPY01,1520,38,45.90,4`

interface IngestResult {
  upserted: number
  errors: unknown[]
}

/** Formata um erro por linha vindo da rota sem assumir o shape exato. */
function errorLine(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as { line?: number | string; message?: string; error?: string }
    const msg = o.message ?? o.error ?? JSON.stringify(e)
    return o.line !== undefined ? `Linha ${o.line}: ${msg}` : msg
  }
  return String(e)
}

export function MetricsIngestForm() {
  const router = useRouter()
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IngestResult | null>(null)

  async function submit() {
    if (!csv.trim() || busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/marketing/ads/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao importar métricas')
      setResult({
        upserted: typeof data.upserted === 'number' ? data.upserted : 0,
        errors: Array.isArray(data.errors) ? data.errors : [],
      })
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-5">
      <h2 className="text-sm font-medium">Métricas (importação manual)</h2>
      <p className="mt-1 text-xs text-text-tertiary">
        Exporte do Gerenciador de Anúncios e cole aqui — a importação por API entra quando o token do canal for configurado.
      </p>

      <div className="mt-3">
        <label htmlFor="metrics-csv" className="text-xs font-medium text-text-secondary">
          CSV (uma linha por dia e anúncio; identificador = SN_*)
        </label>
        <textarea
          id="metrics-csv"
          value={csv}
          onChange={e => setCsv(e.target.value)}
          rows={6}
          placeholder={PLACEHOLDER}
          className="mt-1 w-full rounded-lg border border-input-border bg-input px-3 py-2 font-mono text-xs outline-none focus:border-border-focus"
        />
      </div>

      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      {result && (
        <div className="mt-2 space-y-1 text-xs">
          <p className={result.upserted > 0 ? 'text-accent-green' : 'text-text-secondary'}>
            {result.upserted} linha{result.upserted === 1 ? '' : 's'} importada{result.upserted === 1 ? '' : 's'}.
          </p>
          {result.errors.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-error">
              {result.errors.map((e, i) => <li key={i}>{errorLine(e)}</li>)}
            </ul>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !csv.trim()}
        className="mt-3 rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50"
      >
        {busy ? 'Importando…' : 'Importar métricas'}
      </button>
    </div>
  )
}
