'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AD_STATUSES,
  AD_STATUS_LABELS,
  FRONT_LABELS,
  FUNNEL_STAGE_LABELS,
  nextAdStatuses,
  transitionRequiresApproval,
  type AdStatus,
} from '@/lib/marketing/ads/workflow'
import type { Ad, AdCampaign, AdPendingAction, GeneratedAdBrief } from '@/lib/marketing/ads/types'
import type { BrandCheckSnapshot } from '@/lib/marketing/types'
import { AdStatusBadge } from './AdBadges'

// Biblioteca de anúncios + gerador assistido por IA. Mutações via
// /api/admin/marketing/ads/*; a página é server-rendered e recarrega com
// router.refresh(). Regras duras espelhadas do workflow: copy editável só em
// rascunho/revisão; ativar veiculação segue o fluxo solicitar → aprovar (fila
// de aprovação) → executar com a ação aprovada — o servidor valida de novo.

const API = '/api/admin/marketing/ads'

// Limites de copy do Meta (brand_rules.copy_limits — espelhados aqui para o
// contador ao vivo; o brand-check e o service validam de novo no servidor).
const FIRST_LINE_MAX = 125
const HEADLINE_MAX = 40
const DESCRIPTION_MAX = 30

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus'
const selectCls =
  'rounded-lg border border-input-border bg-input px-2 py-2 text-sm outline-none'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const ghostBtn =
  'rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface disabled:opacity-50'

/** Rótulo do botão que leva o anúncio a cada status de destino. */
const ADVANCE_LABELS: Record<AdStatus, string> = {
  draft: 'Voltar para rascunho',
  ready_for_review: 'Enviar para revisão',
  pending_approval: 'Pedir aprovação',
  approved: 'Aprovar',
  published_paused: 'Publicar (pausado)',
  active: 'Ativar veiculação',
  paused: 'Pausar',
  ended: 'Encerrar',
  archived: 'Arquivar',
}

const CTA_OPTIONS = [
  { value: 'SIGN_UP', label: 'Cadastre-se (SIGN_UP)' },
  { value: 'LEARN_MORE', label: 'Saiba mais (LEARN_MORE)' },
]

const GEN_FORMATS = [
  { value: 'video_anuncio', label: 'Vídeo de anúncio' },
  { value: 'imagem_estatica', label: 'Imagem estática' },
  { value: 'carrossel', label: 'Carrossel' },
  { value: 'story', label: 'Story' },
]

function Counter({ current, max }: { current: number; max: number }) {
  return (
    <span className={`text-[11px] tabular-nums ${current > max ? 'text-error' : 'text-text-tertiary'}`}>
      {current}/{max}
    </span>
  )
}

