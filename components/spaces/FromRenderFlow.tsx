'use client'

// Fluxo do caminho A — cria Space a partir de uma render existente.
//
// Steps:
//   gallery   → user escolhe a render (pulado se preselected !== null)
//   config    → nome + categoria + motor herdado com override
//   analyzing → synaptic loading durante extração de DNA
//   reveal    → DNA exibido (com badge "origem: Renderizar") + travar

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ENGINES, ENGINE_ORDER, type EngineId } from '@/lib/engines'
import { EngineIcon } from '@/components/icons/engines'
import type { SpaceCategory, ProjectDNA } from '@/lib/spaces/types'
import { DNA_EXTRACTION_COST } from '@/lib/spaces/economy'
import { DnaPanel } from './DnaPanel'
import { SynapticLoading } from './SynapticLoading'

export interface RenderGalleryItem {
  id:          string
  output_url:  string
  ambient:     string | null
  style:       string | null
  lighting:    string | null
  engine:      EngineId
  resolution:  string
  created_at:  string
}

type Step = 'gallery' | 'config' | 'analyzing' | 'reveal'

const CATEGORIES: { id: SpaceCategory; label: string; description: string }[] = [
  { id: 'residencial', label: 'Residencial', description: 'Casas, apartamentos, ambientes íntimos' },
  { id: 'comercial',   label: 'Comercial',   description: 'Escritórios, lojas, hospitalidade' },
  { id: 'conceito',    label: 'Conceito',    description: 'Estudo, ideação, pavilhões' },
]

interface Props {
  gallery:        RenderGalleryItem[]
  preselected:    RenderGalleryItem | null
  initialBalance: number
}

export function FromRenderFlow({ gallery, preselected, initialBalance }: Props) {
  const router = useRouter()

  const [step, setStep] = useState<Step>(preselected ? 'config' : 'gallery')
  const [render, setRender] = useState<RenderGalleryItem | null>(preselected)

  // Form state
  const [name, setName] = useState('')
  const [category, setCategory] = useState<SpaceCategory>('residencial')
  const [engineOverride, setEngineOverride] = useState<EngineId | null>(null)
  const [showEngineOverride, setShowEngineOverride] = useState(false)

  // Pipeline state
  const [spaceId, setSpaceId] = useState<string | null>(null)
  const [dna, setDna] = useState<ProjectDNA | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inheritedEngine: EngineId = render?.engine ?? 'vega'
  const finalEngine: EngineId = engineOverride ?? inheritedEngine
  const balanceShort = initialBalance < DNA_EXTRACTION_COST

  function pickRender(r: RenderGalleryItem) {
    setRender(r)
    setStep('config')
  }

  async function handleConfirm() {
    if (!render) return
    if (!name.trim()) return setError('Dê um nome ao projeto antes de continuar')
    if (balanceShort) return setError(`Saldo insuficiente. Necessários ${DNA_EXTRACTION_COST} nodes.`)

    setError(null)
    setSubmitting(true)
    setStep('analyzing')

    try {
      // 1. Cria Space ligado à render
      const fromRes = await fetch('/api/spaces/from-render', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          render_id:       render.id,
          name:            name.trim(),
          category,
          engine_override: engineOverride,
        }),
      })
      const fromData = await fromRes.json()
      if (!fromRes.ok) throw new Error(fromData?.error ?? 'Erro ao criar Space')
      const newSpaceId = fromData.space.id as string
      setSpaceId(newSpaceId)

      // 2. Extrai DNA enriquecido (debit 8 nodes)
      const dnaRes = await fetch(`/api/spaces/${newSpaceId}/extract-dna`, { method: 'POST' })
      const dnaData = await dnaRes.json()
      if (!dnaRes.ok) {
        if (dnaRes.status === 402) throw new Error(dnaData?.message ?? 'Saldo insuficiente')
        throw new Error(dnaData?.error ?? 'Falha na análise')
      }

      setDna(dnaData.dna as ProjectDNA)
      setStep('reveal')
    } catch (e) {
      setError((e as Error).message)
      setStep('config')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLock() {
    if (!spaceId) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/spaces/${spaceId}/lock`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro ao travar Space')
      router.push(`/app/spaces/${spaceId}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 980, margin: '0 auto', padding: '40px 24px 80px' }}>
      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 12, color: 'var(--color-text-tertiary)',
        letterSpacing: '-0.005em', marginBottom: 28,
      }}>
        <Link href="/app/spaces">Spaces</Link>
        <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
        <Link href="/app/spaces/new">Novo</Link>
        <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>A partir de render</span>
      </div>

      {step === 'gallery' && (
        <GalleryStep
          gallery={gallery}
          onPick={pickRender}
        />
      )}

      {step === 'config' && render && (
        <ConfigStep
          render={render}
          name={name} setName={setName}
          category={category} setCategory={setCategory}
          inheritedEngine={inheritedEngine}
          engineOverride={engineOverride}
          setEngineOverride={setEngineOverride}
          showEngineOverride={showEngineOverride}
          setShowEngineOverride={setShowEngineOverride}
          finalEngine={finalEngine}
          balance={initialBalance}
          balanceShort={balanceShort}
          submitting={submitting}
          error={error}
          onConfirm={handleConfirm}
          onChangeRender={() => setStep('gallery')}
        />
      )}

      {step === 'analyzing' && render && (
        <SynapticLoading
          spaceName={name || 'Novo Space'}
          count={1}
          totalNodes={DNA_EXTRACTION_COST}
          engine={finalEngine}
          quality="2k"
        />
      )}

      {step === 'reveal' && dna && render && (
        <RevealStep
          dna={dna}
          render={render}
          onLock={handleLock}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  )
}

