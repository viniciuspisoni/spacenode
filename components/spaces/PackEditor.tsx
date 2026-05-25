'use client'

// Editor de Pack — narrativa, vistas selecionadas, identidade, preview A4, share.
// Auto-cria pack draft no primeiro mount se não existir.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type {
  Space, Vista, Pack, PackNarrative, ProjectDNA, ArchitectIdentity,
} from '@/lib/spaces/types'
import { getAccentColor } from '@/lib/spaces/identity'
import { getVisualDna } from '@/lib/spaces/dna'

const NARRATIVES: { id: PackNarrative; label: string; description: string }[] = [
  { id: 'tour',      label: 'Tour',         description: 'Apresentação completa em ordem natural' },
  { id: 'dia_noite', label: 'Dia & Noite',  description: 'Mesma vista em iluminações distintas'    },
  { id: 'detalhes',  label: 'Detalhes',     description: 'Foco em zoom + materiais'                },
  { id: 'hero',      label: 'Hero',         description: 'Uma vista única, em destaque'            },
]

interface Props {
  space:        Space
  vistas:       Vista[]
  initialPack:  Pack | null
  identity:     ArchitectIdentity | null
}

export function PackEditor({ space, vistas, initialPack, identity }: Props) {
  const [pack, setPack]               = useState<Pack | null>(initialPack)
  const [creating, setCreating]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [generatingShare, setGenSh]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [shareUrl, setShareUrl]       = useState<string | null>(null)
  const [copied, setCopied]           = useState(false)

  // Auto-cria pack draft se não houver
  useEffect(() => {
    if (pack || creating) return
    if (vistas.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCreating(true)
    fetch('/api/packs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ space_id: space.id }),
    })
      .then(r => r.json())
      .then(data => { if (data?.pack) setPack(data.pack as Pack) })
      .catch(() => setError('Erro ao iniciar pack'))
      .finally(() => setCreating(false))
  }, [pack, creating, vistas.length, space.id])

  const dna = getVisualDna(space.dna)
  const accent = getAccentColor(identity, dna)

  const orderedIds = pack?.vistas_ordered ?? []
  const orderedVistas = useMemo(
    () => orderedIds.map(id => vistas.find(v => v.id === id)).filter(Boolean) as Vista[],
    [orderedIds, vistas],
  )

  async function patchPack(patch: Partial<{ narrative: PackNarrative; vistas_ordered: string[]; client_name: string; client_email: string; description: string }>) {
    if (!pack) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/packs/${pack.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro')
      setPack(data.pack as Pack)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function toggleVista(id: string) {
    if (!pack) return
    const next = orderedIds.includes(id)
      ? orderedIds.filter(x => x !== id)
      : [...orderedIds, id]
    patchPack({ vistas_ordered: next })
  }

  async function generateShare() {
    if (!pack) return
    setGenSh(true)
    setError(null)
    try {
      const res = await fetch(`/api/packs/${pack.id}/share`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro')
      const url = `${window.location.origin}/p/${data.token}`
      setShareUrl(url)
      setPack(p => p ? { ...p, share_token: data.token, expires_at: data.expires_at } : p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenSh(false)
    }
  }

  async function exportPdf() {
    if (!pack) return
    const res = await fetch(`/api/packs/${pack.id}/export-pdf`, { method: 'POST' })
    const data = await res.json()
    alert(data.message ?? 'Exportação em PDF estará disponível em breve.')
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Pre-existing share link
  useEffect(() => {
    if (pack?.share_token && !shareUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShareUrl(`${window.location.origin}/p/${pack.share_token}`)
    }
  }, [pack?.share_token, shareUrl])

  if (vistas.length === 0) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 32px', textAlign: 'center' }}>
        <Link
          href={`/app/spaces/${space.id}`}
          style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}
        >
          ← {space.name}
        </Link>
        <div style={{
          marginTop: 32, padding: 40,
          background: 'var(--color-bg-elevated)',
          border: '0.5px dashed var(--color-border-strong)',
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Nenhuma variação completa ainda
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Gere variações no Space antes de montar um Pack.
          </div>
        </div>
      </div>
    )
  }

  if (!pack) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 32px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        Iniciando pack…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        gap: 16, marginBottom: 28, flexWrap: 'wrap',
      }}>
        <div>
          <Link href={`/app/spaces/${space.id}`} style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            ← {space.name}
          </Link>
          <h1 style={{
            fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 8,
          }}>
            Pack do projeto
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
            {orderedVistas.length} vista{orderedVistas.length === 1 ? '' : 's'} selecionada{orderedVistas.length === 1 ? '' : 's'}
            {saving && <span style={{ marginLeft: 8 }}>· salvando…</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={exportPdf}
            className="spn-action spn-action--ghost"
            style={{ width: 'auto', padding: '10px 16px', fontSize: 12 }}
          >
            Exportar PDF
          </button>
          <button
            onClick={generateShare}
            disabled={generatingShare || orderedVistas.length === 0}
            className="spn-action spn-action--primary"
            style={{ width: 'auto', padding: '10px 16px', fontSize: 12 }}
          >
            {generatingShare ? '…' : (shareUrl ? 'Renovar link' : 'Gerar link compartilhável')}
          </button>
        </div>
      </div>

      {/* Share URL */}
      {shareUrl && (
        <div style={{
          marginBottom: 24,
          padding: '14px 16px', borderRadius: 12,
          background: 'rgba(29,158,117,0.08)', border: '0.5px solid rgba(29,158,117,0.3)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: '#46d191', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Link público
          </span>
          <code style={{
            flex: 1, minWidth: 240, fontSize: 12, color: 'var(--color-text-primary)',
            fontFamily: 'ui-monospace,Menlo,monospace',
            background: 'var(--color-bg-elevated)',
            padding: '6px 10px', borderRadius: 6,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {shareUrl}
          </code>
          <button onClick={() => copy(shareUrl)} className="spn-action spn-action--ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="spn-action spn-action--ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}>
            Abrir →
          </a>
        </div>
      )}

      {error && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'grid', gap: 24,
        gridTemplateColumns: 'minmax(280px, 320px) 1fr',
      }}>

        {/* Coluna esquerda: controles */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          <ControlBlock label="Narrativa">
            <select
              value={pack.narrative}
              onChange={e => patchPack({ narrative: e.target.value as PackNarrative })}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 8, color: 'var(--color-text-primary)',
                fontSize: 13,
              }}
            >
              {NARRATIVES.map(n => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
              {NARRATIVES.find(n => n.id === pack.narrative)?.description}
            </div>
          </ControlBlock>

          <ControlBlock label="Cliente (opcional)">
            <input
              type="text"
              defaultValue={pack.client_name ?? ''}
              onBlur={e => e.target.value !== (pack.client_name ?? '') && patchPack({ client_name: e.target.value })}
              placeholder="Nome do cliente"
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 8, color: 'var(--color-text-primary)',
                fontSize: 13, marginBottom: 8,
              }}
            />
            <textarea
              defaultValue={pack.description ?? ''}
              onBlur={e => e.target.value !== (pack.description ?? '') && patchPack({ description: e.target.value })}
              placeholder="Descrição curta (opcional)"
              rows={3}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 8, color: 'var(--color-text-primary)',
                fontSize: 13, resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </ControlBlock>

          <ControlBlock label={`Vistas (${orderedVistas.length}/${vistas.length})`}>
            <div style={{ display: 'grid', gap: 6, maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
              {vistas.map(v => {
                const selected = orderedIds.includes(v.id)
                const idx = orderedIds.indexOf(v.id)
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleVista(v.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: 6, borderRadius: 8,
                      background: selected ? 'rgba(255,255,255,0.04)' : 'transparent',
                      border: selected
                        ? '0.5px solid var(--color-text-primary)'
                        : '0.5px solid var(--color-border)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 48, height: 36, borderRadius: 4, overflow: 'hidden', background: 'var(--color-surface)', flexShrink: 0 }}>
                      {v.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.axis_label ?? 'Vista'}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em' }}>
                        {v.quality.toUpperCase()}
                      </div>
                    </div>
                    {selected && (
                      <span style={{
                        width: 20, height: 20, borderRadius: 999,
                        background: 'var(--color-text-primary)', color: 'var(--color-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 600,
                      }}>
                        {idx + 1}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </ControlBlock>

          <ControlBlock label="Identidade">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--color-bg-elevated)',
              border: '0.5px solid var(--color-border-strong)',
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: 999,
                background: accent, flexShrink: 0,
              }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {identity?.name ?? 'Sem nome configurado'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                  acento {accent.toUpperCase()}
                </div>
              </div>
              <Link href="/app/settings/identity" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                Editar →
              </Link>
            </div>
          </ControlBlock>
        </aside>

        {/* Preview A4 */}
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 14,
          padding: 24,
          display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        }}>
          <A4Preview
            space={space}
            dna={dna}
            identity={identity}
            accent={accent}
            vistas={orderedVistas}
            packName={pack.client_name}
          />
        </div>

      </div>
    </div>
  )
}

function ControlBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function A4Preview({ space, dna, identity, accent, vistas, packName }: {
  space:    Space
  dna:      ProjectDNA | null
  identity: ArchitectIdentity | null
  accent:   string
  vistas:   Vista[]
  packName: string | null
}) {
  const today = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const officeName = identity?.name ?? 'Seu escritório'

  return (
    <div style={{
      width: '100%', maxWidth: 520,
      aspectRatio: '210 / 297',
      background: '#fff', color: '#1a1a1a',
      borderRadius: 6,
      boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
      overflow: 'hidden', padding: '24px 28px',
      display: 'flex', flexDirection: 'column', gap: 14,
      fontSize: 8, // base small — A4 escalada
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 12, borderBottom: `2px solid ${accent}`,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '-0.01em', color: '#1a1a1a' }}>
            {officeName}
          </div>
          {identity?.subtitle && (
            <div style={{ fontSize: 8, color: '#86868b', marginTop: 2 }}>{identity.subtitle}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: '#1a1a1a' }}>{space.name}</div>
          <div style={{ fontSize: 8, color: '#86868b', marginTop: 2 }}>
            {packName ? `Para ${packName} · ` : ''}{today}
          </div>
        </div>
      </div>

      {/* Body grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(vistas.length === 0 ? [null, null, null, null] : vistas.slice(0, 4)).map((v, i) => (
          <div key={i} style={{
            background: '#f5f5f7',
            borderRadius: 4, overflow: 'hidden',
            position: 'relative',
            aspectRatio: '4 / 3',
          }}>
            {v?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c7c7cc', fontSize: 9 }}>—</div>
            )}
            {v?.axis_label && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(255,255,255,0.92)',
                padding: '4px 6px', fontSize: 7, fontWeight: 500,
                color: '#1a1a1a',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: accent }} />
                {v.axis_label}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        paddingTop: 10, borderTop: '1px solid #e5e5ea',
      }}>
        <div style={{ fontSize: 7, color: '#86868b' }}>
          {dna && <>Estilo: {dna.estilo.nome} · DNA travado</>}
        </div>
        {!identity?.white_label_enabled && (
          <div style={{ fontSize: 7, color: '#86868b' }}>spacenode</div>
        )}
      </div>
    </div>
  )
}
