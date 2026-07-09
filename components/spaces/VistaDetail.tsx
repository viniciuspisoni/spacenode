'use client'

// Tela detalhe da vista — comparação Vista Mestre × Variação, painel de DNA
// preservation, ações (upscale, favoritar, download, descartar) e galeria
// de outras variações do mesmo Space.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Space, Vista, DnaVerification } from '@/lib/spaces/types'
import { findAxisOption } from '@/lib/spaces/axes'
import { ENGINES, isEngineId, type EngineId } from '@/lib/engines'

// Helper de nome amigável: motores secundários (clarity, flux-fill) caem
// no motor do Space pra display ("Vega · Upscale" não faz sentido — o usuário
// pensa no projeto pelo motor principal).
function engineDisplayName(engine: string, fallback: EngineId): string {
  if (isEngineId(engine)) return ENGINES[engine].name
  if (engine === 'clarity')   return `${ENGINES[fallback].name} · upscale`
  if (engine === 'flux-fill') return `${ENGINES[fallback].name} · retoque`
  return ENGINES[fallback].name
}
import { getUpscaleCost, DNA_EXTRACTION_COST } from '@/lib/spaces/economy'
import { getVisualDna } from '@/lib/spaces/dna'
import { spacesPreserveV2Enabled } from '@/lib/spaces/preserve-flags'
import { RetocarOverlay } from './RetocarOverlay'

interface OtherVista {
  id:          string
  image_url:   string | null
  axis:        Vista['axis']
  axis_value:  string | null
  axis_label:  string | null
  quality:     Vista['quality']
}

interface Props {
  space:          Space
  vista:          Vista
  others:         OtherVista[]
  initialBalance: number
}