/** Resultado do verificador de marca (score + issues por severidade). */
function CheckPanel({ check }: { check: BrandCheckSnapshot }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs font-medium">
        Verificação de marca:{' '}
        <span className={check.approved ? 'text-accent-green' : 'text-warning'}>{check.score}/100</span>
        {!check.approved && <span className="ml-1 text-text-tertiary">— revisar antes de avançar</span>}
      </div>
      {check.issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {check.issues.map((issue, i) => (
            <li key={i} className={`text-xs ${issue.severity === 'blocker' ? 'text-error' : 'text-warning'}`}>
              [{issue.severity === 'blocker' ? 'bloqueio' : 'aviso'}] {issue.message}
            </li>
          ))}
        </ul>
      )}
      {check.suggestions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {check.suggestions.map((s, i) => (
            <li key={i} className="text-xs text-text-tertiary">{s}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Gerador com IA ─────────────────────────────────────────────────────────────

interface GenerateResult {
  brief: GeneratedAdBrief
  briefId: string
  adId?: string
}

function Row({ label, extra, children }: { label: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs text-text-tertiary">
        {label}
        {extra}
      </dt>
      <dd className="mt-0.5 text-sm text-text-secondary">{children}</dd>
    </div>
  )
}

function GeneratedBriefView({ brief }: { brief: GeneratedAdBrief }) {
  const firstLine = (brief.primary_text ?? '').split('\n')[0] ?? ''
  return (
    <dl className="space-y-2.5">
      <Row label="Hipótese">{brief.hypothesis}</Row>
      <Row label="Público">{brief.audience}</Row>
      <Row label="Estágio do funil">{brief.funnel_stage}</Row>
      <Row label="Conceito">{brief.concept}</Row>
      <Row label="Roteiro">
        <span className="whitespace-pre-wrap">{brief.script}</span>
      </Row>
      <Row
        label="Texto principal"
        extra={<span className="text-[11px] text-text-tertiary">1ª linha: <Counter current={firstLine.length} max={FIRST_LINE_MAX} /></span>}
      >
        <span className="whitespace-pre-wrap">{brief.primary_text}</span>
      </Row>
      <Row label="Headline" extra={<Counter current={brief.headline.length} max={HEADLINE_MAX} />}>
        {brief.headline}
      </Row>
      <Row label="Descrição" extra={<Counter current={brief.description.length} max={DESCRIPTION_MAX} />}>
        {brief.description}
      </Row>
      <Row label="CTA">{brief.cta_button}</Row>
      <Row label="Direção visual">{brief.visual_direction}</Row>
      <Row label="Formato">{brief.format}</Row>
      <Row label="Sugestão de utm_content">
        <span className="font-mono text-xs">{brief.utm_content_hint}</span>
      </Row>
      <Row label="Critério de sucesso">{brief.success_criteria}</Row>
      {brief.risk_flags.length > 0 && (
        <div>
          <dt className="text-xs text-text-tertiary">Riscos apontados</dt>
          <dd className="mt-1 space-y-1">
            {brief.risk_flags.map((r, i) => (
              <p key={i} className="rounded-lg border border-warning-border bg-warning-bg px-2 py-1 text-xs text-warning">
                {r}
              </p>
            ))}
          </dd>
        </div>
      )}
    </dl>
  )
}

function GenerateSection({ campaigns }: { campaigns: AdCampaign[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const [front, setFront] = useState('problema')
  const [persona, setPersona] = useState('')
  const [pain, setPain] = useState('')
  const [promiseText, setPromiseText] = useState('')
  const [format, setFormat] = useState('video_anuncio')
  const [funnelStage, setFunnelStage] = useState('topo')
  const [extra, setExtra] = useState('')
  const [result, setResult] = useState<GenerateResult | null>(null)

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId || undefined,
          front,
          persona: persona.trim(),
          pain: pain.trim() || undefined,
          promise: promiseText.trim() || undefined,
          format,
          funnel_stage: funnelStage,
          extra_context: extra.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao gerar o brief')
      setResult(data as unknown as GenerateResult)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Gerar com IA</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            O gerador propõe hipótese, conceito, roteiro e copy a partir da matriz. Tudo entra como rascunho.
          </p>
        </div>
        <button onClick={() => setOpen(o => !o)} className={open ? ghostBtn : primaryBtn}>
          {open ? 'Fechar' : 'Gerar anúncio'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className={selectCls}>
              <option value="">Sem campanha (rascunho avulso)</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={front} onChange={e => setFront(e.target.value)} className={selectCls}>
              {Object.entries(FRONT_LABELS).map(([v, label]) => (
                <option key={v} value={v}>Frente: {label}</option>
              ))}
            </select>
            <select value={funnelStage} onChange={e => setFunnelStage(e.target.value)} className={selectCls}>
              {Object.entries(FUNNEL_STAGE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={persona} onChange={e => setPersona(e.target.value)} placeholder="Persona (ex.: arquiteto autônomo)" className={inputCls} />
            <input value={pain} onChange={e => setPain(e.target.value)} placeholder="Dor (ex.: horas esperando render)" className={inputCls} />
            <input value={promiseText} onChange={e => setPromiseText(e.target.value)} placeholder="Promessa (ex.: fidelidade ao projeto)" className={inputCls} />
            <select value={format} onChange={e => setFormat(e.target.value)} className={selectCls}>
              {GEN_FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <textarea
            value={extra}
            onChange={e => setExtra(e.target.value)}
            placeholder="Contexto extra (opcional) — ângulo, prova disponível, referência"
            rows={2}
            className={inputCls}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={generate} disabled={busy || !persona.trim()} className={primaryBtn}>
              {busy ? 'Gerando…' : 'Gerar brief'}
            </button>
            {error && <p className="text-sm text-error">{error}</p>}
          </div>

          {result && (
            <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <div className="rounded-lg border border-warning-border bg-warning-bg p-2 text-xs text-warning">
                Salvo como rascunho — revisão humana obrigatória antes de qualquer publicação.
              </div>
              {result.adId && (
                <p className="text-xs text-text-tertiary">Rascunho de anúncio criado — revise na biblioteca abaixo.</p>
              )}
              <GeneratedBriefView brief={result.brief} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Cartão de anúncio (com editor inline) ──────────────────────────────────────

function AdCard({
  ad,
  campaignName,
  pendingAction,
  approvedAction,
}: {
  ad: Ad
  campaignName: string | null
  pendingAction: AdPendingAction | null
  approvedAction: AdPendingAction | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [primaryText, setPrimaryText] = useState(ad.primary_text ?? '')
  const [headline, setHeadline] = useState(ad.headline ?? '')
  const [description, setDescription] = useState(ad.description ?? '')
  const [cta, setCta] = useState(ad.cta_button ?? 'SIGN_UP')
  const [checkResult, setCheckResult] = useState<BrandCheckSnapshot | null>(null)
  const [activationTo, setActivationTo] = useState<AdStatus | null>(null)

  // key estável (ad.id) mantém o cartão montado após router.refresh(); ao
  // reabrir, ressincroniza os rascunhos com o que está salvo no servidor.
  function toggleOpen() {
    setOpen(o => {
      if (!o) {
        setPrimaryText(ad.primary_text ?? '')
        setHeadline(ad.headline ?? '')
        setDescription(ad.description ?? '')
        setCta(ad.cta_button ?? 'SIGN_UP')
      }
      return !o
    })
  }

  const editable = ad.status === 'draft' || ad.status === 'ready_for_review'
  const check = checkResult ?? ad.brand_check
  const firstLine = primaryText.split('\n')[0] ?? ''
  const matrixLine = [ad.persona, ad.pain, ad.promise].filter(Boolean).join(' · ')

  async function call(path: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha na operação')
      return data
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const data = await call(`${API}/ads/${ad.id}`, 'PATCH', {
      primary_text: primaryText || null,
      headline: headline || null,
      description: description || null,
      cta_button: cta || null,
    })
    if (data) router.refresh()
  }

  async function runCheck() {
    const data = await call(`${API}/ads/${ad.id}/brand-check`, 'POST')
    if (data) {
      setCheckResult((data.result ?? data) as BrandCheckSnapshot)
      router.refresh()
    }
  }

  async function advance(to: AdStatus, approvedActionId?: string) {
    const body: Record<string, unknown> = { to }
    if (approvedActionId) body.approved_action_id = approvedActionId
    const data = await call(`${API}/ads/${ad.id}/advance`, 'POST', body)
    if (data) {
      setActivationTo(null)
      router.refresh()
    }
  }

  // Solicita a ativação (vira ad_pending_actions) — a decisão é humana, na
  // fila de aprovação; executar de fato só com a ação aprovada.
  async function requestActivation(to: AdStatus) {
    const data = await call(`${API}/actions`, 'POST', {
      action_type: 'activate',
      entity_level: 'ad',
      entity_id: ad.id,
      payload: { to },
      reason: `Ativação do anúncio ${ad.identifier}`,
    })
    if (data) {
      setActivationTo(null)
      router.refresh()
    }
  }

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{ad.identifier}</span>
            <AdStatusBadge status={ad.status} />
            {check && (
              <span className={`text-[11px] ${check.approved ? 'text-accent-green' : 'text-warning'}`}>
                verificação: {check.score}/100
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
            {campaignName && <span>{campaignName}</span>}
            {matrixLine && <span>{matrixLine}</span>}
            {ad.format && <span>{ad.format}</span>}
          </div>
          {ad.primary_text && (
            <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{ad.primary_text}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-text-tertiary">{open ? 'Fechar' : 'Abrir'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {error && <p className="text-sm text-error">{error}</p>}

          {editable ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-text-tertiary">Texto principal</label>
                  <span className="text-[11px] text-text-tertiary">
                    1ª linha: <Counter current={firstLine.length} max={FIRST_LINE_MAX} /> · total: {primaryText.length}
                  </span>
                </div>
                <textarea value={primaryText} onChange={e => setPrimaryText(e.target.value)} rows={4} className={`${inputCls} mt-1`} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-text-tertiary">Headline</label>
                    <Counter current={headline.length} max={HEADLINE_MAX} />
                  </div>
                  <input value={headline} onChange={e => setHeadline(e.target.value)} className={`${inputCls} mt-1`} />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-text-tertiary">Descrição</label>
                    <Counter current={description.length} max={DESCRIPTION_MAX} />
                  </div>
                  <input value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} mt-1`} />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-tertiary">Botão (CTA)</label>
                <div className="mt-1">
                  <select value={cta} onChange={e => setCta(e.target.value)} className={selectCls}>
                    {CTA_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={save} disabled={busy} className={primaryBtn}>
                  {busy ? 'Salvando…' : 'Salvar copy'}
                </button>
                <button onClick={runCheck} disabled={busy} className={ghostBtn}>Verificar marca</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {ad.primary_text && (
                <div>
                  <div className="text-xs text-text-tertiary">Texto principal</div>
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">{ad.primary_text}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
                {ad.headline && <span>Headline: {ad.headline}</span>}
                {ad.description && <span>Descrição: {ad.description}</span>}
                {ad.cta_button && <span>CTA: {ad.cta_button}</span>}
              </div>
              {ad.destination_url && (
                <div className="truncate font-mono text-[11px] text-text-tertiary" title={ad.destination_url}>
                  {ad.destination_url}
                </div>
              )}
              <p className="text-xs text-text-tertiary">Copy editável apenas em rascunho ou pronto para revisão.</p>
              <button onClick={runCheck} disabled={busy} className={ghostBtn}>Verificar marca</button>
            </div>
          )}

          {check && <CheckPanel check={check} />}

          <div className="border-t border-border pt-3">
            <div className="text-xs text-text-tertiary">Fluxo de status</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nextAdStatuses(ad.status).map(to =>
                transitionRequiresApproval(ad.status, to) ? (
                  <button
                    key={to}
                    onClick={() => { setActivationTo(to); setError(null) }}
                    disabled={busy}
                    className={ghostBtn}
                  >
                    {ADVANCE_LABELS[to]}…
                  </button>
                ) : (
                  <button key={to} onClick={() => advance(to)} disabled={busy} className={ghostBtn}>
                    {ADVANCE_LABELS[to]}
                  </button>
                ),
              )}
            </div>
            {activationTo && (
              <div className="mt-3 rounded-lg border border-warning-border bg-warning-bg p-3">
                <p className="text-xs text-warning">
                  Ativar veiculação gasta orçamento real — o sistema nunca ativa gasto sozinho.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {approvedAction ? (
                    <button
                      onClick={() => advance(activationTo, approvedAction.id)}
                      disabled={busy}
                      className={primaryBtn}
                    >
                      Ativar (aprovação registrada)
                    </button>
                  ) : pendingAction ? (
                    <p className="text-xs text-text-secondary">
                      Ativação já solicitada — decida na{' '}
                      <Link href="/admin/marketing/ads/aprovacao" className="underline">fila de aprovação</Link>.
                    </p>
                  ) : (
                    <button
                      onClick={() => requestActivation(activationTo)}
                      disabled={busy}
                      className={primaryBtn}
                    >
                      Solicitar ativação
                    </button>
                  )}
                  <button onClick={() => setActivationTo(null)} className={ghostBtn}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────

interface Props {
  ads: Ad[]
  campaigns: AdCampaign[]
  pendingActions: AdPendingAction[]
  approvedActions: AdPendingAction[]
}

const ACTIVATION_TYPES = ['activate', 'resume']

export function AdsLibraryClient({ ads, campaigns, pendingActions, approvedActions }: Props) {
  const [campaignFilter, setCampaignFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const campaignNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of campaigns) map.set(c.id, c.name)
    return map
  }, [campaigns])

  const filtered = ads.filter(ad =>
    (!campaignFilter || ad.campaign_id === campaignFilter) &&
    (!statusFilter || ad.status === statusFilter),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Anúncios</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Biblioteca da matriz de experimentação — copy, verificação de marca e fluxo de status.
          Ativar veiculação exige ação aprovada na fila de aprovação.
        </p>
      </div>

      <GenerateSection campaigns={campaigns} />

      <div className="flex flex-wrap gap-2">
        <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} className={selectCls}>
          <option value="">Todas as campanhas</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">Todos os status</option>
          {AD_STATUSES.map(s => (
            <option key={s} value={s}>{AD_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          {ads.length > 0 ? 'Nenhum anúncio neste filtro.' : 'Nenhum anúncio ainda — gere um rascunho com IA acima.'}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {filtered.map(ad => (
            <AdCard
              key={ad.id}
              ad={ad}
              campaignName={campaignNames.get(ad.campaign_id) ?? null}
              pendingAction={
                pendingActions.find(a => a.entity_id === ad.id && ACTIVATION_TYPES.includes(a.action_type)) ?? null
              }
              approvedAction={
                approvedActions.find(a => a.entity_id === ad.id && ACTIVATION_TYPES.includes(a.action_type)) ?? null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
