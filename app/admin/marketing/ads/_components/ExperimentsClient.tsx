'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { nextExperimentStatuses, type ExperimentStatus } from '@/lib/marketing/ads/workflow'
import { formatDate } from '@/lib/marketing/ads/format'
import type {
  AdCampaign,
  AdExperiment,
  ExperimentMatrix,
  ExperimentPrimaryMetric,
} from '@/lib/marketing/ads/types'
import { ExperimentStatusBadge } from './AdBadges'

// Matriz de experimentação. Transições passam pelo workflow no servidor;
// aqui a UI só oferece as saídas válidas (nextExperimentStatuses). Concluir
// validated/invalidated exige conclusão escrita — o service rejeita sem ela.

const API = '/api/admin/marketing/ads'

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus'
const selectCls =
  'rounded-lg border border-input-border bg-input px-2 py-2 text-sm outline-none'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const ghostBtn =
  'rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface disabled:opacity-50'

const METRIC_LABELS: Record<ExperimentPrimaryMetric, string> = {
  ctr: 'CTR',
  cpc: 'CPC',
  cpm: 'CPM',
  cpa_signup: 'Custo por cadastro',
  cac: 'CAC (custo por assinatura)',
  roas: 'ROAS',
  lp_conversion: 'Conversão da LP',
}

const MATRIX_FIELDS: Array<{ key: keyof ExperimentMatrix; label: string; placeholder: string }> = [
  { key: 'persona', label: 'Persona', placeholder: 'arquiteto autônomo' },
  { key: 'pain', label: 'Dor', placeholder: 'horas esperando render' },
  { key: 'promise', label: 'Promessa', placeholder: 'fidelidade ao projeto' },
  { key: 'format', label: 'Formato', placeholder: 'video_anuncio' },
  { key: 'creative', label: 'Criativo', placeholder: 'VIDEO01' },
  { key: 'copy', label: 'Copy', placeholder: 'COPY01' },
  { key: 'cta', label: 'CTA', placeholder: 'SIGN_UP' },
  { key: 'landing_page', label: 'Landing page', placeholder: 'render-em-minutos' },
  { key: 'channel', label: 'Canal', placeholder: 'meta' },
  { key: 'funnel_stage', label: 'Estágio', placeholder: 'topo' },
]

const MATRIX_KEY_LABELS: Record<string, string> = Object.fromEntries(
  MATRIX_FIELDS.map(f => [f.key, f.label]),
)

/** Nota automática ao encerrar sem amostra — inconclusivo nunca vira decisão. */
const INCONCLUSIVE_NOTE =
  'Encerrado como inconclusivo: amostra insuficiente para conclusão confiável no período — nenhuma decisão deve ser tomada com base neste teste.'

function transitionLabel(from: ExperimentStatus, to: ExperimentStatus): string {
  if (to === 'running') return from === 'inconclusive' ? 'Voltar a rodar' : 'Iniciar'
  if (to === 'validated') return 'Concluir: validada'
  if (to === 'invalidated') return 'Concluir: refutada'
  if (to === 'inconclusive') return 'Inconclusivo (amostra)'
  return 'Abandonar'
}

// ── Formulário de criação ──────────────────────────────────────────────────────

const EMPTY_MATRIX: Record<keyof ExperimentMatrix, string> = {
  persona: '', pain: '', promise: '', format: '', creative: '',
  copy: '', cta: '', landing_page: '', channel: '', funnel_stage: '',
}

