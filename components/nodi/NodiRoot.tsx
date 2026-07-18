'use client'

// ── Raiz do Nodi ──────────────────────────────────────────────────────────────
//
// Montada uma vez no layout autenticado (app/app/layout.tsx, atrás do flag
// NODI_ENABLED). Responsável pelo que é "casco": botão flutuante, abrir/fechar,
// contexto de página (rota + enriquecimento opcional via evento), teclado
// (Esc fecha, foco volta pro botão) e persistência da conversa na sessão.
//
// O conteúdo do painel mora em NodiPanel. Estilos: seção "Nodi" do globals.css.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { deriveNodiContext } from '@/lib/nodi/context'
import type { NodiContext } from '@/lib/nodi/types'
import NodiAvatar from './NodiAvatar'
import NodiPanel from './NodiPanel'

/** Abre o painel de qualquer lugar: window.dispatchEvent(new Event(NODI_OPEN_EVENT)) */
export const NODI_OPEN_EVENT = 'spn:nodi:open'
/** Enriquecimento de contexto pela página (detail = objeto {chave: valor} de strings curtas). */
export const NODI_CONTEXT_EVENT = 'spn:nodi:context'

export default function NodiRoot() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState<Record<string, string>>({})
  const launcherRef = useRef<HTMLButtonElement | null>(null)

  // Contexto derivado da rota + extras registrados pela página atual.
  const context: NodiContext = {
    ...deriveNodiContext(pathname ?? '/app'),
    extra: Object.keys(extra).length ? extra : undefined,
  }

  // Página muda → extras da página anterior deixam de valer. Reset durante o
  // render (padrão "adjust state when props change" do React — sem efeito).
  const [extraPath, setExtraPath] = useState(pathname)
  if (extraPath !== pathname) {
    setExtraPath(pathname)
    setExtra({})
  }

  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onContext = (e: Event) => {
      const detail = (e as CustomEvent<Record<string, unknown>>).detail
      if (!detail || typeof detail !== 'object') return
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(detail).slice(0, 8)) {
        if (typeof v === 'string' && v.length <= 120) clean[String(k).slice(0, 32)] = v
      }
      if (Object.keys(clean).length) setExtra(prev => ({ ...prev, ...clean }))
    }
    window.addEventListener(NODI_OPEN_EVENT, onOpen)
    window.addEventListener(NODI_CONTEXT_EVENT, onContext as EventListener)
    return () => {
      window.removeEventListener(NODI_OPEN_EVENT, onOpen)
      window.removeEventListener(NODI_CONTEXT_EVENT, onContext as EventListener)
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    // devolve o foco pro botão — leitor de tela/teclado não fica perdido
    requestAnimationFrame(() => launcherRef.current?.focus())
  }, [])

  // Esc fecha o painel (ouvinte global só enquanto aberto; o WelcomeTour não
  // roda junto — o tour vive no dashboard e tem overlay próprio por cima).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          className="spn-nodi-launcher"
          aria-label="Nodi — assistente da SpaceNode"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <NodiAvatar size={26} />
        </button>
      )}
      {open && <NodiPanel context={context} onClose={close} />}
    </>
  )
}