// ── Step: gallery ────────────────────────────────────────────

function GalleryStep({ gallery, onPick }: {
  gallery: RenderGalleryItem[]
  onPick:  (r: RenderGalleryItem) => void
}) {
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 8,
        }}>
          Escolha uma render
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          A render selecionada vira a Vista Mestre do novo Space. Ela define o
          DNA visual; toda variação que você gerar depois preserva esse DNA.
        </p>
      </div>

      {gallery.length === 0 ? (
        <div style={{
          padding: '56px 24px', textAlign: 'center',
          background: 'var(--color-bg-elevated)',
          border: '0.5px dashed var(--color-border-strong)',
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            Você ainda não tem renders concluídas
          </div>
          <Link
            href="/app/generate"
            style={{
              display: 'inline-block', marginTop: 8,
              padding: '10px 18px', borderRadius: 10,
              background: 'var(--color-text-primary)', color: 'var(--color-bg)',
              fontSize: 13, fontWeight: 500,
            }}
          >
            Criar primeira render →
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}>
          {gallery.map(r => (
            <button
              key={r.id}
              onClick={() => onPick(r)}
              style={{
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border)',
                borderRadius: 12, overflow: 'hidden',
                padding: 0, cursor: 'pointer', textAlign: 'left',
                transition: 'transform 0.18s, border-color 0.18s, box-shadow 0.18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              <div style={{
                aspectRatio: '4 / 3', position: 'relative',
                background: 'var(--color-surface)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.output_url} alt={r.ambient ?? ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 8px', borderRadius: 5,
                  background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                  fontSize: 9, fontWeight: 600, color: '#fff',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {ENGINES[r.engine].name}
                </div>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
                  letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.ambient || r.style || 'Render'}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4,
                  letterSpacing: '0.02em',
                }}>
                  {r.lighting ?? '—'} · {(r.resolution ?? '').toUpperCase()}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ── Step: config ─────────────────────────────────────────────

function ConfigStep(props: {
  render:               RenderGalleryItem
  name:                 string
  setName:              (v: string) => void
  category:             SpaceCategory
  setCategory:          (c: SpaceCategory) => void
  inheritedEngine:      EngineId
  engineOverride:       EngineId | null
  setEngineOverride:    (e: EngineId | null) => void
  showEngineOverride:   boolean
  setShowEngineOverride: (v: boolean) => void
  finalEngine:          EngineId
  balance:              number
  balanceShort:         boolean
  submitting:           boolean
  error:                string | null
  onConfirm:            () => void
  onChangeRender:       () => void
}) {
  const {
    render, name, setName, category, setCategory,
    inheritedEngine, engineOverride, setEngineOverride,
    showEngineOverride, setShowEngineOverride, finalEngine,
    balance, balanceShort, submitting, error, onConfirm, onChangeRender,
  } = props

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 8,
        }}>
          Novo Space
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          Esta render vira a Vista Mestre. O DNA é extraído com ground truth das
          configurações originais — mais preciso que upload de imagem.
        </p>
      </div>

      {/* Preview da render */}
      <div style={{
        position: 'relative', marginBottom: 28,
        borderRadius: 14, overflow: 'hidden',
        background: 'var(--color-bg-elevated)',
        aspectRatio: '16 / 9', maxHeight: 360,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={render.output_url} alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', top: 14, left: 14,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 4,
          background: 'rgba(29,158,117,0.18)', color: '#46d191',
          fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          backdropFilter: 'blur(8px)',
          border: '0.5px solid rgba(29,158,117,0.3)',
        }}>
          ✦ origem: Renderizar
        </div>
        <button
          onClick={onChangeRender}
          style={{
            position: 'absolute', top: 14, right: 14,
            padding: '6px 12px', borderRadius: 6,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            border: '0.5px solid rgba(255,255,255,0.18)',
            color: '#fff', fontSize: 11, cursor: 'pointer',
          }}
        >
          Trocar render
        </button>
      </div>

      {/* Form */}
      <Section label="Nome do projeto">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Casa Campo, Apartamento Rio Branco"
          maxLength={80}
          style={{
            width: '100%', padding: '14px 16px',
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 10, color: 'var(--color-text-primary)',
            fontSize: 14, letterSpacing: '-0.01em', outline: 'none',
          }}
        />
      </Section>

      <Section label="Categoria">
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10,
        }}>
          {CATEGORIES.map(c => {
            const selected = category === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  background: selected ? 'rgba(255,255,255,0.04)' : 'var(--color-bg-elevated)',
                  border: selected
                    ? '1.5px solid var(--color-text-primary)'
                    : '0.5px solid var(--color-border-strong)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)',
                  letterSpacing: '-0.01em',
                }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.45 }}>
                  {c.description}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section label="Motor">
        {!showEngineOverride ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px',
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 10,
          }}>
            <span style={{ display: 'flex', color: 'var(--color-text-primary)' }}>
              <EngineIcon engine={inheritedEngine} width={20} height={20} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                {ENGINES[inheritedEngine].name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                Herdado da render de origem
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowEngineOverride(true)}
              style={{
                padding: '6px 12px', fontSize: 11,
                background: 'transparent', color: 'var(--color-text-secondary)',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 6, cursor: 'pointer',
              }}
            >
              Trocar
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 10,
              background: 'rgba(186,117,23,0.10)', border: '0.5px solid rgba(186,117,23,0.3)',
              fontSize: 11, color: '#e0a766', lineHeight: 1.55,
            }}>
              ⚠ Trocar o motor exige re-extração de DNA. A render herda o motor
              de origem por padrão pra manter coerência visual.
            </div>
            <div style={{
              display: 'grid', gap: 8,
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            }}>
              {ENGINE_ORDER.map(eId => {
                const cfg = ENGINES[eId]
                const selected = finalEngine === eId
                return (
                  <button
                    key={eId}
                    type="button"
                    onClick={() => setEngineOverride(eId === inheritedEngine ? null : eId)}
                    style={{
                      padding: '10px 12px',
                      background: selected ? 'rgba(255,255,255,0.04)' : 'var(--color-bg-elevated)',
                      border: selected
                        ? '1.5px solid var(--color-text-primary)'
                        : '0.5px solid var(--color-border-strong)',
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <EngineIcon engine={eId} width={18} height={18} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {cfg.name}
                      {eId === inheritedEngine && (
                        <span style={{ fontSize: 9, color: '#46d191', marginLeft: 6 }}>(herdado)</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => { setEngineOverride(null); setShowEngineOverride(false) }}
              style={{
                marginTop: 10, fontSize: 11, color: 'var(--color-text-secondary)',
                background: 'none', cursor: 'pointer', padding: 0,
                textDecoration: 'underline',
              }}
            >
              Voltar pro motor herdado
            </button>
          </div>
        )}
      </Section>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginTop: 16,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 16, marginTop: 32, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {balance} nodes disponíveis
        </span>
        <button
          onClick={onConfirm}
          disabled={!name.trim() || balanceShort || submitting}
          className="spn-action"
          style={{
            width: 'auto', minWidth: 240, padding: '12px 24px',
            background: '#1D9E75', color: '#042818',
            border: '0.5px solid rgba(0,0,0,0.18)',
            opacity: !name.trim() || balanceShort ? 0.5 : 1,
            boxShadow: name.trim() && !balanceShort
              ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)'
              : 'none',
          }}
        >
          {submitting ? 'Criando…' : `Extrair DNA · ${DNA_EXTRACTION_COST} nodes →`}
        </button>
      </div>
    </>
  )
}

// ── Step: reveal ─────────────────────────────────────────────

function RevealStep({ dna, render, onLock, submitting, error }: {
  dna:        ProjectDNA
  render:     RenderGalleryItem
  onLock:     () => void
  submitting: boolean
  error:      string | null
}) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 11px', borderRadius: 999,
          background: 'rgba(29,158,117,0.14)', color: '#46d191',
          fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 14,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#46d191' }} />
          DNA verificado · origem: Renderizar
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8,
        }}>
          Análise concluída
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          DNA extraído com ground truth das configurações da render. Trave pra
          começar a gerar variações.
        </p>
      </div>

      <div style={{
        position: 'relative', marginBottom: 24,
        borderRadius: 14, overflow: 'hidden',
        background: 'var(--color-bg-elevated)',
        aspectRatio: '16 / 9',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={render.output_url} alt="Vista Mestre"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      <DnaPanel dna={dna} variant="reveal" />

      {error && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
        gap: 12, marginTop: 28,
      }}>
        <button
          onClick={onLock}
          disabled={submitting}
          className="spn-action"
          style={{
            width: 'auto', minWidth: 240, padding: '12px 24px',
            background: '#1D9E75', color: '#042818',
            border: '0.5px solid rgba(0,0,0,0.18)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
            <rect x="4" y="11" width="16" height="10" rx="1.5"/>
            <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
          </svg>
          {submitting ? 'Travando…' : 'Travar DNA do projeto'}
        </button>
      </div>
    </>
  )
}

// ── Sub ──────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}
