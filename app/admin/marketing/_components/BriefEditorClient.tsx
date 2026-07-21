'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { APPROVED_CTAS, FORMATS, PILLARS, PLATFORMS, pillarLabel } from '@/lib/marketing/catalog'
import type { BriefDetail, BrandCheckSnapshot, LibraryGeneration } from '@/lib/marketing/types'
import { BriefStatusBadge } from './StatusBadge'

// Editor de briefing + área de aprovação. Edição direta só em rascunho /
// alterações solicitadas; decisões de revisão são sempre humanas; "Enviar para
// revisão" roda o verificador de marca antes e bloqueia se houver blocker.

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus disabled:opacity-60'
const labelCls = 'text-xs font-medium text-text-secondary'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const ghostBtn =
  'rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface disabled:opacity-50'
const dangerBtn =
  'rounded-lg border border-error-border bg-error-bg px-3 py-1.5 text-xs text-error transition-colors hover:opacity-80 disabled:opacity-50'
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

export function BriefEditorClient({ initialDetail }: { initialDetail: BriefDetail }) {
  const router = useRouter()
  const { brief, versions, approvals, assets, projects } = initialDetail

  const editable = brief.status === 'brief_draft' || brief.status === 'changes_requested'

  const [form, setForm] = useState({
    title: brief.title ?? '',
    hook: brief.hook ?? '',
    central_message: brief.central_message ?? '',
    format: brief.format ?? '',
    platform: brief.platform ?? 'instagram',
    pillar: brief.pillar ?? '',
    target_audience: brief.target_audience ?? '',
    script: brief.script ?? '',
    caption: brief.caption ?? '',
    call_to_action: brief.call_to_action ?? '',
    visual_direction: brief.visual_direction ?? '',
    required_assets: (brief.required_assets ?? []).join('\n'),
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [check, setCheck] = useState<BrandCheckSnapshot | null>(brief.brand_check)

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

  const patchBody = useMemo(() => ({
    ...form,
    format: form.format || null,
    pillar: form.pillar || null,
    hook: form.hook || null,
    central_message: form.central_message || null,
    target_audience: form.target_audience || null,
    script: form.script || null,
    caption: form.caption || null,
    call_to_action: form.call_to_action || null,
    visual_direction: form.visual_direction || null,
    required_assets: form.required_assets.split('\n').map(s => s.trim()).filter(Boolean),
  }), [form])

  const save = () => run('save', async () => {
    await api(`/api/admin/marketing/briefs/${brief.id}`, 'PATCH', patchBody)
    router.refresh()
  })

  const brandCheck = () => run('check', async () => {
    if (editable) await api(`/api/admin/marketing/briefs/${brief.id}`, 'PATCH', patchBody)
    const result = await api(`/api/admin/marketing/briefs/${brief.id}/brand-check`, 'POST')
    setCheck(result)
    router.refresh()
  })

  const sendToReview = () => run('send', async () => {
    // Salva, roda o verificador e só envia sem blockers — a exigência do fluxo
    // (verificação automática antes da revisão humana, nunca no lugar dela).
    await api(`/api/admin/marketing/briefs/${brief.id}`, 'PATCH', patchBody)
    const result: BrandCheckSnapshot = await api(`/api/admin/marketing/briefs/${brief.id}/brand-check`, 'POST')
    setCheck(result)
    const blockers = result.issues.filter(i => i.severity === 'blocker')
    if (blockers.length > 0) {
      throw new Error(`Verificação de marca reprovou (${blockers.length} bloqueio${blockers.length > 1 ? 's' : ''}) — corrija antes de enviar.`)
    }
    await api(`/api/admin/marketing/briefs/${brief.id}/review`, 'POST', { action: 'request' })
    router.refresh()
  })

  const review = (action: 'approve' | 'changes' | 'reject') => run(action, async () => {
    await api(`/api/admin/marketing/briefs/${brief.id}/review`, 'POST', { action, notes: notes || null })
    setNotes('')
    router.refresh()
  })

  const advance = (to: string) => run('advance', async () => {
    await api(`/api/admin/marketing/briefs/${brief.id}/review`, 'POST', { action: 'advance', to })
    router.refresh()
  })

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho + ações de fluxo ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{brief.title}</h1>
            <BriefStatusBadge status={brief.status} />
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {pillarLabel(brief.pillar)} · criado {new Date(brief.created_at).toLocaleDateString('pt-BR')} ·
            atualizado {new Date(brief.updated_at).toLocaleDateString('pt-BR')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <button onClick={save} disabled={busy !== null} className={ghostBtn}>
                {busy === 'save' ? 'Salvando…' : 'Salvar'}
              </button>
              <button onClick={sendToReview} disabled={busy !== null} className={primaryBtn}>
                {busy === 'send' ? 'Verificando…' : 'Enviar para revisão'}
              </button>
            </>
          )}
          {brief.status === 'approved' && (
            <button onClick={() => advance('ready_for_production')} disabled={busy !== null} className={primaryBtn}>
              Iniciar produção
            </button>
          )}
          {brief.status === 'ready_for_production' && (
            <button onClick={() => advance('asset_production')} disabled={busy !== null} className={primaryBtn}>
              Assets em produção
            </button>
          )}
          {brief.status === 'asset_production' && (
            <button onClick={() => advance('final_review')} disabled={busy !== null} className={primaryBtn}>
              Enviar para revisão final
            </button>
          )}
          {brief.status === 'ready_to_schedule' && (
            <span className="text-xs text-text-tertiary">
              Pronto. Agendamento/publicação entram com as integrações futuras — publicação segue manual.
            </span>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg border border-error-border bg-error-bg px-3 py-2 text-sm text-error">{error}</p>}

      {/* ── Área de decisão (revisão humana) ──────────────────────────────── */}
      {(brief.status === 'awaiting_review' || brief.status === 'final_review') && (
        <div className={cardCls}>
          <h2 className="text-sm font-medium">
            {brief.status === 'awaiting_review' ? 'Decisão de revisão' : 'Revisão final da peça'}
          </h2>
          <p className="mt-1 text-xs text-text-tertiary">
            A decisão é humana. Observações ficam registradas na trilha de aprovação.
          </p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observações da revisão (obrigatórias ao pedir alterações ou rejeitar)"
            rows={2}
            className={`mt-3 ${inputCls}`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {brief.status === 'awaiting_review' ? (
              <button onClick={() => review('approve')} disabled={busy !== null} className={primaryBtn}>Aprovar</button>
            ) : (
              <button onClick={() => advance('ready_to_schedule')} disabled={busy !== null} className={primaryBtn}>
                Aprovar peça final
              </button>
            )}
            <button
              onClick={() => review('changes')}
              disabled={busy !== null || !notes.trim()}
              className={ghostBtn}
              title={notes.trim() ? '' : 'Descreva o que precisa mudar'}
            >
              Solicitar alterações
            </button>
            {brief.status === 'awaiting_review' && (
              <button
                onClick={() => review('reject')}
                disabled={busy !== null || !notes.trim()}
                className={dangerBtn}
                title={notes.trim() ? '' : 'Registre o motivo da rejeição'}
              >
                Rejeitar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Coluna principal: conteúdo ─────────────────────────────────── */}
        <div className="space-y-6">
          <div className={cardCls}>
            <h2 className="text-sm font-medium">Conteúdo</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelCls}>Título (headline — máx. 8 palavras)</label>
                <input value={form.title} onChange={set('title')} disabled={!editable} className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className={labelCls}>
                  Gancho (1ª linha da legenda) — {form.hook.length}/125
                </label>
                <input value={form.hook} onChange={set('hook')} disabled={!editable}
                  className={`mt-1 ${inputCls} ${form.hook.length > 125 ? 'border-error-border' : ''}`} />
              </div>
              <div>
                <label className={labelCls}>Mensagem central</label>
                <textarea value={form.central_message} onChange={set('central_message')} disabled={!editable} rows={2} className={`mt-1 ${inputCls}`} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Pilar</label>
                  <select value={form.pillar} onChange={set('pillar')} disabled={!editable} className={`mt-1 ${inputCls}`}>
                    <option value="">—</option>
                    {PILLARS.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Formato</label>
                  <select value={form.format} onChange={set('format')} disabled={!editable} className={`mt-1 ${inputCls}`}>
                    <option value="">—</option>
                    {FORMATS.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Plataforma</label>
                  <select value={form.platform} onChange={set('platform')} disabled={!editable} className={`mt-1 ${inputCls}`}>
                    {PLATFORMS.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Público</label>
                <input value={form.target_audience} onChange={set('target_audience')} disabled={!editable} className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className={labelCls}>Roteiro / slides (um passo ou cena por linha)</label>
                <textarea value={form.script} onChange={set('script')} disabled={!editable} rows={5} className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className={labelCls}>Legenda (gancho + corpo + CTA + hashtags)</label>
                <textarea value={form.caption} onChange={set('caption')} disabled={!editable} rows={6} className={`mt-1 ${inputCls}`} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>CTA (lista aprovada)</label>
                  <select value={form.call_to_action} onChange={set('call_to_action')} disabled={!editable} className={`mt-1 ${inputCls}`}>
                    <option value="">—</option>
                    {APPROVED_CTAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Imagens/assets necessários (um por linha)</label>
                  <textarea value={form.required_assets} onChange={set('required_assets')} disabled={!editable} rows={2} className={`mt-1 ${inputCls}`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Direção visual (imagem real, enquadramento, verde funcional)</label>
                <textarea value={form.visual_direction} onChange={set('visual_direction')} disabled={!editable} rows={3} className={`mt-1 ${inputCls}`} />
              </div>
            </div>
          </div>

          {editable && <AiPanel briefId={brief.id} defaultTheme={form.title} busyTag={busy} onDone={() => router.refresh()} run={run} />}

          <AssetsPanel briefId={brief.id} assets={assets} editable={editable} run={run} busy={busy} onDone={() => router.refresh()} />

          <ProjectsPanel briefId={brief.id} projects={projects} run={run} busy={busy} onDone={() => router.refresh()} />
        </div>

        {/* ── Coluna lateral: verificação + histórico ─────────────────────── */}
        <div className="space-y-6">
          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Verificação de marca</h2>
              <button onClick={brandCheck} disabled={busy !== null} className={ghostBtn}>
                {busy === 'check' ? 'Verificando…' : 'Rodar'}
              </button>
            </div>
            {check ? (
              <div className="mt-3 space-y-2">
                <div className={`text-2xl font-semibold ${check.approved ? 'text-accent-green' : check.score >= 60 ? 'text-warning' : 'text-error'}`}>
                  {check.score}<span className="text-sm text-text-tertiary">/100</span>
                </div>
                <div className="text-xs text-text-tertiary">
                  {check.approved ? 'Sem bloqueios — pronto para revisão humana.' : 'Ajustes necessários antes da revisão.'}
                </div>
                <ul className="space-y-1.5">
                  {check.issues.map((issue, i) => (
                    <li key={i} className={`rounded-md border px-2.5 py-1.5 text-xs ${issue.severity === 'blocker' ? 'border-error-border bg-error-bg text-error' : 'border-warning-border bg-warning-bg text-warning'}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
                {check.suggestions.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-text-secondary">
                    {check.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-text-tertiary">
                Ainda não verificado. Roda automaticamente ao enviar para revisão.
              </p>
            )}
          </div>

          <div className={cardCls}>
            <h2 className="text-sm font-medium">Versões</h2>
            {versions.length === 0 ? (
              <p className="mt-3 text-xs text-text-tertiary">Nenhuma versão — a primeira nasce ao enviar para revisão.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {versions.map(v => (
                  <li key={v.id} className="rounded-md border border-border px-3 py-2 text-xs">
                    <span className="font-medium">v{v.version_number}</span>
                    <span className="text-text-tertiary"> · {new Date(v.created_at).toLocaleString('pt-BR')}</span>
                    {v.change_summary && <div className="mt-0.5 text-text-secondary">{v.change_summary}</div>}
                  </li>
                ))}
              </ul>
            )}
            {editable && versions.length > 0 && (
              <button
                onClick={() => run('version', async () => {
                  await api(`/api/admin/marketing/briefs/${brief.id}`, 'PATCH', patchBody)
                  await api(`/api/admin/marketing/briefs/${brief.id}/versions`, 'POST', { change_summary: 'Snapshot manual' })
                  router.refresh()
                })}
                disabled={busy !== null}
                className={`mt-3 ${ghostBtn}`}
              >
                Criar versão do estado atual
              </button>
            )}
          </div>

          <div className={cardCls}>
            <h2 className="text-sm font-medium">Trilha de aprovação</h2>
            {approvals.length === 0 ? (
              <p className="mt-3 text-xs text-text-tertiary">Nenhuma decisão registrada.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {approvals.map(a => (
                  <li key={a.id} className="rounded-md border border-border px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {{ awaiting_review: 'Enviado para revisão', approved: 'Aprovado', changes_requested: 'Alterações solicitadas', rejected: 'Rejeitado', draft: 'Rascunho' }[a.status] ?? a.status}
                      </span>
                      <span className="text-text-tertiary">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {a.review_notes && <div className="mt-0.5 text-text-secondary">{a.review_notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Painel de geração assistida por IA ─────────────────────────────────────────

function AiPanel({ briefId, defaultTheme, busyTag, run, onDone }: {
  briefId: string
  defaultTheme: string
  busyTag: string | null
  run: (tag: string, fn: () => Promise<void>) => Promise<void>
  onDone: () => void
}) {
  const [theme, setTheme] = useState('')
  const [feature, setFeature] = useState('')
  const [flags, setFlags] = useState<string[]>([])

  const generate = () => run('ai', async () => {
    const data = await api(`/api/admin/marketing/briefs/${briefId}/generate`, 'POST', {
      theme: theme || defaultTheme,
      feature_description: feature || null,
      apply: true,
    })
    setFlags(data.content?.risk_flags ?? [])
    onDone()
  })

  return (
    <div className={cardCls}>
      <h2 className="text-sm font-medium">Geração assistida por IA</h2>
      <p className="mt-1 text-xs text-text-tertiary">
        Gera rascunho dentro das regras da marca, evitando repetir conteúdos anteriores.
        O resultado substitui os campos acima e cria uma versão — a revisão humana continua obrigatória.
      </p>
      <div className="mt-3 space-y-2">
        <input value={theme} onChange={e => setTheme(e.target.value)}
          placeholder={`Tema da peça (padrão: "${defaultTheme || 'título do briefing'}")`} className={inputCls} />
        <textarea value={feature} onChange={e => setFeature(e.target.value)} rows={2}
          placeholder="Descrição real da funcionalidade/assunto — a IA não inventa recursos, dados nem depoimentos"
          className={inputCls} />
        <button onClick={generate} disabled={busyTag !== null} className={primaryBtn}>
          {busyTag === 'ai' ? 'Gerando…' : 'Gerar rascunho'}
        </button>
        {flags.length > 0 && (
          <div className="rounded-md border border-warning-border bg-warning-bg p-2.5">
            <div className="text-xs font-medium text-warning">Pontos para conferência humana:</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-warning">
              {flags.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Painel de assets ───────────────────────────────────────────────────────────

function AssetsPanel({ briefId, assets, editable, run, busy, onDone }: {
  briefId: string
  assets: BriefDetail['assets']
  editable: boolean
  run: (tag: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  onDone: () => void
}) {
  const [showLibrary, setShowLibrary] = useState(false)
  const [libKind, setLibKind] = useState<'render' | 'vista'>('render')
  const [items, setItems] = useState<LibraryGeneration[] | null>(null)

  const openLibrary = (kind: 'render' | 'vista') => run('lib', async () => {
    setLibKind(kind)
    setShowLibrary(true)
    setItems(null)
    const data = await api(`/api/admin/marketing/library?kind=${kind}`, 'GET')
    setItems(data.items)
  })

  const link = (generationId: string) => run('link', async () => {
    await api(`/api/admin/marketing/briefs/${briefId}/assets`, 'POST', { kind: libKind, generation_id: generationId })
    setShowLibrary(false)
    onDone()
  })

  const archive = (assetId: string) => run('archive', async () => {
    await api(`/api/admin/marketing/assets/${assetId}`, 'DELETE')
    onDone()
  })

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Assets vinculados</h2>
        <div className="flex gap-1.5">
          <button onClick={() => openLibrary('render')} disabled={busy !== null} className={ghostBtn}>+ Render</button>
          <button onClick={() => openLibrary('vista')} disabled={busy !== null} className={ghostBtn}>+ Vista (Spaces)</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-text-tertiary">
        Gerações reais do produto. Imagem de projeto de cliente exige permissão registrada abaixo antes da produção.
      </p>

      {assets.length === 0 ? (
        <p className="mt-3 text-xs text-text-tertiary">Nenhum asset vinculado.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {assets.map(a => (
            <div key={a.id} className="group relative overflow-hidden rounded-lg border border-border">
              {a.display_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL dinâmica de bucket privado
                <img src={a.display_url} alt={a.original_filename ?? a.source_type} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-text-tertiary">
                  {a.asset_type}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-scrim px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                <span>{a.source_type}</span>
                {editable && (
                  <button onClick={() => archive(a.id)} className="underline">remover</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showLibrary && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              {libKind === 'render' ? 'Renders recentes' : 'Vistas recentes (Spaces)'}
            </span>
            <button onClick={() => setShowLibrary(false)} className={ghostBtn}>Fechar</button>
          </div>
          {items === null ? (
            <p className="mt-3 text-xs text-text-tertiary">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="mt-3 text-xs text-text-tertiary">Nada encontrado.</p>
          ) : (
            <div className="mt-3 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-6">
              {items.map(item => (
                <button key={item.id} onClick={() => link(item.id)} disabled={busy !== null}
                  className="overflow-hidden rounded-md border border-border transition-opacity hover:opacity-80">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL dinâmica */}
                  <img src={item.url} alt={item.label ?? item.kind} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Painel de permissões de uso (projetos/gerações de clientes) ────────────────

const PERMISSION_LABELS: Record<string, string> = {
  pending: 'Pendente',
  requested: 'Solicitada',
  granted: 'Concedida',
  denied: 'Negada',
  not_required: 'Não necessária',
}

function ProjectsPanel({ briefId, projects, run, busy, onDone }: {
  briefId: string
  projects: BriefDetail['projects']
  run: (tag: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  onDone: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [permNotes, setPermNotes] = useState('')

  const add = () => run('proj', async () => {
    await api(`/api/admin/marketing/briefs/${briefId}/projects`, 'POST', {
      permission_status: 'pending',
      notes: permNotes || null,
    })
    setAdding(false)
    setPermNotes('')
    onDone()
  })

  const setPermission = (linkId: string, status: string) => run('perm', async () => {
    await api(`/api/admin/marketing/briefs/${briefId}/projects`, 'PATCH', {
      link_id: linkId,
      permission_status: status,
    })
    onDone()
  })

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Permissões de uso</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} disabled={busy !== null} className={ghostBtn}>
            Registrar permissão
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-text-tertiary">
        Material de projeto/geração de cliente só entra em produção com permissão concedida (e crédito, quando acordado).
      </p>

      {adding && (
        <div className="mt-3 space-y-2">
          <textarea value={permNotes} onChange={e => setPermNotes(e.target.value)} rows={2}
            placeholder="Quem autorizou, quando, crédito acordado — ou marque como não necessária (material próprio)"
            className={inputCls} />
          <div className="flex gap-2">
            <button onClick={add} disabled={busy !== null} className={primaryBtn}>Registrar</button>
            <button onClick={() => setAdding(false)} className={ghostBtn}>Cancelar</button>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <ul className="mt-3 space-y-2">
          {projects.map(link => (
            <li key={link.id} className="rounded-md border border-border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`font-medium ${link.permission_status === 'granted' ? 'text-accent-green' : link.permission_status === 'denied' ? 'text-error' : 'text-warning'}`}>
                  {PERMISSION_LABELS[link.permission_status] ?? link.permission_status}
                </span>
                <select
                  value={link.permission_status}
                  onChange={e => setPermission(link.id, e.target.value)}
                  disabled={busy !== null}
                  className="rounded-md border border-input-border bg-input px-2 py-1 text-xs outline-none"
                >
                  {Object.entries(PERMISSION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {link.notes && <div className="mt-1 text-text-secondary">{link.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
