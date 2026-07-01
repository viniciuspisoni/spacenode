'use client'

// Tela "Space em uso" — orquestra header, Vista Mestre, DNA strip,
// Eixos panel e VistasGrid. Estado de geração é local; balance e
// lista de vistas são atualizados no client após cada geração.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ENGINES } from '@/lib/engines'
import type { Space, Vista, ArchitectIdentity, Axis, Quality } from '@/lib/spaces/types'
import type { PlanId } from '@/lib/plans'
import { getVisualDna, getBriefingFromDna } from '@/lib/spaces/dna'
import { detalheContextFor } from '@/lib/spaces/axes'
import { getVistaGenerationCost } from '@/lib/spaces/economy'
import { DnaPanel } from './DnaPanel'
import { EixosPanel } from './EixosPanel'
import { VistasGrid } from './VistasGrid'
import { SynapticLoading } from './SynapticLoading'
import { BatchProgressOverlay } from './BatchProgressOverlay'
import type { SketchPayload } from './SketchGuidedEixoBody'

interface Props {
  space:          Space
  initialVistas:  Vista[]
  initialBalance: number
  identity:       ArchitectIdentity | null
  planId:         PlanId
}

interface GenerateMeta {
  count:  number
  total:  number
  quality: Quality
}

interface BatchMeta {
  count:   number
  total:   number
  quality: Quality
}

interface ToastState {
  type:    'success' | 'warning'
  message: string
}

