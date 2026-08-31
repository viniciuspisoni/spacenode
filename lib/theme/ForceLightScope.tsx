'use client'

import { useEffect } from 'react'

// Mantém a página atual sempre light (ex.: landing, base #fafafa com faixas
// .spn-dark) e, ao sair dela por navegação client-side, restaura o tema
// escolhido pelo usuário — a mesma resolução do script anti-flash do layout
// raiz.
export default function ForceLightScope() {
  useEffect(() => {
    document.documentElement.classList.add('light')
    return () => {
      try {
        const t = localStorage.getItem('theme')
        const light =
          t === 'light' ||
          ((t === null || t === 'system') &&
            window.matchMedia('(prefers-color-scheme: light)').matches)
        document.documentElement.classList.toggle('light', light)
      } catch {}
    }
  }, [])
  return null
}