export function VistaDetail({ space, vista, others, initialBalance }: Props) {
  const router = useRouter()
  const [favorited, setFavorited]   = useState(vista.is_favorited)
  const [submitting, setSubmitting] = useState<null | 'fav' | 'upscale' | 'delete' | 'dna'>(null)
  const [error, setError]           = useState<string | null>(null)
  const [balance, setBalance]       = useState(initialBalance)
  const [showRetocar, setShowRetocar] = useState(false)
  // Multi-DNA: vista com DNA próprio extraído vira referência selecionável
  // no painel de geração do Space.
  const [isDnaReference, setIsDnaReference] = useState(Boolean(vista.dna))

  const opt = vista.axis && vista.axis_value ? findAxisOption(vista.axis, vista.axis_value) : null
  const canUpscale = vista.engine !== 'clarity'
                     && vista.status === 'completed'
                     && vista.quality !== '4k'
  const upscaleTarget: '2k' | '4k' = vista.quality === 'hd' ? '2k' : '4k'
  const upscaleCost                = getUpscaleCost(upscaleTarget)

  const dna          = getVisualDna(space.dna)
  const verification = vista.dna_verification_details as DnaVerification | null
  const dnaPassed    = vista.dna_verified === true

  async function handleFavorite() {
    setSubmitting('fav')
    try {
      const res = await fetch(`/api/vistas/${vista.id}/favorite`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro')
      setFavorited(data.is_favorited as boolean)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  async function handleUpscale() {
    if (!canUpscale) return
    if (balance < upscaleCost) {
      setError(`Saldo insuficiente. Necessários ${upscaleCost} nodes.`)
      return
    }
    setSubmitting('upscale')
    setError(null)
    try {
      const res = await fetch(`/api/vistas/${vista.id}/upscale`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ target: upscaleTarget }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro no upscale')
      }
      setBalance(b => b - upscaleCost)
      router.push(`/app/spaces/${space.id}/vistas/${data.vista.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  async function handleExtractDna() {
    if (isDnaReference || vista.status !== 'completed') return
    if (balance < DNA_EXTRACTION_COST) {
      setError(`Saldo insuficiente. Necessários ${DNA_EXTRACTION_COST} nodes.`)
      return
    }
    setSubmitting('dna')
    setError(null)
    try {
      const res = await fetch(`/api/vistas/${vista.id}/extract-dna`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro na extração de DNA')
      }
      setBalance(b => b - DNA_EXTRACTION_COST)
      setIsDnaReference(true)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  async function handleDelete() {
    if (!confirm('Descartar esta vista? Esta ação não pode ser desfeita.')) return
    setSubmitting('delete')
    try {
      const res = await fetch(`/api/vistas/${vista.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao descartar')
      router.push(`/app/spaces/${space.id}`)
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(null)
    }
  }

  function handleDownload() {
    if (!vista.image_url) return
    const a = document.createElement('a')
    a.href = vista.image_url
    a.download = `${space.name}-${vista.axis_label ?? 'vista'}.jpg`
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={{
      maxWidth: 1180, margin: '0 auto',
      padding: '32px 32px 80px',
      display: 'flex', flexDirection: 'column', gap: 28,
    }}>

      {/* Breadcrumb */}
      <Link
        href={`/app/spaces/${space.id}`}
        style={{
          fontSize: 12, color: 'var(--color-text-tertiary)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          width: 'fit-content',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        {space.name}
      </Link>

      {/* Comparação Antes/Depois */}
      <ComparisonSection
        mestreUrl={space.vista_mestre_url}
        variationUrl={vista.image_url}
        variationLabel={vista.axis_label ?? 'Variação'}
        variationColor={opt?.color ?? '#888'}
        variationSub={`${engineDisplayName(vista.engine, space.engine)} · ${vista.quality.toUpperCase()}`}
        preserveV2={spacesPreserveV2Enabled()}
        preservationWarning={vista.preservation_warning === true}
      />

      {/* DNA preservation panel */}
      {dna && verification && (
        <DnaPreservationPanel passed={dnaPassed} verification={verification} />
      )}
      {dna && !verification && (
        <div style={{
          padding: '14px 18px', borderRadius: 12,
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em',
        }}>
          Verificação de DNA em andamento…
        </div>
      )}

      {/* Eixo aplicado */}
      {opt && (
        <div style={{
          padding: '16px 20px', borderRadius: 12,
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 999,
            background: 'var(--color-surface)',
            border: `0.5px solid ${opt.color}66`,
            fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: opt.color }} />
            {opt.label}
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{
              fontSize: 13, color: 'var(--color-text-secondary)',
              lineHeight: 1.55, letterSpacing: '-0.005em',
            }}>
              {opt.description}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 6,
              letterSpacing: '0.02em',
            }}>
              {vista.engine === 'clarity'
                ? 'Clarity (upscale)'
                : vista.engine === 'flux-fill'
                  ? 'Flux Fill (retoque)'
                  : ENGINES[vista.engine].name}
              {' · '} {vista.quality.toUpperCase()}
              {' · '} {vista.nodes_cost} nodes
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {canUpscale ? (
          <button
            onClick={handleUpscale}
            disabled={submitting !== null}
            className="spn-action"
            style={{
              width: 'auto', minWidth: 220, padding: '11px 22px',
              background: '#1D9E75', color: '#042818',
              border: '0.5px solid rgba(0,0,0,0.18)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)',
            }}
          >
            {submitting === 'upscale'
              ? 'Aplicando upscale…'
              : `Upscale ${upscaleTarget.toUpperCase()} · ${upscaleCost} nodes`}
          </button>
        ) : (
          <span style={{
            padding: '11px 18px', borderRadius: 10,
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-quaternary)',
            border: '0.5px solid var(--color-border-strong)',
            fontSize: 12,
          }}>
            Já em {vista.quality.toUpperCase()}
          </span>
        )}

        <ActionGhost onClick={() => setShowRetocar(true)}>✎ Editar</ActionGhost>
        {vista.status === 'completed' && (
          isDnaReference ? (
            <span
              title="Esta vista tem DNA próprio extraído — selecione-a como referência no painel de geração do Space."
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 10,
                background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)',
                border: '0.5px solid var(--color-accent-green-border)',
                fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
              }}
            >
              ◈ Referência de DNA
            </span>
          ) : (
            <ActionGhost onClick={handleExtractDna} disabled={submitting === 'dna'}>
              {submitting === 'dna'
                ? 'Extraindo DNA…'
                : `◈ Extrair DNA · ${DNA_EXTRACTION_COST} nodes`}
            </ActionGhost>
          )
        )}
        <ActionGhost onClick={() => alert('Em breve.')}>+ Pack</ActionGhost>
        <ActionGhost onClick={handleFavorite} disabled={submitting === 'fav'}>
          {favorited ? '★ Favoritada' : '☆ Favoritar'}
        </ActionGhost>
        <ActionGhost onClick={handleDownload}>Download</ActionGhost>
        <ActionGhost onClick={handleDelete} danger disabled={submitting === 'delete'}>
          {submitting === 'delete' ? 'Removendo…' : 'Descartar'}
        </ActionGhost>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {showRetocar && (
        <RetocarOverlay
          space={space}
          vista={vista}
          dna={dna}
          balance={balance}
          onClose={() => setShowRetocar(false)}
        />
      )}

      {/* Outras variações */}
      {others.length > 0 && (
        <section>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)', marginBottom: 12,
          }}>
            Outras variações
          </div>
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          }}>
            {others.map(o => (
              <Link
                key={o.id}
                href={`/app/spaces/${space.id}/vistas/${o.id}`}
                style={{
                  aspectRatio: '4 / 3',
                  borderRadius: 10, overflow: 'hidden',
                  background: 'var(--color-bg-elevated)',
                  border: '0.5px solid var(--color-border)',
                  position: 'relative', display: 'block',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                {o.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.image_url} alt={o.axis_label ?? ''}
                       style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  padding: '20px 10px 8px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
                  fontSize: 10, color: '#fff', letterSpacing: '0.02em',
                }}>
                  {o.axis_label ?? '—'} · {o.quality.toUpperCase()}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Sub ───────────────────────────────────────────────────────

// Comparação Antes/Depois. Flag off → grid lado-a-lado clássico (comportamento
// anterior). Flag on → mesmo grid + toggle "Lado a lado / Sobrepor" (alterna uma
// imagem única entre Antes e Depois) + selo deixando claro que a ORIGINAL foi
// preservada (nunca sobrescrita) e, se houver, aviso de preservação.
function ComparisonSection({
  mestreUrl, variationUrl, variationLabel, variationColor, variationSub,
  preserveV2, preservationWarning,
}: {
  mestreUrl:           string | null
  variationUrl:        string | null
  variationLabel:      string
  variationColor:      string
  variationSub:        string
  preserveV2:          boolean
  preservationWarning: boolean
}) {
  const [mode, setMode] = useState<'split' | 'flip'>('split')
  const [side, setSide] = useState<'antes' | 'depois'>('depois')

  const grid = (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    }}>
      <ComparisonCard label="Vista Mestre" color="#1D9E75" imageUrl={mestreUrl} subLabel={preserveV2 ? 'original' : undefined} />
      <ComparisonCard label={variationLabel} color={variationColor} imageUrl={variationUrl} subLabel={variationSub} />
    </div>
  )

  if (!preserveV2) return grid

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Barra: toggle de modo + selo "original preservada" */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--color-surface)', borderRadius: 9 }}>
          {(['split', 'flip'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                cursor: 'pointer', letterSpacing: '-0.005em',
                background: mode === m ? 'var(--color-bg-elevated)' : 'transparent',
                color: mode === m ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                boxShadow: mode === m ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
              }}
            >
              {m === 'split' ? 'Lado a lado' : 'Sobrepor'}
            </button>
          ))}
        </div>
        <span
          title="A Vista Mestre original nunca é sobrescrita — cada variação é salva separadamente."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 11px', borderRadius: 999,
            background: 'rgba(29,158,117,0.12)', color: '#46d191',
            border: '0.5px solid rgba(70,209,145,0.25)',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}
        >
          ✦ original preservada
        </span>
      </div>

      {mode === 'split' ? grid : (
        <div>
          {/* Imagem única que alterna Antes/Depois */}
          <ComparisonCard
            label={side === 'antes' ? 'Antes · Vista Mestre' : `Depois · ${variationLabel}`}
            color={side === 'antes' ? '#1D9E75' : variationColor}
            imageUrl={side === 'antes' ? mestreUrl : variationUrl}
            subLabel={side === 'depois' ? variationSub : 'original'}
          />
          <div style={{ display: 'flex', gap: 4, padding: 4, marginTop: 10, background: 'var(--color-surface)', borderRadius: 9, width: 'fit-content' }}>
            {(['antes', 'depois'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                style={{
                  padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', textTransform: 'capitalize',
                  background: side === s ? 'var(--color-bg-elevated)' : 'transparent',
                  color: side === s ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  boxShadow: side === s ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {preservationWarning && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(186,117,23,0.12)', border: '0.5px solid rgba(186,117,23,0.3)',
          color: '#e0a766', fontSize: 12, lineHeight: 1.5,
        }}>
          Possível alteração além do solicitado nesta variação — registrada para auditoria.
          Compare com a Vista Mestre acima; se necessário, gere novamente.
        </div>
      )}
    </div>
  )
}

function ComparisonCard({ label, color, imageUrl, subLabel }: {
  label:    string
  color:    string
  imageUrl: string | null
  subLabel?: string
}) {
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      position: 'relative', aspectRatio: '4 / 3',
    }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={label}
             style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-quaternary)', fontSize: 12,
        }}>
          —
        </div>
      )}
      <div style={{
        position: 'absolute', top: 14, left: 14, right: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 5,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          fontSize: 10, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
          {label}
        </span>
        {subLabel && (
          <span style={{
            padding: '4px 8px', borderRadius: 4,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            fontSize: 9, color: '#fff', letterSpacing: '0.04em',
          }}>
            {subLabel}
          </span>
        )}
      </div>
    </div>
  )
}