export function SpaceWorkspace({ space, initialVistas, initialBalance, planId }: Props) {
  const router = useRouter()
  const [vistas, setVistas]       = useState<Vista[]>(initialVistas)
  const [balance, setBalance]     = useState<number>(initialBalance)
  const [meta, setMeta]           = useState<GenerateMeta | null>(null)
  const [batchMeta, setBatchMeta] = useState<BatchMeta | null>(null)
  const [toast, setToast]         = useState<ToastState | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const isLocked = space.status === 'locked'
  const dna      = getVisualDna(space.dna)
  // Contexto pra adaptar os cards do eixo Detalhe (corporativo / residencial /
  // exterior / default), a partir da categoria + briefing arquitetônico.
  const detalheContext = detalheContextFor(space.category, getBriefingFromDna(space.dna))

  function showToast(t: ToastState) {
    setToast(t)
    setTimeout(() => setToast(null), 6000)
  }

  // ── Geração paramétrica (Iluminação etc.) ──────────────────

  async function handleGenerate(axis: Axis, axisValues: string[], quality: Quality) {
    setError(null)
    const costPer = getVistaGenerationCost(space.engine, quality)
    const total   = costPer * axisValues.length
    setMeta({ count: axisValues.length, total, quality })

    try {
      const res = await fetch(`/api/spaces/${space.id}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ axis, axis_values: axisValues, quality }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro ao gerar')
      }

      const newVistas = (data.vistas ?? []) as Vista[]
      // Prepend (mais novas em cima)
      setVistas(curr => [...newVistas, ...curr])
      if (data.balance_after?.total_balance != null) {
        setBalance(data.balance_after.total_balance as number)
      }

      // Fire-and-forget DNA verification
      newVistas.forEach(v => {
        fetch(`/api/vistas/${v.id}/verify-dna`, { method: 'POST' })
          .then(r => r.ok ? r.json() : null)
          .then(verifyData => {
            if (verifyData?.verification) {
              setVistas(curr => curr.map(x =>
                x.id === v.id
                  ? {
                      ...x,
                      dna_verified: verifyData.verification.passed,
                      dna_verification_details: verifyData.verification,
                    }
                  : x,
              ))
            }
          })
          .catch(() => { /* silencioso — falha na verificação não bloqueia UX */ })
      })

      // Re-busca server side stats (vista_count etc.) sem flicker
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMeta(null)
    }
  }

  // ── Geração em batch a partir de sketches (Ângulo) ─────────

  async function handleGenerateFromSketches(sketches: SketchPayload[], quality: Quality) {
    setError(null)
    const costPer = getVistaGenerationCost(space.engine, quality)
    const total   = costPer * sketches.length
    setBatchMeta({ count: sketches.length, total, quality })

    try {
      const res = await fetch(`/api/spaces/${space.id}/generate-from-sketches`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sketches, quality }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro ao gerar')
      }

      const newVistas = (data.vistas ?? []) as Vista[]
      const errors    = (data.errors  ?? []) as Array<{ label: string | null; error: string }>

      setVistas(curr => [...newVistas, ...curr])
      if (data.balance_after?.total_balance != null) {
        setBalance(data.balance_after.total_balance as number)
      }

      // Toasts de feedback
      if (newVistas.length > 0) {
        showToast({
          type:    'success',
          message: `${newVistas.length} variaç${newVistas.length === 1 ? 'ão' : 'ões'} gerada${newVistas.length === 1 ? '' : 's'} com sucesso.`,
        })
      }
      if (errors.length > 0) {
        const labels = errors.map(e => e.label ?? 'sem nome').join(', ')
        showToast({
          type:    'warning',
          message: `${errors.length} sketch${errors.length === 1 ? '' : 'es'} falhou: ${labels}. Tente novamente.`,
        })
      }

      // Fire-and-forget DNA verification (modo angulo_relaxed é decidido server-side
      // pela rota verify-dna lendo vista.axis)
      newVistas.forEach(v => {
        fetch(`/api/vistas/${v.id}/verify-dna`, { method: 'POST' })
          .then(r => r.ok ? r.json() : null)
          .then(verifyData => {
            if (verifyData?.verification) {
              setVistas(curr => curr.map(x =>
                x.id === v.id
                  ? {
                      ...x,
                      dna_verified: verifyData.verification.passed,
                      dna_verification_details: verifyData.verification,
                    }
                  : x,
              ))
            }
          })
          .catch(() => { /* silencioso */ })
      })

      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBatchMeta(null)
    }
  }

  return (
    <>
      <div style={{
        maxWidth: 1180, margin: '0 auto',
        padding: '32px 32px 80px',
        display: 'flex', flexDirection: 'column', gap: 28,
      }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em',
        }}>
          <Link href="/app/spaces" style={{ color: 'inherit' }}>Meus projetos</Link>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{space.name}</span>
        </div>

        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.03em', lineHeight: 1.1,
            }}>
              {space.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {isLocked && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 999,
                  background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)',
                  border: '0.5px solid var(--color-accent-green-border)',
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <rect x="4" y="11" width="16" height="10" rx="1.5"/>
                    <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
                  </svg>
                  DNA travado
                </span>
              )}
              {space.source_render_id && (
                <span
                  title="Vista Mestre vinda do Renderizar — DNA extraído com ground truth das configurações originais"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 999,
                    background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)',
                    border: '0.5px solid var(--color-accent-green-border)',
                    fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}
                >
                  ✦ origem: Renderizar
                </span>
              )}
              <span style={{
                fontSize: 11, color: 'var(--color-text-tertiary)',
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {ENGINES[space.engine].name} · {category(space.category)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BalanceBadge balance={balance} />
            <Link
              href={`/app/spaces/${space.id}/pack`}
              aria-disabled={vistas.filter(v => v.status === 'completed').length === 0}
              style={{
                padding: '10px 18px', borderRadius: 10,
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-secondary)',
                border: '0.5px solid var(--color-border-strong)',
                fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
                pointerEvents: vistas.filter(v => v.status === 'completed').length === 0 ? 'none' : 'auto',
                opacity:        vistas.filter(v => v.status === 'completed').length === 0 ? 0.45 : 1,
              }}
            >
              Pack →
            </Link>
          </div>
        </header>

        {/* Vista Mestre compact */}
        {space.vista_mestre_url && (
          <div style={{
            position: 'relative',
            borderRadius: 14, overflow: 'hidden',
            background: 'var(--color-bg-elevated)',
            aspectRatio: '32 / 9',
            maxHeight: 240,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={space.vista_mestre_url} alt="Vista Mestre"
                 style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', top: 14, left: 14,
              fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: '#fff', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
              padding: '5px 10px', borderRadius: 4,
            }}>
              vista mestre
            </div>
            {/* Placeholder — troca de Vista Mestre ainda não tem backend
                (exigiria re-extração de DNA); ação preparada, desabilitada. */}
            <button
              type="button"
              disabled
              title="Em breve — trocar a Vista Mestre vai re-extrair o DNA do projeto"
              style={{
                position: 'absolute', top: 14, right: 14,
                fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.55)', background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)', border: '0.5px solid rgba(255,255,255,0.14)',
                padding: '5px 10px', borderRadius: 4, cursor: 'not-allowed',
              }}
            >
              Trocar Vista Mestre
            </button>
          </div>
        )}

        {/* DNA strip */}
        {dna && (
          <section>
            <SectionLabel>DNA do projeto</SectionLabel>
            <DnaPanel dna={dna} variant="strip" />
          </section>
        )}

        {/* Eixos */}
        {isLocked ? (
          <section>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <SectionLabel>Eixos exploráveis</SectionLabel>
              <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>
                Selecione e clique em Gerar
              </span>
            </div>
            <EixosPanel
              engine={space.engine}
              defaultQuality={space.engine === 'pulsar' ? 'hd' : '2k'}
              balance={balance}
              planId={planId}
              spaceId={space.id}
              detalheContext={detalheContext}
              onGenerate={handleGenerate}
              onGenerateFromSketches={handleGenerateFromSketches}
            />
            {error && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
                color: 'var(--color-error)', fontSize: 13,
              }}>
                {error}
              </div>
            )}
          </section>
        ) : (
          <section style={{
            background: 'var(--color-bg-elevated)',
            border: '0.5px dashed var(--color-border-strong)',
            borderRadius: 14, padding: '32px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {space.status === 'draft'           && 'Envie a Vista Mestre pra começar.'}
              {space.status === 'dna_extracting'  && 'Extraindo DNA…'}
              {space.status === 'dna_extracted'   && 'Trave o DNA pra liberar variações.'}
              {space.status === 'archived'        && 'Este Space foi arquivado.'}
            </div>
          </section>
        )}

        {/* Vistas */}
        <section>
          <SectionLabel>Vistas geradas</SectionLabel>
          <div style={{ marginTop: 12 }}>
            <VistasGrid vistas={vistas} vistaMestreUrl={space.vista_mestre_url} />
          </div>
        </section>
      </div>

      {meta && (
        <SynapticLoading
          spaceName={space.name}
          count={meta.count}
          totalNodes={meta.total}
          engine={space.engine}
          quality={meta.quality}
        />
      )}

      {batchMeta && (
        <BatchProgressOverlay
          spaceName={space.name}
          batchSize={batchMeta.count}
          totalNodes={batchMeta.total}
          engine={space.engine}
          quality={batchMeta.quality}
        />
      )}

      {toast && <Toast toast={toast} />}
    </>
  )
}

function Toast({ toast }: { toast: ToastState }) {
  const colors = toast.type === 'success'
    ? { bg: 'rgba(29,158,117,0.16)', fg: '#46d191', border: 'rgba(29,158,117,0.45)' }
    : { bg: 'rgba(186,117,23,0.16)', fg: '#e0a766', border: 'rgba(186,117,23,0.45)' }
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 90,
      maxWidth: 400, padding: '14px 18px',
      background: colors.bg, color: colors.fg,
      border: `0.5px solid ${colors.border}`,
      borderRadius: 12, backdropFilter: 'blur(12px)',
      fontSize: 13, letterSpacing: '-0.005em',
      boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
    }}>
      {toast.message}
    </div>
  )
}

// ── Sub ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--color-text-tertiary)',
    }}>
      {children}
    </div>
  )
}

function BalanceBadge({ balance }: { balance: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 12px', borderRadius: 8,
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border-strong)',
      fontSize: 12, color: 'var(--color-text-secondary)',
      letterSpacing: '-0.005em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: '#1D9E75' }} />
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{balance}</span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>nodes</span>
    </span>
  )
}

function category(c: Space['category']): string {
  if (c === 'residencial') return 'Residencial'
  if (c === 'comercial')   return 'Comercial'
  return 'Conceito'
}
