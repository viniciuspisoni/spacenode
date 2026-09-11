'use client'

// components/finalizar/ui.tsx — primitivos visuais do editor Finalizar.
//
// O editor inteiro é montado com quatro peças daqui (Seg, Chip, IconBtn,
// Section). Por isso a conversão para o vidro acontece NESTE arquivo e não
// painel a painel: trocar a receita de cada primitivo reveste os sete painéis
// de uma vez, e nenhum deles precisa saber que material está por baixo.
//
// O que continua valendo do desenho anterior: interface neutra, verde só em
// estado real (ActiveDot, sucesso). O que muda: superfície, borda e curva
// saem dos tokens de vidro (--glass-*, --r-inner, --ease) em vez de valores
// literais, e o estado ativo passa a ser `aria-checked`/`aria-pressed` — o
// mesmo atributo que o CSS lê e que o leitor de tela anuncia.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Segmented, Sheet } from '@/components/app/glass'

export const sectionLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
}

export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="spn-field-label" style={style}>{children}</div>
}

// ── SliderRow ────────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Duplo-clique no rótulo volta a este valor (padrão 0). */
  defaultValue?: number
  format?: (v: number) => string
  disabled?: boolean
  title?: string
}

export function SliderRow({ label, value, min, max, step = 1, onChange, defaultValue = 0, format, disabled, title }: SliderRowProps) {
  const id = useId()
  const changed = value !== defaultValue
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitDraft = () => {
    setEditing(false)
    const n = Number(draft.replace(',', '.'))
    if (!Number.isFinite(n)) return
    onChange(Math.max(min, Math.min(max, n)))
  }

  // preenchimento do trilho (fração percorrida) — cinza, nunca verde
  const pct = Math.max(0, Math.min(100, ((value - min) / Math.max(1e-6, max - min)) * 100))
  const trackBg = `linear-gradient(to right, var(--color-text-quaternary) 0%, var(--color-text-quaternary) ${pct}%, var(--color-surface-hover) ${pct}%, var(--color-surface-hover) 100%)`

  return (
    <div
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <label
        htmlFor={id}
        onDoubleClick={() => onChange(defaultValue)}
        title={title ?? 'Duplo-clique para redefinir'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: changed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          width: 92, flexShrink: 0, cursor: 'default', userSelect: 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {/* indicador discreto de parâmetro alterado */}
        <span style={{
          width: 4, height: 4, borderRadius: 999, flexShrink: 0,
          background: changed ? 'var(--color-text-tertiary)' : 'transparent',
        }} />
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="spn-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 40, background: trackBg }}
      />
      {editing ? (
        <input
          ref={inputRef}
          className="spn-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft()
            if (e.key === 'Escape') setEditing(false)
            e.stopPropagation()
          }}
          inputMode="numeric"
          style={{
            width: 44, fontSize: 11.5, textAlign: 'right', padding: '2px 4px',
            fontVariantNumeric: 'tabular-nums', flexShrink: 0,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(String(value)); setEditing(true) }}
          title="Clique para digitar o valor"
          style={{
            width: 44, textAlign: 'right', fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
            color: changed ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)',
            flexShrink: 0, background: 'transparent', border: 'none', cursor: 'text', padding: 0,
          }}
        >
          {format ? format(value) : `${value > 0 ? '+' : ''}${value}`}
        </button>
      )}
    </div>
  )
}

// ── Segmentado ───────────────────────────────────────────────────────────────
//
// Mesma cápsula de vidro do <Segmented> do kit (o polegar é um elemento real,
// medido em JS — é isso que dá o deslize contínuo). O que impede reusar o
// componente pronto é o `title` de cada célula: no editor cada opção explica o
// que faz ao passar o mouse ("Remove o que está marcado e reconstrói o fundo"),
// e o kit não tem esse campo. Perder as dicas custaria mais do que repetir a
// medição.

/**
 * Segmentado do editor. Casca fina sobre a peça do kit — antes daqui havia
 * uma cópia do mesmo desenho que anunciava role="radiogroup" sem nome e sem
 * navegação por seta: prometia o padrão ARIA e não entregava. O kit tem as
 * duas coisas, então o que sobra aqui é só a adaptação de nomes de campo
 * ({id} do editor → {value} do kit) e a largura por conteúdo.
 */
interface SegProps<T extends string> {
  options: { id: T; label: string; title?: string; disabled?: boolean }[]
  value: T
  onChange: (id: T) => void
  /** Nome do grupo para o leitor de tela. Ex.: "Modo de limpeza". */
  label: string
}

export function Seg<T extends string>({ options, value, onChange, label }: SegProps<T>) {
  return (
    <div style={{ width: 'fit-content' }}>
      <Segmented
        label={label}
        value={value}
        onChange={onChange}
        items={options.map(o => ({ value: o.id, label: o.label, title: o.title, disabled: o.disabled }))}
      />
    </div>
  )
}

// ── Chip / IconBtn ───────────────────────────────────────────────────────────

interface ChipProps {
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
  title?: string
  disabled?: boolean
}