function DnaPreservationPanel({ passed, verification }: { passed: boolean; verification: DnaVerification }) {
  const checks: { label: string; key: keyof DnaVerification['scores'] }[] = [
    { label: 'Estilo',    key: 'estilo' },
    { label: 'Materiais', key: 'materiais' },
    { label: 'Paleta',    key: 'paleta' },
    { label: 'Contexto',  key: 'contexto' },
  ]
  const accent = passed ? '#46d191' : '#e0a766'
  const accentBg = passed ? 'rgba(29,158,117,0.14)' : 'rgba(186,117,23,0.16)'
  const passedCount = checks.filter(c => verification.scores[c.key] >= 0.85).length

  return (
    <div style={{
      padding: '18px 22px', borderRadius: 14,
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 999,
          background: accentBg, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {passed ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="1.5"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8"  x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.01em',
          }}>
            DNA preservado · {passedCount} de {checks.length} constantes
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
            Verificado automaticamente · score geral {(verification.overall * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: `repeat(${checks.length}, 1fr)`,
      }}>
        {checks.map(c => {
          const score = verification.scores[c.key]
          const ok    = score >= 0.85
          return (
            <div key={c.key} style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--color-surface)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 16, height: 16, borderRadius: 999,
                background: ok ? 'rgba(29,158,117,0.18)' : 'rgba(186,117,23,0.2)',
                color: ok ? '#46d191' : '#e0a766',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  {ok ? <polyline points="20 6 9 17 4 12"/> : <line x1="6" y1="6" x2="18" y2="18"/>}
                </svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--color-text-tertiary)',
                }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {(score * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {verification.notes && (
        <div style={{
          fontSize: 11, color: 'var(--color-text-tertiary)',
          lineHeight: 1.5, paddingTop: 10,
          borderTop: '0.5px solid var(--color-border)',
        }}>
          {verification.notes}
        </div>
      )}
    </div>
  )
}

function ActionGhost({ children, onClick, disabled, danger }: {
  children: React.ReactNode
  onClick:  () => void
  disabled?: boolean
  danger?:   boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="spn-action spn-action--ghost"
      style={{
        width: 'auto', minWidth: 0, padding: '10px 16px',
        fontSize: 12, opacity: disabled ? 0.45 : 1,
        color: danger ? '#e57373' : undefined,
        borderColor: danger ? 'rgba(163,45,45,0.3)' : undefined,
      }}
    >
      {children}
    </button>
  )
}
