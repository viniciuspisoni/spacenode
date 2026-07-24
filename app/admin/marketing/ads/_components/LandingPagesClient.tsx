'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LandingPage, LandingSection } from '@/lib/marketing/ads/types'

// Landing pages de campanha: criar, editar, publicar/despublicar. As seções
// são editadas como JSON (união fechada LandingSection de
// lib/marketing/ads/types.ts) com validação de parse antes do PATCH.

const API = '/api/admin/marketing/ads'

const inputCls =
  'w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus'
const primaryBtn =
  'rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50'
const ghostBtn =
  'rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface disabled:opacity-50'

const SLUG_RE = /^[a-z0-9-]+$/

const SECTION_KINDS = ['value_props', 'before_after', 'modules', 'how_it_works', 'faq', 'quote'] as const

/** Dica do shape aceito (união LandingSection). */
const SECTIONS_HINT = `[
  { "kind": "value_props", "items": [{ "title": "…", "body": "…" }] },
  { "kind": "before_after", "pairs": [{ "before": "…", "after": "…", "label": "…" }] },
  { "kind": "modules", "module_ids": ["…"] },
  { "kind": "how_it_works", "steps": [{ "title": "…", "body": "…" }] },
  { "kind": "faq", "items": [{ "q": "…", "a": "…" }] },
  { "kind": "quote", "text": "…", "attribution": "…" }
]`

type ParsedSections =
  | { ok: true; sections: LandingSection[] }
  | { ok: false; error: string }

function parseSections(text: string): ParsedSections {
  if (!text.trim()) return { ok: true, sections: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `JSON inválido nas seções: ${(err as Error).message}` }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'As seções precisam ser um array JSON ([…]).' }
  }
  for (let i = 0; i < parsed.length; i++) {
    const s = parsed[i] as { kind?: unknown }
    const kind = typeof s === 'object' && s !== null ? String(s.kind ?? '') : ''
    if (!(SECTION_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: `Seção ${i + 1} sem "kind" válido (${SECTION_KINDS.join(', ')}).` }
    }
  }
  return { ok: true, sections: parsed as LandingSection[] }
}

const LP_TONE: Record<string, string> = {
  draft: 'border-border text-text-secondary',
  published: 'border-accent-green-border bg-accent-green-bg text-accent-green',
  archived: 'border-border text-text-tertiary',
}
const LP_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  published: 'Publicada',
  archived: 'Arquivada',
}

function LpStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${LP_TONE[status] ?? 'border-border text-text-secondary'}`}>
      {LP_LABELS[status] ?? status}
    </span>
  )
}

// ── Formulário (criação e edição) ──────────────────────────────────────────────

interface FormProps {
  lp?: LandingPage
  busy: boolean
  onSubmit: (values: Record<string, unknown>) => void
  onCancel: () => void
}

function LpForm({ lp, busy, onSubmit, onCancel }: FormProps) {
  const isEdit = Boolean(lp)
  const [slug, setSlug] = useState(lp?.slug ?? '')
  const [name, setName] = useState(lp?.name ?? '')
  const [headline, setHeadline] = useState(lp?.headline ?? '')
  const [subheadline, setSubheadline] = useState(lp?.subheadline ?? '')
  const [ctaLabel, setCtaLabel] = useState(lp?.cta_label ?? '')
  const [persona, setPersona] = useState(lp?.persona ?? '')
  const [pain, setPain] = useState(lp?.pain ?? '')
  const [metaTitle, setMetaTitle] = useState(lp?.meta_title ?? '')
  const [metaDescription, setMetaDescription] = useState(lp?.meta_description ?? '')
  const [sectionsText, setSectionsText] = useState(() => (lp ? JSON.stringify(lp.sections, null, 2) : ''))
  const [showHint, setShowHint] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const slugInvalid = !isEdit && slug.length > 0 && !SLUG_RE.test(slug)

  function submit() {
    setLocalError(null)
    if (!isEdit && !SLUG_RE.test(slug)) {
      setLocalError('Slug inválido — use apenas letras minúsculas, números e hífen.')
      return
    }
    const values: Record<string, unknown> = {
      name: name.trim(),
      headline: headline.trim() || null,
      subheadline: subheadline.trim() || null,
      cta_label: ctaLabel.trim() || null,
      persona: persona.trim() || null,
      pain: pain.trim() || null,
      meta_title: metaTitle.trim() || null,
      meta_description: metaDescription.trim() || null,
    }
    if (isEdit) {
      const parsed = parseSections(sectionsText)
      if (!parsed.ok) {
        setLocalError(parsed.error)
        return
      }
      values.sections = parsed.sections
    } else {
      values.slug = slug
    }
    onSubmit(values)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {isEdit ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <span className="text-xs text-text-tertiary">/lp/</span>
              <span className="font-mono text-sm">{slug}</span>
            </div>
          ) : (
            <div>
              <input
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="slug — ex.: render-em-minutos"
                className={`${inputCls} font-mono`}
                autoFocus
              />
              {slugInvalid && (
                <p className="mt-1 text-xs text-error">Apenas letras minúsculas, números e hífen.</p>
              )}
            </div>
          )}
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome interno" className={inputCls} />
        </div>
        <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Headline" className={inputCls} />
        <input value={subheadline} onChange={e => setSubheadline(e.target.value)} placeholder="Subheadline" className={inputCls} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="CTA — ex.: Comece grátis" className={inputCls} />
          <input value={persona} onChange={e => setPersona(e.target.value)} placeholder="Persona" className={inputCls} />
          <input value={pain} onChange={e => setPain(e.target.value)} placeholder="Dor central" className={inputCls} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={metaTitle} onChange={e => setMetaTitle(e.target.value)} placeholder="Meta title" className={inputCls} />
          <input value={metaDescription} onChange={e => setMetaDescription(e.target.value)} placeholder="Meta description" className={inputCls} />
        </div>

        {isEdit && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-tertiary">Seções (JSON)</label>
              <button type="button" onClick={() => setShowHint(h => !h)} className="text-xs text-text-tertiary underline">
                {showHint ? 'Esconder shape' : 'Ver shape aceito'}
              </button>
            </div>
            {showHint && (
              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-surface p-2 font-mono text-[11px] text-text-tertiary">
                {SECTIONS_HINT}
              </pre>
            )}
            <textarea
              value={sectionsText}
              onChange={e => setSectionsText(e.target.value)}
              rows={8}
              className={`${inputCls} mt-1 font-mono text-xs`}
              spellCheck={false}
            />
          </div>
        )}

        {localError && <p className="text-sm text-error">{localError}</p>}

        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={busy || !name.trim() || (!isEdit && !slug.trim())}
            className={primaryBtn}
          >
            {busy ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar landing page'}
          </button>
          <button onClick={onCancel} className={ghostBtn}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────

interface Props {
  landingPages: LandingPage[]
}

export function LandingPagesClient({ landingPages }: Props) {
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
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha na operação')
      router.refresh()
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function togglePublish(lp: LandingPage) {
    const publishing = lp.status !== 'published'
    const confirmed = window.confirm(
      publishing
        ? `Publicar "${lp.name}"? A página ficará acessível ao público em /lp/${lp.slug}.`
        : `Despublicar "${lp.name}"? A página /lp/${lp.slug} deixará de ser servida.`,
    )
    if (!confirmed) return
    await call(`${API}/landing-pages/${lp.id}`, 'PATCH', { status: publishing ? 'published' : 'draft' })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Landing pages</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Páginas de campanha servidas em /lp/&#123;slug&#125;. Só publicadas ficam acessíveis;
            noindex por padrão — quem indexa é a landing principal.
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className={primaryBtn}>Nova landing page</button>
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {creating && (
        <LpForm
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async values => {
            const ok = await call(`${API}/landing-pages`, 'POST', values)
            if (ok) setCreating(false)
          }}
        />
      )}

      {landingPages.length === 0 && !creating ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhuma landing page. Cada campanha deveria apontar para uma página com a mesma promessa do anúncio.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {landingPages.map(lp =>
            editing === lp.id ? (
              <div key={lp.id} className="p-4">
                <LpForm
                  lp={lp}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={async values => {
                    const ok = await call(`${API}/landing-pages/${lp.id}`, 'PATCH', values)
                    if (ok) setEditing(null)
                  }}
                />
              </div>
            ) : (
              <div key={lp.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{lp.name}</span>
                    <LpStatusBadge status={lp.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
                    {lp.status === 'published' ? (
                      <a
                        href={`/lp/${lp.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono underline hover:text-text-secondary"
                      >
                        /lp/{lp.slug}
                      </a>
                    ) : (
                      <span className="font-mono">/lp/{lp.slug}</span>
                    )}
                    {lp.persona && <span>persona: {lp.persona}</span>}
                    {lp.pain && <span>dor: {lp.pain}</span>}
                  </div>
                  {lp.headline && (
                    <p className="mt-1 line-clamp-1 text-xs text-text-secondary">{lp.headline}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <button onClick={() => setEditing(lp.id)} disabled={busy} className={ghostBtn}>
                    Editar
                  </button>
                  {lp.status !== 'archived' && (
                    <button onClick={() => togglePublish(lp)} disabled={busy} className={ghostBtn}>
                      {lp.status === 'published' ? 'Despublicar' : 'Publicar'}
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
