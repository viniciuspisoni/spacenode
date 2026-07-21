'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  AdAudience,
  AdCampaign,
  AdPendingAction,
  AdSet,
  AdWithStats,
  LandingPage,
} from '@/lib/marketing/ads/types'
import type { VerdictKind } from '@/lib/marketing/ads/metrics'
import {
  FRONT_LABELS,
  FUNNEL_STAGE_LABELS,
  OBJECTIVE_LABELS,
  nextCampaignStatuses,
  transitionRequiresApproval,
  type CampaignStatus,
} from '@/lib/marketing/ads/workflow'
import {
  formatBRLFromCents,
  formatDate,
  formatInt,
  formatMetricBRL,
  formatMetricPercent,
} from '@/lib/marketing/ads/format'
import { AdStatusBadge, CampaignStatusBadge, SampleNote } from './AdBadges'
import { MetricsIngestForm } from './MetricsIngestForm'

// Página da campanha: fluxo de status com aprovação humana obrigatória para
// publicar/ativar (o sistema NUNCA ativa gasto sozinho — regra dura de
// lib/marketing/ads/workflow.ts), conjuntos, anúncios com stats/veredito e
// importação manual de métricas.

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus disabled:opacity-60'
const labelCls = 'text-xs font-medium text-text-secondary'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const ghostBtn =
  'rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface disabled:opacity-50'
const cardCls = 'rounded-xl border border-border bg-bg-elevated p-5'

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Falha na operação')
  return data
}

/** Anúncio com stats + veredito calculado no server (classifyAds). */
export interface AdWithVerdict extends AdWithStats {
  verdict: VerdictKind
  rationale: string
}

// Rótulos de ação para as transições diretas (as gated viram solicitação).
const ADVANCE_LABELS: Record<string, string> = {
  pending_approval: 'Enviar para aprovação',
  approved: 'Aprovar campanha',
  draft: 'Voltar para rascunho',
  paused: 'Pausar',
  completed: 'Concluir',
  archived: 'Arquivar',
}

// Verde só no vencedor (funcional); perdedor em erro; sem amostra é neutro.
const VERDICT_TONE: Record<VerdictKind, string> = {
  winner: 'border-accent-green-border bg-accent-green-bg text-accent-green',
  loser: 'border-error-border bg-error-bg text-error',
  insufficient: 'border-border text-text-tertiary',
}
const VERDICT_LABELS: Record<VerdictKind, string> = {
  winner: 'Vencedor',
  loser: 'Perdedor',
  insufficient: 'Sem veredito',
}

function Counter({ len, max }: { len: number; max: number }) {
  return (
    <span className={`text-[11px] ${len > max ? 'text-error' : 'text-text-tertiary'}`}>
      {len}/{max}
    </span>
  )
}

interface Props {
  campaign: AdCampaign
  adSets: AdSet[]
  ads: AdWithVerdict[]
  pendingActions: AdPendingAction[]
  approvedActions: AdPendingAction[]
}

