'use client'

/**
 * Linha de ajuste + o grupo que as encaixota.
 *
 * É o padrão que faz a simplificação existir: em vez de despejar 40 pílulas
 * na tela, cada família vira UMA linha que já mostra o valor resolvido —
 * "Residencial · Sala de Estar · Premium". Quem está satisfeito com o default
 * nunca abre nada; quem quer mexer clica e a folha sobe.
 *
 * Vindo de `sketchup/spacenode/dialog.html:407-431` e `:928-961`.
 */

export function SettingGroup({ children, className = '' }: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`spn-group spn-glass ${className}`.trim()}>{children}</div>
}

export interface SettingRowProps {
  /** SVG de 24×24 com `stroke="currentColor"`. */
  icon: React.ReactNode
  title: string
  /**
   * O resumo do estado atual. Monte-o com `summarize()` — vazio some, e a
   * linha fica só com o título (é o caso de "nada configurado ainda").
   */
  value?: string
  onOpen: () => void
  disabled?: boolean
  /** Id da folha que esta linha abre, para `aria-controls`. */
  controls?: string
}

export function SettingRow({ icon, title, value, onOpen, disabled, controls }: SettingRowProps) {
  return (
    <button
      type="button"
      className="spn-row"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-controls={controls}
    >
      <span className="spn-row-ico" aria-hidden>{icon}</span>
      <span className="spn-row-title">{title}</span>
      {value ? <span className="spn-row-value">{value}</span> : <span className="spn-row-value" />}
      <svg className="spn-row-chev" viewBox="0 0 8 14" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1 1l6 6-6 6" />
      </svg>
    </button>
  )
}

/**
 * Junta as partes de um resumo com " · ", descartando o que estiver vazio.
 * Espelho de `joinParts()` (`dialog.html:3861-3863`) — a razão de existir é
 * que quase todo campo tem um default que NÃO deve aparecer no resumo
 * ("Preservar Original" é ruído), então quem chama passa `''` e some.
 */
export function summarize(parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' · ')
}

export default SettingRow
