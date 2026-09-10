'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Controle segmentado com polegar que desliza.
 *
 * O polegar é um elemento real com `transform` + `width` medidos em JS, não
 * um `background` que pula de célula em célula: é o que dá o movimento
 * contínuo, e é o que permite células de larguras diferentes (o plugin usa
 * isso em Render/Editar/Animar/Cenas — `dialog.html:381-401` e `:3770-3790`).
 *
 * Ele remede em resize, em troca de fonte e quando os itens mudam. A medida
 * roda em layout effect para não haver um frame com o polegar no lugar velho.
 */
export interface SegmentedItem<T extends string> {
  value: T
  label: string
  disabled?: boolean
  /** Por que esta célula está apagada. Sem isto o usuário vê a opção morta
   *  e não descobre o que fazer para acordá-la. */
  title?: string
}

export interface SegmentedProps<T extends string> {
  items: ReadonlyArray<SegmentedItem<T>>
  value: T
  onChange: (value: T) => void
  /** Rótulo do grupo para leitores de tela. */
  label: string
  className?: string
}

export function Segmented<T extends string>({
  items, value, onChange, label, className = '',
}: SegmentedProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState({ x: 0, w: 0 })

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const active = track.querySelector<HTMLElement>('[data-active="true"]')
    if (!active) return
    setThumb({ x: active.offsetLeft, w: active.offsetWidth })
  }, [])

  useLayoutEffect(() => { measure() }, [measure, value, items])

  useEffect(() => {
    window.addEventListener('resize', measure)
    // A fonte variável Geist chega depois do primeiro paint e muda as larguras.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready?.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // Setas navegam entre as opções, como num radiogroup nativo.
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const dir = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    ev.preventDefault()
    const enabled = items.filter(i => !i.disabled)
    const at = enabled.findIndex(i => i.value === value)
    const next = enabled[(at + dir + enabled.length) % enabled.length]
    if (next) onChange(next.value)
  }

  return (
    <div
      className={`spn-seg spn-glass ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <div className="spn-seg-track" ref={trackRef}>
        <span
          className="spn-seg-thumb"
          aria-hidden
          style={{ '--seg-x': `${thumb.x}px`, '--seg-w': `${thumb.w}px` } as React.CSSProperties}
        />
        {items.map(item => (
          <button
            key={item.value}
            type="button"
            role="radio"
            className="spn-seg-btn"
            data-active={item.value === value}
            aria-checked={item.value === value}
            disabled={item.disabled}
            title={item.title}
            tabIndex={item.value === value ? 0 : -1}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default Segmented
