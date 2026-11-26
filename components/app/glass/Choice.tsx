'use client'

/**
 * Pílulas e cartões de escolha — os dois controles que povoam as folhas.
 *
 * Pílula: lista longa e homogênea (segmentos, ambientes, iluminação).
 * Cartão: poucas opções que precisam de uma linha de explicação (motor,
 * qualidade, tipo de vídeo). Espelho de `dialog.html:501-540`.
 *
 * Os dois são `role="radio"`/`checkbox` de verdade e o estado ativo vive em
 * `aria-checked` — que é também o seletor do CSS. Um atributo só, sem classe
 * paralela que possa divergir do que o leitor de tela anuncia.
 */

export interface PillGroupProps<T extends string> {
  options: ReadonlyArray<T>
  value: T
  onChange: (value: T) => void
  label: string
  disabled?: boolean
}

export function PillGroup<T extends string>({
  options, value, onChange, label, disabled,
}: PillGroupProps<T>) {
  return (
    <div className="spn-pills" role="radiogroup" aria-label={label}>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          role="radio"
          className="spn-pill"
          aria-checked={opt === value}
          disabled={disabled}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export interface MultiPillGroupProps<T extends string> {
  options: ReadonlyArray<T>
  values: ReadonlyArray<T>
  onChange: (values: T[]) => void
  label: string
  disabled?: boolean
}

export function MultiPillGroup<T extends string>({
  options, values, onChange, label, disabled,
}: MultiPillGroupProps<T>) {
  return (
    <div className="spn-pills" role="group" aria-label={label}>
      {options.map(opt => {
        const on = values.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            role="checkbox"
            className="spn-pill"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(on ? values.filter(v => v !== opt) : [...values, opt])}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

export interface ChoiceOption<T extends string> {
  value: T
  /** Linha de cima, em negrito. */
  title: string
  /** Linha de baixo, menor — o "por quê" da opção. */
  note?: string
  disabled?: boolean
}

export interface ChoiceGroupProps<T extends string> {
  options: ReadonlyArray<ChoiceOption<T>>
  value: T
  onChange: (value: T) => void
  label: string
  /** 2 ou 3 colunas. Acima disso o cartão fica estreito demais para a nota. */
  cols?: 2 | 3
}

export function ChoiceGroup<T extends string>({
  options, value, onChange, label, cols = 3,
}: ChoiceGroupProps<T>) {
  const focusValue = options.find(opt => opt.value === value && !opt.disabled)?.value
    ?? options.find(opt => !opt.disabled)?.value
  return (
    <div className="spn-choices" data-cols={cols} role="radiogroup" aria-label={label}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          className="spn-choice"
          aria-checked={opt.value === value}
          disabled={opt.disabled}
          tabIndex={opt.value === focusValue ? 0 : -1}
          onClick={() => onChange(opt.value)}
          onKeyDown={event => {
            if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const enabled = options.filter(option => !option.disabled)
            if (!enabled.length) return
            const index = enabled.findIndex(option => option.value === opt.value)
            const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
              : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
            const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(':scope > button') ?? [])
              .filter(button => !button.disabled)
            buttons[nextIndex]?.focus()
            onChange(enabled[nextIndex].value)
          }}
        >
          <b>{opt.title}</b>
          {opt.note ? <span>{opt.note}</span> : null}
        </button>
      ))}
    </div>
  )
}
