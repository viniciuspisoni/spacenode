'use client'

// FinalizeImportModal — escolher imagem do histórico (base ou nova camada).
//
// Fontes (independente do provider que gerou — para o usuário é só "uma imagem
// do projeto"):
//   Renders → GET /api/renders/list (coluna real: output_url)
//   Vistas  → consulta RLS client-side (não existe API de listagem)
//   Edições → GET /api/edits (result_image_url)
//   Arquivo → upload direto browser→Storage (uploadDirect, área finalizar-asset)
//
// Mapeamento de URL TOLERANTE (lição do bug 2026-06-12). Clonado do
// EditV2ImportModal — que vive na branch do edit-v2, não na main.

import { useEffect, useRef, useState } from 'react'
import { Segmented, Sheet } from '@/components/app/glass'
import { createClient } from '@/lib/supabase/client'
import { toMediaProxyUrl } from '@/lib/storage/media-url'
import { uploadDirect } from '@/lib/storage/direct-upload-client'

type Tab = 'renders' | 'vistas' | 'edits'

interface Item {
  id: string
  url: string
  label: string
  createdAt: string
}

interface Props {
  open: boolean
  /** Rótulo do contexto: 'base' (primeira imagem) ou 'camada'. */
  purpose: 'base' | 'camada'
  onClose: () => void
  onSelect: (url: string) => void
}

function pickUrl(row: Record<string, unknown>): string | null {
  for (const key of ['output_url', 'image_url', 'result_image_url', 'result_url', 'public_url']) {
    const v = row[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

const EMPTY_COPY: Record<Tab, string> = {
  renders: 'Nenhum render concluído ainda. Gere uma imagem no Renderizar — ou envie um arquivo.',
  vistas: 'Nenhuma vista gerada em projetos ainda.',
  edits: 'Nenhuma edição anterior ainda.',
}

export function FinalizeImportModal({ open, purpose, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('renders')
  const [items, setItems] = useState<Record<Tab, Item[] | null>>({ renders: null, vistas: null, edits: null })
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open || items[tab] !== null) return
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        let list: Item[] = []
        if (tab === 'renders') {
          const res = await fetch(`/api/renders/list?cursor=${encodeURIComponent(new Date().toISOString())}`)
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error)
          list = (json.renders ?? [])
            .filter((r: { ambient?: string | null }) => r.ambient !== 'upscale' && r.ambient !== 'video')
            .map((r: Record<string, unknown>) => ({ id: String(r.id), url: pickUrl(r), label: String(r.ambient ?? r.style ?? 'Render'), createdAt: String(r.created_at ?? '') }))
            .filter((i: Item & { url: string | null }): i is Item => Boolean(i.url))
        } else if (tab === 'vistas') {
          const sb = createClient()
          const { data, error: qErr } = await sb
            .from('vistas')
            .select('id, image_url, axis_label, created_at')
            .eq('status', 'completed')
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(60)
          if (qErr) throw qErr
          list = (data ?? [])
            .map((v) => ({ id: String(v.id), url: pickUrl(v as Record<string, unknown>), label: String(v.axis_label ?? 'Vista'), createdAt: String(v.created_at ?? '') }))
            .filter((i): i is Item => Boolean(i.url))
        } else {
          const res = await fetch('/api/edits')
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error)
          list = (json.edits ?? [])
            .map((e: Record<string, unknown>) => ({ id: String(e.id), url: pickUrl(e), label: typeof e.prompt === 'string' && e.prompt ? e.prompt.slice(0, 40) : 'Edição', createdAt: String(e.created_at ?? '') }))
            .filter((i: Item & { url: string | null }): i is Item => Boolean(i.url))
        }
        if (!cancelled) setItems((prev) => ({ ...prev, [tab]: list }))
      } catch {
        if (!cancelled) setError('Não foi possível carregar o histórico.')
      }
    })()
    return () => { cancelled = true }
  }, [open, tab, items])

  async function handleFile(file: File) {
    try {
      setUploading(true)
      const { url } = await uploadDirect(file, 'finalizar-asset', { kind: 'source' })
      if (!url) throw new Error('Falha no upload')
      onSelect(url)
    } catch {
      setError('Não foi possível enviar a imagem.')
    } finally {
      setUploading(false)
    }
  }

  const current = items[tab]
  const count = (t: Tab) => (items[t] !== null ? ` (${items[t]!.length})` : '')

  return (
    <Sheet
      open={open}
      title={purpose === 'base' ? 'Escolher imagem base' : 'Adicionar camada'}
      onClose={onClose}
      doneLabel="Fechar"
      // O conteúdo é uma GRADE de miniaturas: nos 560px padrão da folha a
      // célula encolhe até não valer mais como escolha visual.
      className="spn-sheet--wide"
    >
      {/* A fonte é UM eixo que reconfigura tudo abaixo — então fica na
          superfície, como segmentado de 30px, e não como três abas soltas. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Segmented
          label="Fonte da imagem"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'renders', label: `Renders${count('renders')}` },
            { value: 'vistas', label: `Vistas${count('vistas')}` },
            { value: 'edits', label: `Edições${count('edits')}` },
          ]}
        />
        <button type="button" className="spn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ marginLeft: 'auto' }}>
          {uploading ? 'Enviando…' : 'Enviar arquivo'}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      </div>

      {error && <div className="spn-error">{error}</div>}
      {!error && current === null && <div className="spn-empty">Carregando…</div>}
      {!error && current !== null && current.length === 0 && <div className="spn-empty">{EMPTY_COPY[tab]}</div>}
      {!error && current && current.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {current.map((item) => (
            <button key={item.id} type="button" className="spn-glass" onClick={() => onSelect(item.url)}
              title={`${item.label} · ${item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : ''}`}
              style={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 'var(--r-inner)', overflow: 'hidden', cursor: 'pointer', padding: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={toMediaProxyUrl(item.url) ?? item.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
