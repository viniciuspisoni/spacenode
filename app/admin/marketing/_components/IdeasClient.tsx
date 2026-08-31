'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PILLARS, pillarLabel } from '@/lib/marketing/catalog'
import { IDEA_PRIORITY_LABELS } from '@/lib/marketing/workflow'
import type { ContentIdea } from '@/lib/marketing/types'
import { IdeaStatusBadge } from './StatusBadge'

// Biblioteca de ideias: criar, editar, priorizar, arquivar e converter em
// briefing. Mutações via /api/admin/marketing/ideas*; a lista recarrega via
// router.refresh() (a página é server-rendered).

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus'
const selectCls =
  'rounded-lg border border-input-border bg-input px-2 py-2 text-sm outline-none'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const ghostBtn =
  'rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface'

interface Props {
  initialIdeas: ContentIdea[]
  statusFilter: string | null
}

export function IdeasClient({ initialIdeas, statusFilter }: Props) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function call(path: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha na operação')
      router.refresh()
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function convert(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/marketing/ideas/${id}/convert`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao converter')
      router.push(`/admin/marketing/briefings/${data.brief.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ideias</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Pautas registradas antes do briefing. Converter cria o rascunho e marca a ideia.
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className={primaryBtn}>Nova ideia</button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {[
          { v: null, label: 'Todas' },
          { v: 'open', label: 'Abertas' },
          { v: 'in_briefing', label: 'Em briefing' },
          { v: 'converted', label: 'Convertidas' },
          { v: 'archived', label: 'Arquivadas' },
        ].map(f => (
          <Link
            key={f.label}
            href={f.v ? `/admin/marketing/ideias?status=${f.v}` : '/admin/marketing/ideias'}
            className={`rounded-full border px-3 py-1 transition-colors ${statusFilter === f.v ? 'border-border-strong bg-surface text-text-primary' : 'border-border text-text-tertiary hover:text-text-secondary'}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {creating && (
        <IdeaForm
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async values => {
            const ok = await call('/api/admin/marketing/ideas', 'POST', values)
            if (ok) setCreating(false)
          }}
        />
      )}

      {initialIdeas.length === 0 && !creating ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhuma ideia registrada{statusFilter ? ' neste filtro' : ''}.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {initialIdeas.map(idea =>
            editing === idea.id ? (
              <div key={idea.id} className="p-4">
                <IdeaForm
                  idea={idea}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={async values => {
                    const ok = await call(`/api/admin/marketing/ideas/${idea.id}`, 'PATCH', values)
                    if (ok) setEditing(null)
                  }}
                />
              </div>
            ) : (
              <div key={idea.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{idea.title}</span>
                    <IdeaStatusBadge status={idea.status} />
                    {idea.priority !== 'normal' && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-tertiary">
                        {IDEA_PRIORITY_LABELS[idea.priority] ?? idea.priority}
                      </span>
                    )}
                  </div>
                  {idea.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{idea.description}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
                    <span>{pillarLabel(idea.pillar)}</span>
                    {idea.objective && <span>objetivo: {idea.objective}</span>}
                    <span>{new Date(idea.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {(idea.status === 'open' || idea.status === 'in_briefing') && (
                    <button onClick={() => convert(idea.id)} disabled={busy} className={ghostBtn}>
                      Virar briefing
                    </button>
                  )}
                  <button onClick={() => setEditing(idea.id)} disabled={busy} className={ghostBtn}>
                    Editar
                  </button>
                  {idea.status !== 'archived' ? (
                    <button
                      onClick={() => call(`/api/admin/marketing/ideas/${idea.id}`, 'PATCH', { status: 'archived' })}
                      disabled={busy}
                      className={ghostBtn}
                    >
                      Arquivar
                    </button>
                  ) : (
                    <button
                      onClick={() => call(`/api/admin/marketing/ideas/${idea.id}`, 'PATCH', { status: 'open' })}
                      disabled={busy}
                      className={ghostBtn}
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ── Formulário de ideia (criação/edição) ──────────────────────────────────────

interface FormProps {
  idea?: ContentIdea
  busy: boolean
  onSubmit: (values: Record<string, unknown>) => void
  onCancel: () => void
}

function IdeaForm({ idea, busy, onSubmit, onCancel }: FormProps) {
  const [title, setTitle] = useState(idea?.title ?? '')
  const [description, setDescription] = useState(idea?.description ?? '')
  const [pillar, setPillar] = useState(idea?.pillar ?? '')
  const [objective, setObjective] = useState(idea?.objective ?? '')
  const [audience, setAudience] = useState(idea?.target_audience ?? '')
  const [source, setSource] = useState(idea?.source ?? '')
  const [priority, setPriority] = useState(idea?.priority ?? 'normal')

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="space-y-3">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da pauta" className={inputCls} autoFocus />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descrição — o argumento, a prova, o material disponível"
          rows={2}
          className={inputCls}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <select value={pillar} onChange={e => setPillar(e.target.value)} className={selectCls}>
            <option value="">Pilar…</option>
            {PILLARS.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
          <input value={objective} onChange={e => setObjective(e.target.value)} placeholder="Objetivo" className={inputCls} />
          <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="Público" className={inputCls} />
          <select value={priority} onChange={e => setPriority(e.target.value as ContentIdea['priority'])} className={selectCls}>
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <input value={source} onChange={e => setSource(e.target.value)} placeholder="Fonte da pauta (feature nova, pergunta de usuário, calendário…)" className={inputCls} />
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit({
              title,
              description: description || null,
              pillar: pillar || null,
              objective: objective || null,
              target_audience: audience || null,
              source: source || null,
              priority,
            })}
            disabled={busy || !title.trim()}
            className={primaryBtn}
          >
            {busy ? 'Salvando…' : idea ? 'Salvar' : 'Registrar ideia'}
          </button>
          <button onClick={onCancel} className={ghostBtn}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
