'use client'

// Loading overlay específico pra batch do eixo Ângulo.
// Diferente do SynapticLoading (que é genérico pra geração single):
// mostra N pontos representando os N sketches em processamento.
//
// Sem progresso real-time (a API roda chunks server-side e retorna depois
// de tudo). O overlay informa o tamanho do batch + tempo estimado.

import { useEffect, useState } from 'react'
import { ENGINES, type EngineId } from '@/lib/engines'
import type { Quality } from '@/lib/spaces/types'

interface Props {
  spaceName:    string
  batchSize:    number
  totalNodes:   number
  engine:       EngineId
  quality:      Quality
}

const PHASES = [
  'Lendo o DNA travado',
  'Aplicando estilo aos sketches',
  'Compondo materiais e luz',
  'Renderizando ângulos',
]

export function BatchProgressOverlay({ spaceName, batchSize, totalNodes, engine, quality }: Props) {
  const [phase, setPhase] = useState(0)
  const [secs, setSecs]   = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPhase(p => (p + 1) % PHASES.length), 4000)
    const s = setInterval(() => setSecs(x => x + 1), 1000)
    return () => { clearInterval(t); clearInterval(s) }
  }, [])

  // Estimativa: ~30s por chunk de 4 — então ~30s × ceil(N/4)
  const estimatedSecs = 30 * Math.ceil(batchSize / 4)
  const remaining = Math.max(0, estimatedSecs - secs)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(18px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 24,
    }}>
      {/* Top context */}
      <div style={{
        position: 'absolute', top: 28, left: 0, right: 0,
        textAlign: 'center', fontSize: 11, color: 'var(--color-text-tertiary)',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>
        Projeto {spaceName} · gerando {batchSize} ângulo{batchSize === 1 ? '' : 's'}
        <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 4 }}>
          {ENGINES[engine].name} · {quality.toUpperCase()} · {totalNodes} nodes
        </div>
      </div>

      {/* Grid de N pontos pulsando */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(batchSize, 5)}, 1fr)`,
        gap: 18,
        marginBottom: 36,
        maxWidth: 320,
      }}>
        {Array.from({ length: batchSize }).map((_, i) => (
          <div key={i} style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(70,209,145,0.12)',
            border: '0.5px solid rgba(70,209,145,0.4)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div
              className="batch-dot-pulse"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          </div>
        ))}
      </div>

      {/* Phase text */}
      <div style={{
        fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)',
        letterSpacing: '-0.01em', marginBottom: 14, height: 22,
        textAlign: 'center', minWidth: 280,
      }}>
        <span className="batch-fade" key={phase}>{PHASES[phase]}…</span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 32 }}>
        {remaining > 0 ? `tempo estimado: ~${remaining}s` : 'finalizando…'}
      </div>

      {/* Phase dots */}
      <div style={{ display: 'flex', gap: 8 }}>
        {PHASES.map((_, i) => (
          <span key={i} style={{
            width: i === phase ? 18 : 5, height: 5, borderRadius: 999,
            background: i === phase ? '#46d191' : 'rgba(255,255,255,0.18)',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      <style>{`
        .batch-dot-pulse {
          position: absolute; inset: 0;
          background: radial-gradient(circle, rgba(70,209,145,0.55) 0%, transparent 70%);
          animation: batchPulse 1.6s ease-in-out infinite;
        }
        @keyframes batchPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50%       { opacity: 1;   transform: scale(1.05); }
        }
        .batch-fade {
          display: inline-block;
          animation: batchFade 0.5s ease-out;
        }
        @keyframes batchFade {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .batch-dot-pulse, .batch-fade { animation: none; }
        }
      `}</style>
    </div>
  )
}
