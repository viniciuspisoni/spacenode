'use client'

// Modal "Trocar Vista Mestre" — promove uma vista gerada a nova Vista Mestre
// do Space (imagem + DNA). Vistas com DNA extraído promovem grátis; sem DNA,
// o fluxo extrai primeiro (8 nodes) e promove em seguida. A mestre anterior
// vai pro histórico do Space (nunca é sobrescrita).

import { useState } from 'react'
import type { Vista } from '@/lib/spaces/types'
import { DNA_EXTRACTION_COST } from '@/lib/spaces/economy'

interface Props {
  spaceId:         string
  currentMestreId: string | null
  vistas:          Vista[]
  balance:         number
  onBalanceSpent:  (nodes: number) => void
  onPromoted:      () => void
  onClose:         () => void
}

export function TrocarVistaMestreModal({
  spaceId, currentMestreId, vistas, balance, onBalanceSpent, onPromoted, onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Elegíveis: concluídas com imagem, exceto a que já é a mestre atual.
  const eligible = vistas.filter(v =>
    v.status === 'completed' && !!v.image_url && v.id !== currentMestreId,
  )
  const selected     = eligible.find(v => v.id === selectedId) ?? null
  const needsExtract = selected ? !selected.dna : false
  const insufficient = needsExtract && balance < DNA_EXTRACTION_COST

  async function handlePromote() {
    if (!selected || submitting || insufficient) return
    setSubmitting(true)
    setError(null)
    try {
      // 1) Sem DNA próprio → extrai primeiro (8 nodes; é o que a promoção usa).
      if (!selected.dna) {
        const res = await fetch(`/api/vistas/${selected.id}/extract-dna`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
          throw new Error(data?.error ?? 'Erro na extração de DNA')
        }
        onBalanceSpent(DNA_EXTRACTION_COST)
      }

      // 2) Promove (grátis — o DNA já foi pago na extração).
      const res = await fetch(`/api/spaces/${spaceId}/promote-vista-mestre`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ vista_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'Erro ao trocar a Vista Mestre')

      onPromoted()
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(10,10,10,0.78)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 860, maxHeight: '88vh',
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border-strong)',
          borderRadius: 14, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '0.5px solid var(--color-border)',
        }}>
          <div>
            <h2 style={{
              fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)',
              letterSpacing: '-0.015em',
            }}>
              Trocar Vista Mestre
            </h2>
            <p style={{
              fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4,
              letterSpacing: '-0.005em', lineHeight: 1.5,
            }}>
              A vista promovida vira a nova autoridade do projeto — imagem e DNA.
              A Vista Mestre atual fica registrada no histórico do projeto.
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 6, background: 'transparent',
            border: '0.5px solid var(--color-border-strong)', color: 'var(--color-text-secondary)',
            cursor: 'pointer', flexShrink: 0,
          }}>×</button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {eligible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              Nenhuma vista concluída disponível — gere variações primeiro.
            </div>
          ) : (
            <div style={{
              display: 'grid', gap: 12,
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            }}>
              {eligible.map(v => {
                const isSelected = v.id === selectedId
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(isSelected ? null : v.id)}
                    style={{
                      padding: 0, overflow: 'hidden', textAlign: 'left',
                      background: isSelected ? 'var(--color-accent-green-bg)' : 'var(--color-bg)',
                      border: isSelected
                        ? '1.5px solid var(--color-accent-green)'
                        : '0.5px solid var(--color-border-strong)',
                      borderRadius: 10, cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)', position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.image_url!} alt={v.axis_label ?? 'Vista'}
                           style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {v.dna && (
                        <span style={{
                          position: 'absolute', top: 8, left: 8,
                          padding: '3px 7px', borderRadius: 4,
                          background: 'rgba(29,158,117,0.85)', color: '#fff',
                          fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>
                          ◈ DNA extraído
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px 10px' }}>
                      <div style={{
                        fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
                        letterSpacing: '-0.01em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {isSelected ? '✓ ' : ''}{v.axis_label ?? 'Vista'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 3, letterSpacing: '0.02em' }}>
                        {v.dna
                          ? 'promove grátis'
                          : `inclui extração de DNA · ${DNA_EXTRACTION_COST} nodes`}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <footer style={{
          padding: '14px 20px', borderTop: '0.5px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 11, color: insufficient ? '#e0a766' : 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            {!selected && 'Selecione a vista que vai virar a nova Vista Mestre.'}
            {selected && !needsExtract && 'Promoção gratuita — o DNA desta vista já foi extraído.'}
            {selected && needsExtract && !insufficient &&
              `Esta vista ainda não tem DNA próprio — a troca extrai primeiro (${DNA_EXTRACTION_COST} nodes) e promove em seguida.`}
            {selected && insufficient &&
              `Saldo insuficiente pra extração de DNA (${DNA_EXTRACTION_COST} nodes).`}
          </div>
          <button
            onClick={handlePromote}
            disabled={!selected || submitting || insufficient}
            className="spn-action"
            style={{
              width: 'auto', minWidth: 220, padding: '11px 22px',
              background: '#1D9E75', color: '#042818',
              border: '0.5px solid rgba(0,0,0,0.18)',
              opacity: !selected || insufficient ? 0.5 : 1,
              boxShadow: selected && !insufficient
                ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)'
                : 'none',
            }}
          >
            {submitting
              ? 'Trocando…'
              : needsExtract
                ? `Extrair DNA e promover · ${DNA_EXTRACTION_COST} nodes`
                : 'Promover a Vista Mestre'}
          </button>
        </footer>

        {error && (
          <div style={{
            margin: '0 20px 16px', padding: '10px 14px', borderRadius: 8,
            background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
            color: 'var(--color-error)', fontSize: 12,
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
