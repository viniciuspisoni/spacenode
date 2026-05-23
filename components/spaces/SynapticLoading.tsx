'use client'

// Loading state full-screen com logo SPACENODE como rede sináptica.
// Usado em Space em uso ao disparar Eixos panel.

import { useEffect, useState } from 'react'
import { ENGINES, type EngineId } from '@/lib/engines'
import type { Quality } from '@/lib/spaces/types'

interface Props {
  spaceName:  string
  count:      number
  totalNodes: number
  engine:     EngineId
  quality:    Quality
  onCancel?:  () => void
}

const PHASES = [
  'Lendo o DNA travado',
  'Aplicando variação ao motor',
  'Calculando coerência visual',
  'Renderizando saída final',
]

export function SynapticLoading({ spaceName, count, totalNodes, engine, quality, onCancel }: Props) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPhase(p => (p + 1) % PHASES.length), 3500)
    return () => clearInterval(t)
  }, [])

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
        Projeto {spaceName} · gerando {count} variaç{count === 1 ? 'ão' : 'ões'}
        <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 4 }}>
          {ENGINES[engine].name} · {quality.toUpperCase()} · {totalNodes} nodes
        </div>
      </div>

      {/* Synaptic logo — 5 nodes + 3 connectors */}
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ marginBottom: 36 }}>
        {/* Connectors */}
        <line x1="40" y1="80" x2="80" y2="40" stroke="rgba(70,209,145,0.3)" strokeWidth="1.5" className="syn-line syn-l1" />
        <line x1="80" y1="40" x2="120" y2="80" stroke="rgba(70,209,145,0.3)" strokeWidth="1.5" className="syn-line syn-l2" />
        <line x1="80" y1="40" x2="80" y2="120" stroke="rgba(70,209,145,0.3)" strokeWidth="1.5" className="syn-line syn-l3" />

        {/* Nodes */}
        <circle cx="40"  cy="80"  r="6" fill="#46d191" className="syn-node syn-n1" />
        <circle cx="80"  cy="40"  r="6" fill="#46d191" className="syn-node syn-n2" />
        <circle cx="120" cy="80"  r="6" fill="#46d191" className="syn-node syn-n3" />
        <circle cx="80"  cy="120" r="6" fill="#46d191" className="syn-node syn-n4" />
        <circle cx="80"  cy="80"  r="7" fill="#46d191" className="syn-node syn-n5" />
      </svg>

      {/* Phase text */}
      <div style={{
        fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)',
        letterSpacing: '-0.01em', marginBottom: 32, height: 22,
        textAlign: 'center', minWidth: 280,
      }}>
        <span className="syn-phase-text" key={phase}>{PHASES[phase]}…</span>
      </div>

      {/* Phase dots */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
        {PHASES.map((_, i) => (
          <span key={i} style={{
            width: i === phase ? 18 : 5, height: 5, borderRadius: 999,
            background: i === phase ? '#46d191' : 'rgba(255,255,255,0.18)',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          style={{
            background: 'transparent', border: '0.5px solid var(--color-border-strong)',
            padding: '8px 18px', borderRadius: 8,
            color: 'var(--color-text-tertiary)', fontSize: 12,
          }}
        >
          Cancelar
        </button>
      )}

      <style>{`
        .syn-node {
          transform-origin: center;
          animation: synPulse 1.6s ease-in-out infinite;
        }
        .syn-n1 { animation-delay: 0s; }
        .syn-n2 { animation-delay: 0.18s; }
        .syn-n3 { animation-delay: 0.36s; }
        .syn-n4 { animation-delay: 0.54s; }
        .syn-n5 { animation-delay: 0.72s; }

        .syn-line {
          stroke-dasharray: 4 6;
          animation: synLineFlow 2.2s linear infinite;
        }
        .syn-l2 { animation-delay: 0.4s; }
        .syn-l3 { animation-delay: 0.8s; }

        .syn-phase-text {
          display: inline-block;
          animation: synFade 0.6s ease-out;
        }

        @keyframes synPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.55); }
        }
        @keyframes synLineFlow {
          0%   { stroke-dashoffset: 10; opacity: 0.2; }
          50%  { opacity: 0.6; }
          100% { stroke-dashoffset: 0;  opacity: 0.2; }
        }
        @keyframes synFade {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .syn-node, .syn-line, .syn-phase-text { animation: none; }
        }
      `}</style>
    </div>
  )
}
