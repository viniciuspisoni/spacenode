'use client'

// Ajustes avançados — seção recolhida que guarda tudo que não precisa
// estar na superfície: fidelidade, preservação, tipo de cena, atmosfera,
// frame final, catálogo completo de movimentos e motor de geração.
// A tela principal continua limpa; o poder continua acessível.

import { useState } from 'react'

interface Props {
  children: React.ReactNode
}

export default function AdvancedSettings({ children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      border:       '1px solid var(--color-border)',
      borderRadius: 10,
      overflow:     'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          width:          '100%',
          padding:        '11px 12px',
          background:     open ? 'var(--color-surface-subtle)' : 'transparent',
          border:         'none',
          cursor:         'pointer',
          transition:     'background 0.15s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
            stroke="var(--color-text-tertiary)" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2 4.5 H14 M2 8 H14 M2 11.5 H14"/>
            <circle cx="6"  cy="4.5"  r="1.6" fill="var(--color-bg)"/>
            <circle cx="10" cy="8"    r="1.6" fill="var(--color-bg)"/>
            <circle cx="5"  cy="11.5" r="1.6" fill="var(--color-bg)"/>
          </svg>
          <span style={{
            fontSize:      11.5,
            fontWeight:    500,
            letterSpacing: '-0.01em',
            color:         'var(--color-text-secondary)',
          }}>
            Ajustes avançados
          </span>
        </span>
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none"
          stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round"
          style={{
            transform:  open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s',
          }}
        >
          <path d="M3.5 6 L8 10.5 L12.5 6"/>
        </svg>
      </button>

      {open && (
        <div style={{
          padding:       '16px 12px 14px',
          borderTop:     '1px solid var(--color-border)',
          display:       'flex',
          flexDirection: 'column',
          gap:           20,
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