function ExperimentForm({
  campaigns,
  busy,
  onSubmit,
  onCancel,
}: {
  campaigns: AdCampaign[]
  busy: boolean
  onSubmit: (values: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [matrixValues, setMatrixValues] = useState<Record<keyof ExperimentMatrix, string>>(EMPTY_MATRIX)
  const [primaryMetric, setPrimaryMetric] = useState<ExperimentPrimaryMetric>('cac')
  const [successCriteria, setSuccessCriteria] = useState('')
  const [campaignId, setCampaignId] = useState('')

  function submit() {
    const matrix: ExperimentMatrix = {}
    for (const f of MATRIX_FIELDS) {
      const v = matrixValues[f.key].trim()
      if (v) matrix[f.key] = v
    }
    onSubmit({
      name: name.trim(),
      hypothesis: hypothesis.trim(),
      matrix,
      primary_metric: primaryMetric,
      success_criteria: successCriteria.trim() || null,
      campaign_id: campaignId || null,
    })
  }

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do experimento" className={inputCls} autoFocus />
        <textarea
          value={hypothesis}
          onChange={e => setHypothesis(e.target.value)}
          placeholder="Hipótese (obrigatória) — ex.: a dor de prazo converte melhor que a de custo para arquitetos autônomos"
          rows={2}
          className={inputCls}
        />
        <div>
          <div className="text-xs text-text-tertiary">Célula da matriz (preencha só as dimensões testadas)</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MATRIX_FIELDS.map(f => (
              <input
                key={f.key}
                value={matrixValues[f.key]}
                onChange={e => setMatrixValues(v => ({ ...v, [f.key]: e.target.value }))}
                placeholder={`${f.label} — ${f.placeholder}`}
                className={inputCls}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={primaryMetric} onChange={e => setPrimaryMetric(e.target.value as ExperimentPrimaryMetric)} className={selectCls}>
            {(Object.keys(METRIC_LABELS) as ExperimentPrimaryMetric[]).map(m => (
              <option key={m} value={m}>Métrica: {METRIC_LABELS[m]}</option>
            ))}
          </select>
          <input
            value={successCriteria}
            onChange={e => setSuccessCriteria(e.target.value)}
            placeholder="Critério de sucesso — ex.: CAC ≤ R$ 120 com ≥ 10 assinaturas"
            className={inputCls}
          />
          <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className={selectCls}>
            <option value="">Sem campanha</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={submit} disabled={busy || !name.trim() || !hypothesis.trim()} className={primaryBtn}>
            {busy ? 'Salvando…' : 'Registrar experimento'}
          </button>
          <button onClick={onCancel} className={ghostBtn}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Cartão de experimento ──────────────────────────────────────────────────────

function ExperimentCard({ exp, campaignName }: { exp: AdExperiment; campaignName: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [concluding, setConcluding] = useState<ExperimentStatus | null>(null)
  const [conclusion, setConclusion] = useState('')
  const [nextAction, setNextAction] = useState('')

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/experiments/${exp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha na operação')
      setConcluding(null)
      setConclusion('')
      setNextAction('')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function transition(to: ExperimentStatus) {
    if (to === 'validated' || to === 'invalidated') {
      setConcluding(to)
      setError(null)
      return
    }
    if (to === 'inconclusive') {
      void patch({ status: 'inconclusive', conclusion: INCONCLUSIVE_NOTE })
      return
    }
    void patch({ status: to })
  }

  const matrixEntries = Object.entries(exp.matrix).filter(([, v]) => Boolean(v))

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{exp.name}</span>
        <ExperimentStatusBadge status={exp.status} />
      </div>
      <p className="mt-1 text-sm text-text-secondary">{exp.hypothesis}</p>

      {matrixEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matrixEntries.map(([k, v]) => (
            <span key={k} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-tertiary">
              {MATRIX_KEY_LABELS[k] ?? k}: {v}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
        <span>Métrica primária: {METRIC_LABELS[exp.primary_metric] ?? exp.primary_metric}</span>
        {exp.success_criteria && <span>Sucesso: {exp.success_criteria}</span>}
        {campaignName && <span>{campaignName}</span>}
        {exp.started_at && <span>início {formatDate(exp.started_at)}</span>}
        {exp.ended_at && <span>fim {formatDate(exp.ended_at)}</span>}
      </div>

      {exp.conclusion && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="text-xs text-text-tertiary">Conclusão</div>
          <p className="mt-0.5 text-text-secondary">{exp.conclusion}</p>
          {exp.next_action && (
            <>
              <div className="mt-2 text-xs text-text-tertiary">Próxima ação</div>
              <p className="mt-0.5 text-text-secondary">{exp.next_action}</p>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-error">{error}</p>}

      {nextExperimentStatuses(exp.status).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {nextExperimentStatuses(exp.status).map(to => (
            <button key={to} onClick={() => transition(to)} disabled={busy} className={ghostBtn}>
              {transitionLabel(exp.status, to)}
            </button>
          ))}
        </div>
      )}

      {concluding && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          <div className="text-xs text-text-tertiary">
            Concluir como {concluding === 'validated' ? 'hipótese validada' : 'hipótese refutada'} — a conclusão é obrigatória.
          </div>
          <textarea
            value={conclusion}
            onChange={e => setConclusion(e.target.value)}
            placeholder="O que os dados mostraram? Cite os números que sustentam a conclusão."
            rows={3}
            className={`${inputCls} mt-2`}
            autoFocus
          />
          <input
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            placeholder="Próxima ação — ex.: escalar o vencedor via fila de aprovação"
            className={`${inputCls} mt-2`}
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => patch({
                status: concluding,
                conclusion: conclusion.trim(),
                next_action: nextAction.trim() || null,
              })}
              disabled={busy || !conclusion.trim()}
              className={primaryBtn}
            >
              Concluir experimento
            </button>
            <button onClick={() => setConcluding(null)} className={ghostBtn}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────

interface Props {
  experiments: AdExperiment[]
  campaigns: AdCampaign[]
}

export function ExperimentsClient({ experiments, campaigns }: Props) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const campaignNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of campaigns) map.set(c.id, c.name)
    return map
  }, [campaigns])

  async function create(values: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao criar experimento')
      setCreating(false)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Experimentos</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Matriz de experimentação: uma hipótese por vez, com critério de sucesso definido antes.
            Amostra insuficiente encerra como inconclusivo — nunca vira decisão.
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className={primaryBtn}>Novo experimento</button>
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {creating && (
        <ExperimentForm
          campaigns={campaigns}
          busy={busy}
          onSubmit={create}
          onCancel={() => setCreating(false)}
        />
      )}

      {experiments.length === 0 && !creating ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhum experimento registrado. Todo teste pago começa aqui, com hipótese escrita.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {experiments.map(exp => (
            <ExperimentCard
              key={`${exp.id}:${exp.updated_at}`}
              exp={exp}
              campaignName={exp.campaign_id ? campaignNames.get(exp.campaign_id) ?? null : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
