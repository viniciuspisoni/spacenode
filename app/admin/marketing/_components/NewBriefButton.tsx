'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PILLARS, FORMATS, PLATFORMS } from '@/lib/marketing/catalog'

// Criação rápida de briefing avulso (sem ideia de origem).

export function NewBriefButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [pillar, setPillar] = useState('')
  const [format, setFormat] = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/marketing/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, pillar: pillar || null, format: format || null, platform }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha ao criar briefing')
      router.push(`/admin/marketing/briefings/${data.brief.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover"
      >
        Novo briefing
      </button>
    )
  }

  return (
    <div className="w-full rounded-xl border border-border bg-bg-elevated p-4 sm:max-w-xl">
      <div className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Título de trabalho do briefing"
          className="w-full rounded-lg border border-input-border bg-input px-3 py-2 text-sm outline-none focus:border-border-focus"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={pillar} onChange={e => setPillar(e.target.value)}
            className="rounded-lg border border-input-border bg-input px-2 py-2 text-sm outline-none">
            <option value="">Pilar…</option>
            {PILLARS.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
          <select value={format} onChange={e => setFormat(e.target.value)}
            className="rounded-lg border border-input-border bg-input px-2 py-2 text-sm outline-none">
            <option value="">Formato…</option>
            {FORMATS.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
          </select>
          <select value={platform} onChange={e => setPlatform(e.target.value)}
            className="rounded-lg border border-input-border bg-input px-2 py-2 text-sm outline-none">
            {PLATFORMS.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={create}
            disabled={busy || !title.trim()}
            className="rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            {busy ? 'Criando…' : 'Criar'}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
