'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdChannel, CampaignFront, CampaignObjective, FunnelStage } from '@/lib/marketing/ads/types'
import { FRONT_LABELS, FUNNEL_STAGE_LABELS, OBJECTIVE_LABELS } from '@/lib/marketing/ads/workflow'

// Criação rápida de campanha (padrão NewBriefButton.tsx). A campanha nasce em
// rascunho — publicação e ativação passam pelo fluxo de aprovação humana na
// página da campanha. Persona vira segmento do identificador SN_*.

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus'
const labelCls = 'text-xs font-medium text-text-secondary'

const FRONTS: CampaignFront[] = ['problema', 'demonstracao', 'produto', 'conversao']
const OBJECTIVES: CampaignObjective[] = ['prospeccao', 'demonstracao', 'conversao', 'remarketing', 'reconhecimento']
const FUNNEL_STAGES: FunnelStage[] = ['topo', 'meio', 'fundo', 'remarketing']

const CHANNEL_STATUS_NOTE: Record<string, string> = {
  planned: ' (planejado)',
  disabled: ' (desativado)',
}

export function NewCampaignButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [channels, setChannels] = useState<AdChannel[] | null>(null)

  const [name, setName] = useState('')
  const [channel, setChannel] = useState('')
  const [front, setFront] = useState<CampaignFront>('problema')
  const [objective, setObjective] = useState<CampaignObjective>('prospeccao')
  const [funnelStage, setFunnelStage] = useState<FunnelStage>('topo')
  const [persona, setPersona] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [budget, setBudget] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Canais carregam ao abrir o form (uma vez) — enabled primeiro na lista.
  async function openForm() {
    setOpen(true)
    if (channels !== null) return
    try {
      const res = await fetch('/api/admin/marketing/ads/channels')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar canais')
      const list = ((data.channels ?? []) as AdChannel[]).slice()
      const order: Record<string, number> = { enabled: 0, planned: 1, disabled: 2 }
      list.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
      setChannels(list)
      const first = list.find(c => c.status === 'enabled') ?? list[0]
      if (first) setChannel(first.slug)
    } catch (err) {
      setError((err as Error).message)
      setChannels([])
    }
  }

  async function create() {
    if (!name.trim() || !persona.trim() || !channel || busy) return
    setBusy(true)
    setError(null)
    try {
      // Orçamento entra em R$ (aceita vírgula decimal pt-BR) e sai em centavos.
      const budgetNumber = budget.trim()
        ? Number(budget.trim().replace(/\./g, '').replace(',', '.'))
        : null
      if (budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) {
        throw new Error('Orçamento diário inválido')
      }
      const res = await fetch('/api/admin/marketing/ads/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          channel_slug: channel,
          front,
          objective,
          funnel_stage: funnelStage,
          persona: persona.trim(),
          hypothesis: hypothesis.trim() || null,
          daily_budget_cents: budgetNumber !== null ? Math.round(budgetNumber * 100) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao criar campanha')
      const id = (data.campaign ?? data)?.id
      if (!id) throw new Error('Resposta sem id da campanha')
      router.push(`/admin/marketing/ads/campanhas/${id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover"
      >
        Nova campanha
      </button>
    )
  }

  return (
    <div className="w-full rounded-xl border border-border bg-bg-elevated p-4 sm:max-w-2xl">
      <div className="space-y-3">
        <div>
          <label htmlFor="nc-name" className={labelCls}>Nome da campanha</label>
          <input
            id="nc-name"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex.: Prospecção arquitetos — fidelidade ao projeto"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nc-channel" className={labelCls}>Canal</label>
            <select id="nc-channel" value={channel} onChange={e => setChannel(e.target.value)} className={`mt-1 ${inputCls}`}>
              {channels === null && <option value="">Carregando…</option>}
              {channels !== null && channels.length === 0 && <option value="">Nenhum canal cadastrado</option>}
              {(channels ?? []).map(c => (
                <option key={c.slug} value={c.slug}>
                  {c.name}{CHANNEL_STATUS_NOTE[c.status] ?? ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nc-persona" className={labelCls}>Persona (segmento do identificador)</label>
            <input
              id="nc-persona"
              value={persona}
              onChange={e => setPersona(e.target.value)}
              placeholder="ARQUITETO"
              className={`mt-1 ${inputCls}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="nc-front" className={labelCls}>Frente</label>
            <select id="nc-front" value={front} onChange={e => setFront(e.target.value as CampaignFront)} className={`mt-1 ${inputCls}`}>
              {FRONTS.map(f => <option key={f} value={f}>{FRONT_LABELS[f] ?? f}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="nc-objective" className={labelCls}>Objetivo</label>
            <select id="nc-objective" value={objective} onChange={e => setObjective(e.target.value as CampaignObjective)} className={`mt-1 ${inputCls}`}>
              {OBJECTIVES.map(o => <option key={o} value={o}>{OBJECTIVE_LABELS[o] ?? o}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="nc-funnel" className={labelCls}>Estágio do funil</label>
            <select id="nc-funnel" value={funnelStage} onChange={e => setFunnelStage(e.target.value as FunnelStage)} className={`mt-1 ${inputCls}`}>
              {FUNNEL_STAGES.map(s => <option key={s} value={s}>{FUNNEL_STAGE_LABELS[s] ?? s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="nc-hypothesis" className={labelCls}>Hipótese</label>
          <textarea
            id="nc-hypothesis"
            value={hypothesis}
            onChange={e => setHypothesis(e.target.value)}
            rows={2}
            placeholder="O que esta campanha quer provar? Ex.: a dor de perder o projeto na renderização converte melhor no topo"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div className="sm:max-w-[200px]">
          <label htmlFor="nc-budget" className={labelCls}>Orçamento diário (R$)</label>
          <input
            id="nc-budget"
            type="text"
            inputMode="decimal"
            value={budget}
            onChange={e => setBudget(e.target.value)}
            placeholder="30,00"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        {error && <p className="text-xs text-error">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={create}
            disabled={busy || !name.trim() || !persona.trim() || !channel}
            className="rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            {busy ? 'Criando…' : 'Criar campanha'}
          </button>
          <button
            onClick={() => setOpen(false)}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
