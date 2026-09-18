'use client'

import { useGlassIntensity } from '@/lib/theme/GlassIntensityProvider'

/** Quadrado cheio — extremo "mais opaco". */
function OpaqueIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="currentColor" />
    </svg>
  )
}

/** Dois quadrados sobrepostos, vazados — extremo "mais transparente": o de
 *  trás atravessa o da frente, a mesma ideia do ícone de transparência do
 *  iOS/macOS. */
function TransparentIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="4.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="1.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
    </svg>
  )
}

export default function GlassIntensitySlider() {
  const { glassIntensity, setGlassIntensity } = useGlassIntensity()
  const pct = Math.round(glassIntensity * 100)
  // Preenchimento do trilho: mesma receita do slider do Finalizar
  // (components/finalizar/ui.tsx) — cinza neutro, nunca verde (paleta
  // restrita: verde é só estado funcional).
  const trackBg = `linear-gradient(to right, var(--color-text-quaternary) 0%, var(--color-text-quaternary) ${pct}%, var(--color-surface-hover) ${pct}%, var(--color-surface-hover) 100%)`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        className="spn-glass spn-glass--raised"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          borderRadius: 999, padding: '10px 16px',
        }}
      >
        <span style={{ color: 'var(--color-text-tertiary)', flex: '0 0 auto', display: 'flex' }}>
          <OpaqueIcon />
        </span>
        <input
          type="range"
          className="spn-slider"
          min={0}
          max={1}
          step={0.01}
          value={glassIntensity}
          onChange={(e) => setGlassIntensity(Number(e.target.value))}
          aria-label="Intensidade do Liquid Glass"
          aria-valuetext={`${pct}% transparente`}
          style={{ flex: 1, minWidth: 40, background: trackBg }}
        />
        <span style={{ color: 'var(--color-text-tertiary)', flex: '0 0 auto', display: 'flex' }}>
          <TransparentIcon />
        </span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
      }}>
        <span>Mais opaco</span>
        <span>Mais transparente</span>
      </div>
    </div>
  )
}
