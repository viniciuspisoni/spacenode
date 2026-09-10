'use client'

// Modal "Trocar Vista Mestre" — promove uma vista gerada a nova Vista Mestre
// do Space (imagem + DNA). Vistas com DNA extraído promovem grátis; sem DNA,
// o fluxo extrai primeiro (8 nodes) e promove em seguida. A mestre anterior
// vai pro histórico do Space (nunca é sobrescrita).

import { useState } from 'react'
import type { Vista } from '@/lib/spaces/types'
import { DNA_EXTRACTION_COST } from '@/lib/spaces/economy'
import { Sheet } from '@/components/app/glass'

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

  // Uma frase de custo só, que muda de conteúdo — antes eram quatro textos
  // disputando espaço num rodapé com o botão.
  const costLine = !selected
    ? 'Selecione a vista que vai virar a nova Vista Mestre.'
    : insufficient
      ? `Saldo insuficiente pra extração de DNA (${DNA_EXTRACTION_COST} nodes).`
      : needsExtract
        ? `Esta vista ainda não tem DNA próprio — a troca extrai primeiro (${DNA_EXTRACTION_COST} nodes) e promove em seguida.`
        : 'Promoção gratuita — o DNA desta vista já foi extraído.'

  return (
    <Sheet open title="Trocar Vista Mestre" onClose={onClose} doneLabel="Cancelar">
      <p className="spn-hint" style={{ marginTop: 0, marginBottom: 14 }}>
        A vista promovida vira a nova autoridade do projeto — imagem e DNA.
        A Vista Mestre atual fica registrada no histórico do projeto.
      </p>

      {eligible.length === 0 ? (
        <div className="spn-empty">
          Nenhuma vista concluída disponível — gere variações primeiro.
        </div>
      ) : (
        <div className="spn-choices" role="radiogroup" aria-label="Vista a promover" style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        }}>
          {eligible.map(v => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === selectedId}
              className="spn-choice"
              onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}
              style={{ padding: 0, overflow: 'hidden', textAlign: 'left' }}
            >
              <span style={{ display: 'block', position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.image_url!} alt={v.axis_label ?? 'Vista'} className="spn-card-thumb" />
                {v.dna && (
                  <span className="spn-glass spn-glass--raised" style={{
                    position: 'absolute', top: 7, left: 7,
                    padding: '3px 7px', borderRadius: 999,
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
                    textTransform: 'uppercase', color: 'var(--color-accent-green)',
                  }}>
                    ◈ DNA extraído
                  </span>
                )}
              </span>
              <span style={{ display: 'block', padding: '8px 10px 10px' }}>
                <b style={{
                  display: 'block', fontSize: 12,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {v.axis_label ?? 'Vista'}
                </b>
                <span>{v.dna ? 'promove grátis' : `inclui DNA · ${DNA_EXTRACTION_COST} nodes`}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="spn-error" style={{ marginTop: 14 }}>{error}</div>}

      {eligible.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="spn-hint" style={{ marginTop: 0, marginBottom: 10 }}>{costLine}</p>
          <button
            type="button"
            className="spn-cta"
            onClick={handlePromote}
            disabled={!selected || submitting || insufficient}
          >
            {submitting
              ? 'Trocando…'
              : needsExtract
                ? <>Extrair DNA e promover <span className="spn-cta-meta">{DNA_EXTRACTION_COST} nodes</span></>
                : 'Promover a Vista Mestre'}
          </button>
        </div>
      )}
    </Sheet>
  )
}
