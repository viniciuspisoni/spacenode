'use client'

// BeforeAfterToggle — compara a base (antes) com a composição final (depois).
// Segurar o botão revela a base; soltar volta ao resultado.

interface Props {
  /** true enquanto mostrando só a base (antes). */
  showingBase: boolean
  onChange: (showingBase: boolean) => void
}

export function BeforeAfterToggle({ showingBase, onChange }: Props) {
  return (
    <button
      type="button"
      onPointerDown={() => onChange(true)}
      onPointerUp={() => onChange(false)}
      onPointerLeave={() => showingBase && onChange(false)}
      onClick={(e) => e.preventDefault()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '8px 13px',
        borderRadius: 9,
        fontSize: 12.5,
        userSelect: 'none',
        border: '0.5px solid var(--color-border-strong)',
        background: showingBase ? 'var(--color-surface-hover)' : 'var(--color-bg-elevated)',
        color: showingBase ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
      }}
      title="Segure para ver a imagem base (antes)"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 8l-4 4 4 4" opacity="0.5" />
      </svg>
      {showingBase ? 'Antes' : 'Comparar'}
    </button>
  )
}