export function Chip({ active, onClick, children, title, disabled }: ChipProps) {
  // Metade dos chips do editor é ESCOLHA ("Forma"/"Refinar") e metade é AÇÃO
  // ("Recuperar janelas"). Só a primeira ganha role/aria-checked: anunciar
  // "opção não marcada" num botão que dispara uma correção mente para o leitor
  // de tela. O CSS lê aria-checked, então a ação nunca acende — que é o certo.
  const isChoice = active !== undefined
  return (
    <button
      type="button"
      className="spn-pill"
      role={isChoice ? 'radio' : undefined}
      aria-checked={isChoice ? active : undefined}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

interface IconBtnProps {
  onClick?: () => void
  title: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  size?: number
}

export function IconBtn({ onClick, title, active, disabled, children, size = 30 }: IconBtnProps) {
  // Ativo = controle elevado, não retângulo cinza. É a mesma leitura do
  // polegar do segmentado e do chip ligado — um material, não uma cor.
  //
  // Mesma regra do Chip: só quem TEM estado ganha `aria-pressed`. Seis dos
  // oito IconBtn do editor (voltar, desfazer, refazer, zoom+, zoom−, ajustar)
  // são ação pura — anunciá-los como botão de alternância "não pressionado"
  // mente para o leitor de tela do mesmo jeito que o `aria-checked` numa ação.
  return (
    <button
      type="button"
      className={active ? 'spn-icon-btn spn-glass spn-glass--raised' : 'spn-icon-btn'}
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active === undefined ? undefined : active}
      style={{
        width: size, height: size, flex: `0 0 ${size}px`,
        opacity: disabled ? 0.38 : 1,
        cursor: disabled ? 'default' : 'pointer',
        color: active ? 'var(--color-text-primary)' : undefined,
      }}
    >
      {children}
    </button>
  )
}

/** Nó verde pequeno — ÚNICO marcador verde de seleção (cards/listas). */
export function ActiveDot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 999, flexShrink: 0,
      background: on ? 'var(--color-accent-green)' : 'transparent',
      border: on ? 'none' : '0.5px solid var(--glass-line-strong)',
      transition: 'background var(--duration-fast)',
    }} />
  )
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return vertical
    ? <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--glass-line)', flexShrink: 0 }} />
    : <div style={{ height: 1, width: '100%', background: 'var(--glass-line)', flexShrink: 0 }} />
}

// ── Seção recolhível do painel contextual ────────────────────────────────────

interface SectionProps {
  title: string
  children: React.ReactNode
  open: boolean
  onToggle: () => void
  right?: React.ReactNode
}

export function Section({ title, children, open, onToggle, right }: SectionProps) {
  return (
    <div style={{ borderBottom: '0.5px solid var(--glass-line)' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{
            color: 'var(--color-text-quaternary)', flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--ease)',
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="spn-field-label" style={{ flex: 1, marginBottom: 0 }}>{title}</span>
        {right}
      </div>
      {open && <div style={{ padding: '4px 14px 16px' }}>{children}</div>}
    </div>
  )
}

// ── Confirmar e nomear ───────────────────────────────────────────────────────
//
// O editor perguntava por `window.confirm`/`window.prompt` em seis pontos
// (excluir predefinição, remover elemento, remover máscara, apagar snapshot,
// nomear predefinição, nomear snapshot). Um diálogo do navegador ignora o
// tema, abre fora da janela do app e pode ser suprimido pelo próprio usuário
// no Chrome — aí a pergunta não acontece e a ação some sem explicação. Estas
// duas folhas cobrem os seis casos.

export function ConfirmSheet({ open, title, message, confirmLabel = 'Excluir', destructive = true, onConfirm, onClose }: {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose} doneLabel="Cancelar">
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
        {message}
      </p>
      <button
        type="button"
        className="spn-cta"
        onClick={() => { onConfirm(); onClose() }}
        style={destructive ? { background: 'var(--color-error-bg)', color: 'var(--color-error)' } : undefined}
      >
        {confirmLabel}
      </button>
    </Sheet>
  )
}

export function PromptSheet({ open, title, label, placeholder, initialValue = '', confirmLabel = 'Salvar', onSubmit, onClose }: {
  open: boolean
  title: string
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialValue)
  // Cada abertura começa do valor inicial: reaproveitar o texto da vez
  // anterior faria salvar duas predefinições com o mesmo nome sem perceber.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset deliberado a cada abertura da folha
    if (open) setValue(initialValue)
  }, [open, initialValue])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onSubmit(v)
    onClose()
  }

  return (
    <Sheet open={open} title={title} onClose={onClose} doneLabel="Cancelar">
      <div className="spn-field">
        <span className="spn-field-label">{label}</span>
        <input
          className="spn-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          // Sem stopPropagation: o evento sintético precisa chegar à <Sheet>,
          // que é quem prende o Tab dentro da folha. Os atalhos do editor já
          // ignoram campo de texto (FinalizeEditor: guarda `isTyping`).
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
      </div>
      <button type="button" className="spn-cta" onClick={submit} disabled={!value.trim()}>
        {confirmLabel}
      </button>
    </Sheet>
  )
}

export const kbdStyle: React.CSSProperties = {
  padding: '1px 5px', borderRadius: 4, fontSize: 10.5, fontFamily: 'inherit',
  border: '0.5px solid var(--glass-line)', background: 'var(--glass-raised)',
  color: 'var(--color-text-tertiary)',
}
