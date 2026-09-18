'use client'

// Botão compacto de Liquid Glass da sidebar — abre um popover com o MESMO
// <GlassIntensitySlider/> da Conta. Nenhum estado próprio: só troca lugar
// de onde o slider aparece; quem guarda o valor é sempre o
// GlassIntensityProvider (contexto único), então mexer aqui ou em /app/conta
// atualiza os dois na hora.
//
// Portal pro <body>: a linha "Aparência" da sidebar (e a própria <aside>)
// tem overflow:hidden — é o que sustenta a animação de recolher a rail no
// mouse leave. Um popover absolute preso ali dentro seria cortado assim que
// tentasse abrir pra cima. Mesma razão do portal em components/app/glass/Sheet.tsx.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import GlassIntensitySlider from './GlassIntensitySlider'

/** Rail recolhida — distância entre o topo do botão e a base do popover. */
const GAP = 12
/** Rail expandida — mesmo padding horizontal da nav e da linha "Aparência"
 *  (Sidebar.tsx: `padding: 8px 12px`); o popover alinha com a área útil. */
const SIDEBAR_PAD = 12
/** Rail expandida — respiro entre a base do popover e o grupo de aparência,
 *  igual ao padding vertical dessa linha. */
const SIDEBAR_GAP = 8
/** Largura quando ancorado só no botão (rail recolhida). */
const ANCHORED_WIDTH = 224

/** Mesmo par de quadrados vazados do extremo "mais transparente" do slider
 *  (GlassIntensitySlider.tsx) — um símbolo só pro mesmo conceito, em dois
 *  tamanhos. */
function GlassGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="4.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="1.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
    </svg>
  )
}

interface GlassIntensityControlProps {
  /** Rail recolhida (mouse saiu da sidebar) — fecha o popover junto, senão
   *  ele fica flutuando sem o botão que o abriu (que já sumiu com opacity 0). */
  expanded: boolean
}

export default function GlassIntensityControl({ expanded }: GlassIntensityControlProps) {
  const [openState, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // A rail recolheu (mouse saiu da sidebar) — o botão já sumiu com
  // opacity:0, então o popover some junto. Derivado no render em vez de um
  // segundo `useState` + effect só pra espelhar `expanded`.
  const open = openState && expanded

  // Posição escrita direto no DOM, não em estado: a âncora se MOVE depois
  // de aberto (a rail anima a largura por 0,5 s), e uma medida única no
  // clique deixava o popover onde o botão ESTAVA naquele frame — por isso
  // ele caía em lugares diferentes conforme a ordem das ações.
  //
  // Duas estratégias, pelo estado da rail:
  //  • expandida → alinhado à SIDEBAR: borda esquerda na borda interna
  //    (padding), largura = área útil, base logo acima da linha "Aparência";
  //  • recolhida → centrado no BOTÃO, largura fixa.
  // `expanded` entra pelo closure (useCallback), então o effect abaixo
  // re-subscreve quando a rail muda — a medida nunca usa um estado velho.
  const measure = useCallback(() => {
    const btn = btnRef.current
    const pop = popoverRef.current
    if (!btn || !pop) return
    const aside = btn.closest('aside')
    const row = btn.parentElement
    if (expanded && aside && row) {
      const a = aside.getBoundingClientRect()
      const g = row.getBoundingClientRect()
      pop.style.left = `${a.left + SIDEBAR_PAD}px`
      pop.style.width = `${a.width - SIDEBAR_PAD * 2}px`
      pop.style.top = `${g.top - SIDEBAR_GAP}px`
      pop.style.transform = 'translateY(-100%)'
    } else {
      const r = btn.getBoundingClientRect()
      pop.style.left = `${r.left + r.width / 2}px`
      pop.style.width = `${ANCHORED_WIDTH}px`
      pop.style.top = `${r.top - GAP}px`
      pop.style.transform = 'translate(-50%, -100%)'
    }
  }, [expanded])

  // Layout effect: mede antes do primeiro paint do portal (sem frame em 0,0)
  // e depois segue a âncora enquanto estiver aberto. O ResizeObserver na
  // <aside> dispara a cada frame da transição de largura — é ele que
  // mantém o popover colado no botão durante a animação. resize/scroll da
  // janela e transitionend cobrem o resto.
  useLayoutEffect(() => {
    if (!open) return
    measure()
    const btn = btnRef.current
    const aside = btn?.closest('aside')
    const ro = new ResizeObserver(measure)
    if (btn) ro.observe(btn)
    if (aside) ro.observe(aside)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    aside?.addEventListener('transitionend', measure)
    // Cinto e suspensório: a rail anima por 0,5 s (Sidebar.tsx); mesmo que
    // um frame do observer se perca, estas medidas fixas cobrem a curva
    // inteira e a acomodação final.
    const timers = [60, 180, 320, 560].map(ms => window.setTimeout(measure, ms))
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      aside?.removeEventListener('transitionend', measure)
      timers.forEach(t => window.clearTimeout(t))
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="spn-glass spn-glass--raised"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Liquid Glass"
        title="Liquid Glass"
        style={{
          width: 30, height: 30, borderRadius: 999, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: open ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          cursor: 'pointer',
        }}
      >
        <GlassGlyph />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Intensidade do Liquid Glass"
          className="spn-glass spn-glass--chrome spn-popover spn-popover--anchored"
          style={{
            position: 'fixed',
            // top/left/width/transform vêm de measure(), conforme a rail.
            padding: '14px 16px',
            zIndex: 160,
            borderRadius: 'var(--r-card)',
          }}
        >
          <div className="spn-field-label" style={{ marginBottom: 10 }}>Liquid Glass</div>
          <GlassIntensitySlider />
        </div>,
        document.body,
      )}
    </>
  )
}
