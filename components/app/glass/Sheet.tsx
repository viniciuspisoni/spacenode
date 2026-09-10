'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

/**
 * Folha — a peça que sustenta a simplificação do app.
 *
 * A linha (`SettingRow`) mostra o valor já resolvido; a folha é o "só se
 * você quiser". Vinda do painel v1 do plugin (`dialog.html:463-493`), com
 * duas diferenças que o navegador impõe:
 *
 * 1. Duas geometrias. Abaixo de 720px ela sobe da base como no plugin; acima,
 *    vira cartão flutuante centrado — subir do rodapé numa tela de 1440px
 *    deixaria o conteúdo longe do olho e do cursor. O CSS decide (globals.css,
 *    seção "Folhas"); aqui não há media query nenhuma.
 * 2. Portal no <body>. O app tem `overflow:hidden` em cadeia no shell e
 *    `transform` em hover de cartão: qualquer ancestral com transform vira
 *    containing block e um `position:fixed` filho seria clipado junto. O
 *    portal tira a folha dessa cadeia de uma vez.
 *
 * A folha NÃO desmonta o conteúdo ao fechar: a transição de saída precisa do
 * DOM. Quem cuida disso é `data-open` + `visibility` no CSS, não React. Por
 * isso `autoFocus` não funciona aqui (o campo monta uma vez, invisível, e o
 * React nunca o refoca) — use `data-autofocus` no elemento que deve receber
 * o foco quando a folha abrir.
 */

/**
 * Quantas folhas estão abertas agora. É um contador, não um booleano, porque
 * folha abre folha (Referências → Importar, Mover → Nova pasta): com um
 * booleano, fechar a de dentro devolveria a rolagem do fundo com a de fora
 * ainda aberta.
 */
let openCount = 0

function lockScroll() {
  openCount += 1
  document.body.dataset.sheetOpen = 'true'
}
function unlockScroll() {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) delete document.body.dataset.sheetOpen
}

/** `false` no servidor, `true` depois de hidratar — sem setState em effect. */
const subscribeNoop = () => () => {}
const getTrue = () => true
const getFalse = () => false

export interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Rótulo do botão de fechar. "Pronto" cobre 90% dos casos. */
  doneLabel?: string
  /** Para o `aria-controls` da linha que abre esta folha apontar para algo. */
  id?: string
  /** `spn-sheet--wide` quando o conteúdo é uma grade de miniaturas. */
  className?: string
}

export function Sheet({
  open, title, onClose, children, doneLabel = 'Pronto', id, className = '',
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const mounted = useSyncExternalStore(subscribeNoop, getTrue, getFalse)

  // ESC fecha. Registrado só enquanto aberta — com várias folhas na mesma
  // tela, um listener sempre ativo por folha fecharia todas de uma vez.
  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    lockScroll()

    // O foco vai para o campo marcado com data-autofocus; sem ele, para a
    // própria folha — nunca para o primeiro controle, senão o leitor de tela
    // anuncia a opção antes do título.
    const t = window.setTimeout(() => {
      const target = sheetRef.current?.querySelector<HTMLElement>('[data-autofocus]')
      ;(target ?? sheetRef.current)?.focus()
    }, 40)

    return () => {
      window.clearTimeout(t)
      unlockScroll()
      // Só devolve o foco se o elemento ainda existir E estiver visível.
      // Quando uma folha fecha para outra abrir, quem abriu já está sob
      // `visibility: hidden` — focar ali é no-op e o foco cairia no <body>,
      // reiniciando a ordem de tabulação do topo da página.
      const prev = restoreFocusRef.current
      if (prev?.isConnected && prev.offsetParent !== null) prev.focus()
    }
  }, [open])

  // Trava de rolagem. `body { overflow: hidden }` não basta: no /app o <body>
  // não rola — o shell é `height:100vh; overflow:hidden` e quem rola é um
  // filho (o corpo do painel, o grid do histórico). Barrar a roda no scrim
  // funciona qualquer que seja o scroller, porque o scrim cobre o viewport
  // inteiro. Precisa ser listener nativo: o onWheel do React é passivo e
  // preventDefault() nele não tem efeito.
  useEffect(() => {
    if (!open) return
    const scrim = scrimRef.current
    if (!scrim) return
    const block = (ev: Event) => ev.preventDefault()
    scrim.addEventListener('wheel', block, { passive: false })
    scrim.addEventListener('touchmove', block, { passive: false })
    return () => {
      scrim.removeEventListener('wheel', block)
      scrim.removeEventListener('touchmove', block)
    }
  }, [open])

  // Foco preso dentro da folha enquanto ela estiver aberta.
  const onKeyDownTrap = (ev: React.KeyboardEvent) => {
    if (ev.key !== 'Tab') return
    const root = sheetRef.current
    if (!root) return
    const focusables = root.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus() }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus() }
  }

  if (!mounted) return null

  return createPortal(
    <>
      <div ref={scrimRef} className="spn-scrim" data-open={open} onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        id={id}
        className={`spn-sheet spn-glass spn-glass--chrome ${className}`.trim()}
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
      >
        <div className="spn-sheet-grabber" aria-hidden />
        <div className="spn-sheet-head">
          <span className="spn-sheet-title">{title}</span>
          <button type="button" className="spn-sheet-done" onClick={onClose}>{doneLabel}</button>
        </div>
        <div className="spn-sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  )
}

export default Sheet
