'use client'

import { useState } from 'react'
import { Sheet } from '@/components/app/glass'

/**
 * Confirmação da camada de SUPERFÍCIE.
 *
 * Estava copiada LITERALMENTE — mesmo texto, mesmos quatro botões, mesmo
 * modal — no RetocarOverlay e no RetocarStandaloneFlow. Duas cópias do mesmo
 * aviso são duas chances de o aviso divergir; agora é uma peça só, e o
 * conteúdo mora numa folha como todo o resto do app.
 *
 * O corpo é uma imagem parada: pode ficar sobre vidro sem custo de repintura
 * (a regra do canvas vale para o RetocarCanvas, não para este preview).
 */
export interface SurfaceConfirmData {
  previewUrl:      string
  surfaceMaskUrl:  string
  surfaceCoverage: number
  surfaceCost:     number
}

export function SurfaceConfirmSheet({ data, onApply, onRefine, onBlobOnly, onCancel }: {
  data:       SurfaceConfirmData | null
  onApply:    () => void
  /** A detecção saiu quase certa → abre o seletor por cliques com ela dentro. */
  onRefine:   (data: SurfaceConfirmData) => void
  onBlobOnly: () => void
  onCancel:   () => void
}) {
  // A folha precisa do conteúdo no DOM durante a transição de saída — se o
  // corpo sumisse junto com `data`, ela fecharia vazia. Ao ABRIR o valor vem
  // direto de `data`, então não há quadro em branco esperando o efeito.
  const [lastShown, setLastShown] = useState<SurfaceConfirmData | null>(null)
  // Ajuste de estado durante o render (padrão da própria doc do React para
  // "estado derivado de props"): sem efeito, sem render em cascata.
  if (data && data !== lastShown) setLastShown(data)
  const shown = data ?? lastShown

  return (
    <Sheet
      open={!!data}
      title="Detectamos a superfície inteira"
      onClose={onCancel}
      doneLabel="Cancelar"
    >
      {shown ? (
        <>
          <p className="spn-hint" style={{ marginTop: 0, marginBottom: 12 }}>
            Em vez de aplicar só no que você pintou, dá pra aplicar o material em{' '}
            <strong>toda a superfície destacada em verde</strong> — até onde ela termina
            de verdade. <strong>Confira que só a superfície ficou em verde</strong>: se
            pegou tapete, cama ou móveis (porque o pincel passou por cima deles), use{' '}
            <strong>“Usar só o que pintei”</strong> e pinte de novo evitando os objetos.
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shown.previewUrl}
            alt="superfície detectada"
            style={{
              width: '100%', maxHeight: 320, objectFit: 'contain',
              borderRadius: 'var(--r-inner)', border: '0.5px solid var(--glass-line)',
              background: 'var(--color-preview-bg)',
            }}
          />

          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            <button type="button" className="spn-cta" onClick={onApply}>
              Aplicar na superfície
              <span className="spn-cta-meta">{shown.surfaceCost} nodes</span>
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="spn-ghost" style={{ flex: 1 }}
                      onClick={() => onRefine(shown)}>
                Refinar seleção
              </button>
              <button type="button" className="spn-ghost" style={{ flex: 1 }} onClick={onBlobOnly}>
                Usar só o que pintei
              </button>
            </div>
          </div>
        </>
      ) : null}
    </Sheet>
  )
}