export function CampaignDetailClient({ campaign, adSets, ads, pendingActions, approvedActions }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hypothesis, setHypothesis] = useState(campaign.hypothesis ?? '')
  const [showAdSetForm, setShowAdSetForm] = useState(false)
  const [showAdForm, setShowAdForm] = useState(false)

  const isDraft = campaign.status === 'draft'
  const nexts = nextCampaignStatuses(campaign.status)

  async function run(tag: string, fn: () => Promise<void>) {
    setBusy(tag)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const advance = (to: CampaignStatus, approvedActionId?: string) => run(`adv-${to}`, async () => {
    await api(`/api/admin/marketing/ads/campaigns/${campaign.id}/advance`, 'POST', {
      to,
      ...(approvedActionId ? { approved_action_id: approvedActionId } : {}),
    })
    router.refresh()
  })

  const requestAction = (actionType: 'activate' | 'publish_campaign', to: CampaignStatus) =>
    run(`req-${actionType}`, async () => {
      await api('/api/admin/marketing/ads/actions', 'POST', {
        action_type: actionType,
        entity_level: 'campaign',
        entity_id: campaign.id,
        payload: { to },
      })
      router.refresh()
    })

  const saveHypothesis = () => run('hypothesis', async () => {
    await api(`/api/admin/marketing/ads/campaigns/${campaign.id}`, 'PATCH', {
      hypothesis: hypothesis.trim() || null,
    })
    router.refresh()
  })

  /** Botão de transição: as que mexem em gasto (ativar) e a publicação passam
   *  pelo fluxo de solicitação → aprovação humana → execução referenciando a
   *  ação aprovada. As demais avançam direto. */
  function flowControl(to: CampaignStatus) {
    const gated: 'activate' | 'publish_campaign' | null = transitionRequiresApproval(campaign.status, to)
      ? 'activate'
      : campaign.status === 'approved' && to === 'published_paused'
        ? 'publish_campaign'
        : null

    if (!gated) {
      return (
        <button key={to} onClick={() => advance(to)} disabled={busy !== null} className={ghostBtn}>
          {busy === `adv-${to}` ? 'Aplicando…' : (ADVANCE_LABELS[to] ?? to)}
        </button>
      )
    }

    const verb = gated === 'activate' ? 'Ativar' : 'Publicar'
    const approved = approvedActions.find(a => a.action_type === gated)
    if (approved) {
      return (
        <button key={to} onClick={() => advance(to, approved.id)} disabled={busy !== null} className={primaryBtn}>
          {busy === `adv-${to}` ? 'Aplicando…' : `${verb} (aprovada)`}
        </button>
      )
    }

    const pending = pendingActions.find(a => a.action_type === gated)
    if (pending) {
      return (
        <span key={to} className="rounded-lg border border-warning-border bg-warning-bg px-3 py-1.5 text-xs text-warning">
          {gated === 'activate' ? 'Ativação solicitada' : 'Publicação solicitada'} — aguardando{' '}
          <Link href="/admin/marketing/ads/aprovacao" className="underline">aprovação</Link>
        </span>
      )
    }

    return (
      <button key={to} onClick={() => requestAction(gated, to)} disabled={busy !== null} className={primaryBtn}>
        {busy === `req-${gated}` ? 'Solicitando…' : gated === 'activate' ? 'Solicitar ativação' : 'Solicitar publicação'}
      </button>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <div className="mt-1 font-mono text-xs text-text-tertiary">{campaign.identifier}</div>
          <p className="mt-1 text-xs text-text-tertiary">
            {FRONT_LABELS[campaign.front] ?? campaign.front} · {OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective} ·{' '}
            {FUNNEL_STAGE_LABELS[campaign.funnel_stage] ?? campaign.funnel_stage} · canal {campaign.channel_slug} ·{' '}
            criada {formatDate(campaign.created_at)}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Orçamento diário {formatBRLFromCents(campaign.daily_budget_cents)} · total {formatBRLFromCents(campaign.lifetime_budget_cents)}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-error-border bg-error-bg px-3 py-2 text-sm text-error">{error}</p>
      )}

      {/* ── Fluxo de status ────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <h2 className="text-sm font-medium">Fluxo de status</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Publicar e ativar exigem ação aprovada em{' '}
          <Link href="/admin/marketing/ads/aprovacao" className="underline">Aprovações</Link> — o sistema nunca ativa gasto sozinho.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {nexts.length === 0 ? (
            <span className="text-xs text-text-tertiary">Estado terminal — nenhuma transição disponível.</span>
          ) : (
            nexts.map(to => flowControl(to))
          )}
        </div>
      </div>

      {/* ── Hipótese ───────────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <h2 className="text-sm font-medium">Hipótese</h2>
        {isDraft ? (
          <div className="mt-3 space-y-2">
            <label htmlFor="camp-hypothesis" className="sr-only">Hipótese da campanha</label>
            <textarea
              id="camp-hypothesis"
              value={hypothesis}
              onChange={e => setHypothesis(e.target.value)}
              rows={2}
              placeholder="O que esta campanha quer provar?"
              className={inputCls}
            />
            <button onClick={saveHypothesis} disabled={busy !== null} className={ghostBtn}>
              {busy === 'hypothesis' ? 'Salvando…' : 'Salvar hipótese'}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">
            {campaign.hypothesis ?? 'Sem hipótese registrada.'}
          </p>
        )}
      </div>

      {/* ── Conjuntos de anúncios ──────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Conjuntos de anúncios</h2>
          {!showAdSetForm && (
            <button onClick={() => setShowAdSetForm(true)} disabled={busy !== null} className={ghostBtn}>
              Novo conjunto
            </button>
          )}
        </div>

        {adSets.length === 0 ? (
          <p className="mt-3 text-xs text-text-tertiary">Nenhum conjunto — anúncios podem ser criados direto na campanha.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {adSets.map(set => (
              <li key={set.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{set.name}</span>
                    <span className="ml-2 font-mono text-xs text-text-tertiary">{set.identifier}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary">diário {formatBRLFromCents(set.daily_budget_cents)}</span>
                    <CampaignStatusBadge status={set.status} />
                  </div>
                </div>
                {set.targeting_summary && (
                  <div className="mt-1 text-xs text-text-secondary">{set.targeting_summary}</div>
                )}
              </li>
            ))}
          </ul>
        )}

        {showAdSetForm && (
          <NewAdSetForm
            campaignId={campaign.id}
            busy={busy}
            run={run}
            onClose={() => setShowAdSetForm(false)}
            onDone={() => { setShowAdSetForm(false); router.refresh() }}
          />
        )}
      </div>

      {/* ── Anúncios ───────────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Anúncios</h2>
          {!showAdForm && (
            <button onClick={() => setShowAdForm(true)} disabled={busy !== null} className={ghostBtn}>
              Novo anúncio
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          Métricas dos últimos 30 dias. Veredito só com amostra suficiente — sem dado não existe perdedor.
        </p>

        {ads.length === 0 ? (
          <p className="mt-3 text-xs text-text-tertiary">Nenhum anúncio nesta campanha.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-tertiary">
                  <th className="px-3 py-2 font-medium">Anúncio</th>
                  <th className="px-3 py-2 text-right font-medium">Investimento</th>
                  <th className="px-3 py-2 text-right font-medium">Cliques</th>
                  <th className="px-3 py-2 text-right font-medium">CTR</th>
                  <th className="px-3 py-2 text-right font-medium">Cadastros</th>
                  <th className="px-3 py-2 text-right font-medium">Custo/cadastro</th>
                  <th className="px-3 py-2 font-medium">Veredito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ads.map(ad => (
                  <tr key={ad.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs">{ad.identifier}</div>
                      <div className="mt-1"><AdStatusBadge status={ad.status} /></div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatBRLFromCents(ad.totals.spend_cents)}</td>
                    <td className="px-3 py-2.5 text-right">{formatInt(ad.totals.clicks)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span>{formatMetricPercent(ad.derived.ctr, 2)}</span>
                      {!ad.derived.ctr.reliable && <div><SampleNote note={ad.derived.ctr.sampleNote} /></div>}
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatInt(ad.totals.signups)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span>{formatMetricBRL(ad.derived.cpa_signup_cents)}</span>
                      {!ad.derived.cpa_signup_cents.reliable && (
                        <div><SampleNote note={ad.derived.cpa_signup_cents.sampleNote} /></div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${VERDICT_TONE[ad.verdict]}`}>
                        {VERDICT_LABELS[ad.verdict]}
                      </span>
                      <div className="mt-1 max-w-[240px] text-[11px] text-text-tertiary">{ad.rationale}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showAdForm && (
          <NewAdForm
            campaignId={campaign.id}
            adSets={adSets}
            busy={busy}
            run={run}
            onClose={() => setShowAdForm(false)}
            onDone={() => { setShowAdForm(false); router.refresh() }}
          />
        )}
      </div>

      {/* ── Métricas (importação manual) ───────────────────────────────────── */}
      <MetricsIngestForm />
    </div>
  )
}

// ── Form: novo conjunto de anúncios ────────────────────────────────────────────

function NewAdSetForm({ campaignId, busy, run, onClose, onDone }: {
  campaignId: string
  busy: string | null
  run: (tag: string, fn: () => Promise<void>) => Promise<void>
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [audiences, setAudiences] = useState<AdAudience[]>([])
  const [audienceId, setAudienceId] = useState('')
  const [audienceSegment, setAudienceSegment] = useState('')
  const [budget, setBudget] = useState('')
  const [targeting, setTargeting] = useState('')

  // Públicos salvos são opcionais — falha ao carregar não trava o form.
  useEffect(() => {
    let alive = true
    fetch('/api/admin/marketing/ads/audiences')
      .then(res => res.json())
      .then(data => { if (alive) setAudiences((data.audiences ?? []) as AdAudience[]) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const create = () => run('adset', async () => {
    if (!name.trim()) throw new Error('Nome do conjunto é obrigatório')
    // R$ com vírgula decimal pt-BR → número → centavos.
    const budgetNumber = budget.trim()
      ? Number(budget.trim().replace(/\./g, '').replace(',', '.'))
      : null
    if (budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) {
      throw new Error('Orçamento diário inválido')
    }
    await api('/api/admin/marketing/ads/ad-sets', 'POST', {
      campaign_id: campaignId,
      name: name.trim(),
      audience_id: audienceId || null,
      audience_segment: audienceSegment.trim() || null,
      daily_budget_cents: budgetNumber !== null ? Math.round(budgetNumber * 100) : null,
      targeting_summary: targeting.trim() || null,
    })
    onDone()
  })

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="nas-name" className={labelCls}>Nome do conjunto</label>
          <input id="nas-name" autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex.: Interesses — arquitetura e render" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="nas-audience" className={labelCls}>Público salvo (opcional)</label>
          <select id="nas-audience" value={audienceId} onChange={e => setAudienceId(e.target.value)} className={`mt-1 ${inputCls}`}>
            <option value="">—</option>
            {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="nas-segment" className={labelCls}>Segmento do identificador</label>
          <input id="nas-segment" value={audienceSegment} onChange={e => setAudienceSegment(e.target.value)}
            placeholder="INTERESSES" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="nas-budget" className={labelCls}>Orçamento diário (R$)</label>
          <input id="nas-budget" type="text" inputMode="decimal" value={budget}
            onChange={e => setBudget(e.target.value)} placeholder="15,00" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="nas-targeting" className={labelCls}>Resumo da segmentação</label>
          <input id="nas-targeting" value={targeting} onChange={e => setTargeting(e.target.value)}
            placeholder="BR, 25–55, interesses em arquitetura" className={`mt-1 ${inputCls}`} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={create} disabled={busy !== null || !name.trim()} className={primaryBtn}>
          {busy === 'adset' ? 'Criando…' : 'Criar conjunto'}
        </button>
        <button onClick={onClose} disabled={busy !== null} className={ghostBtn}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Form: novo anúncio ─────────────────────────────────────────────────────────

const CTA_OPTIONS = ['SIGN_UP', 'LEARN_MORE'] as const
const LOGIN_DESTINATION = '/login?mode=signup'

function NewAdForm({ campaignId, adSets, busy, run, onClose, onDone }: {
  campaignId: string
  adSets: AdSet[]
  busy: string | null
  run: (tag: string, fn: () => Promise<void>) => Promise<void>
  onClose: () => void
  onDone: () => void
}) {
  const [adSetId, setAdSetId] = useState('')
  const [persona, setPersona] = useState('')
  const [pain, setPain] = useState('')
  const [promise, setPromise] = useState('')
  const [format, setFormat] = useState('')
  const [creativeLabel, setCreativeLabel] = useState('')
  const [copyVariant, setCopyVariant] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [cta, setCta] = useState<string>('SIGN_UP')
  const [destination, setDestination] = useState('login')
  const [landingPages, setLandingPages] = useState<LandingPage[]>([])

  // Destino: LP publicada ou cadastro direto. Falha ao listar LPs não trava —
  // o cadastro direto continua disponível.
  useEffect(() => {
    let alive = true
    fetch('/api/admin/marketing/ads/landing-pages')
      .then(res => res.json())
      .then(data => {
        if (!alive) return
        const pages = ((data.pages ?? []) as LandingPage[])
          .filter(lp => lp.status === 'published')
        setLandingPages(pages)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Limites do canal: headline 40, descrição 30, 1ª linha visível do texto 125.
  const firstLine = primaryText.split('\n')[0] ?? ''

  const create = () => run('ad', async () => {
    const lp = destination !== 'login' ? landingPages.find(p => p.id === destination) : undefined
    await api('/api/admin/marketing/ads/ads', 'POST', {
      campaign_id: campaignId,
      ad_set_id: adSetId || null,
      persona: persona.trim() || null,
      pain: pain.trim() || null,
      promise: promise.trim() || null,
      format: format.trim() || null,
      creative_label: creativeLabel.trim() || null,
      copy_variant: copyVariant.trim() || null,
      primary_text: primaryText.trim() || null,
      headline: headline.trim() || null,
      description: description.trim() || null,
      cta_button: cta,
      landing_page_id: lp ? lp.id : null,
      destination_path: lp ? `/lp/${lp.slug}` : LOGIN_DESTINATION,
    })
    onDone()
  })

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="na-adset" className={labelCls}>Conjunto (opcional)</label>
          <select id="na-adset" value={adSetId} onChange={e => setAdSetId(e.target.value)} className={`mt-1 ${inputCls}`}>
            <option value="">—</option>
            {adSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="na-persona" className={labelCls}>Persona</label>
          <input id="na-persona" value={persona} onChange={e => setPersona(e.target.value)}
            placeholder="ARQUITETO" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="na-pain" className={labelCls}>Dor</label>
          <input id="na-pain" value={pain} onChange={e => setPain(e.target.value)}
            placeholder="Render demora dias" className={`mt-1 ${inputCls}`} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="na-promise" className={labelCls}>Promessa</label>
          <input id="na-promise" value={promise} onChange={e => setPromise(e.target.value)}
            placeholder="FIDELIDADE" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="na-format" className={labelCls}>Formato</label>
          <input id="na-format" value={format} onChange={e => setFormat(e.target.value)}
            placeholder="video | imagem | carrossel" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="na-creative" className={labelCls}>Criativo</label>
          <input id="na-creative" value={creativeLabel} onChange={e => setCreativeLabel(e.target.value)}
            placeholder="VIDEO01" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="na-copy" className={labelCls}>Variação de copy</label>
          <input id="na-copy" value={copyVariant} onChange={e => setCopyVariant(e.target.value)}
            placeholder="COPY01" className={`mt-1 ${inputCls}`} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="na-primary" className={labelCls}>Texto principal (1ª linha é a visível)</label>
          <Counter len={firstLine.length} max={125} />
        </div>
        <textarea id="na-primary" value={primaryText} onChange={e => setPrimaryText(e.target.value)} rows={4}
          placeholder="1ª linha: gancho com a dor real. Depois: como o produto resolve, sem exagero."
          className={`mt-1 ${inputCls}`} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="na-headline" className={labelCls}>Headline</label>
            <Counter len={headline.length} max={40} />
          </div>
          <input id="na-headline" value={headline} onChange={e => setHeadline(e.target.value)} className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="na-description" className={labelCls}>Descrição</label>
            <Counter len={description.length} max={30} />
          </div>
          <input id="na-description" value={description} onChange={e => setDescription(e.target.value)} className={`mt-1 ${inputCls}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="na-cta" className={labelCls}>Botão (CTA)</label>
          <select id="na-cta" value={cta} onChange={e => setCta(e.target.value)} className={`mt-1 ${inputCls}`}>
            {CTA_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="na-destination" className={labelCls}>Destino</label>
          <select id="na-destination" value={destination} onChange={e => setDestination(e.target.value)} className={`mt-1 ${inputCls}`}>
            <option value="login">Cadastro direto ({LOGIN_DESTINATION})</option>
            {landingPages.map(lp => (
              <option key={lp.id} value={lp.id}>{lp.name} (/lp/{lp.slug})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={create} disabled={busy !== null} className={primaryBtn}>
          {busy === 'ad' ? 'Criando…' : 'Criar anúncio'}
        </button>
        <button onClick={onClose} disabled={busy !== null} className={ghostBtn}>Cancelar</button>
      </div>
    </div>
  )
}
