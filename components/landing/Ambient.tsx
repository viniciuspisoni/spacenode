'use client'

import { useEffect, useRef, useState } from 'react'
import casa from '@/public/gallery-casa-before.jpg'
import living from '@/public/gallery-living-after.jpg'
import comercial from '@/public/gallery-comercial-before.jpg'

// Papel de parede da landing — o mesmo recurso do painel v1 do plugin: um
// render borrado atrás de tudo é o que dá ao vidro algo para refratar. Sem
// ele, .spn-glass vira cinza chapado.
//
// Custo de rede: ZERO. Não usamos os arquivos, e sim o `blurDataURL` que o
// Next gera no import estático (JPEG minúsculo em base64, já embutido no
// bundle). A 150% do viewport com blur(48px) ninguém distingue de um render
// em tamanho real — e o LCP não paga por isso.
//
// Gotcha do acervo: nos pares casa/comercial os arquivos estão trocados no
// disco — o RENDER deles é o `-before.jpg` (ver marketing/BRIEF.md).
//
// O CSS de .spn-ambient / .spn-ambient-img vive em app/globals.css (seção
// "Papel de parede"): desde que o /app passou a usar a mesma camada, uma
// definição só serve landing e app — e os dois fallbacks de vidro (@supports
// e prefers-reduced-transparency) alcançam as duas pelo nome da classe.
const WALLPAPERS = [casa, living, comercial]

export function Ambient() {
  // Índice ativo: o papel de parede troca conforme a página rola, e a paleta
  // do vidro vai junto — topo quente (fachada), meio interior, fim urbano.
  const [index, setIndex] = useState(0)
  const rafRef = useRef(0)
  // Altura rolável fica em cache: lê-la dentro do rAF forçaria layout
  // síncrono a cada frame de scroll, e esta página é alta e cheia de
  // backdrop-filter — é exatamente onde isso custa caro.
  const scrollableRef = useRef(0)

  useEffect(() => {
    const measure = () => {
      scrollableRef.current = document.documentElement.scrollHeight - window.innerHeight
    }
    const read = () => {
      rafRef.current = 0
      const scrollable = scrollableRef.current
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0
      const next = Math.min(
        WALLPAPERS.length - 1,
        Math.floor(progress * WALLPAPERS.length),
      )
      setIndex(prev => (prev === next ? prev : next))
    }
    const onScroll = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(read)
    }
    const onResize = () => { measure(); onScroll() }

    measure()
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    // Imagens e fontes mudam a altura depois do primeiro paint.
    const ro = new ResizeObserver(measure)
    ro.observe(document.documentElement)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="spn-ambient" aria-hidden>
      {WALLPAPERS.map((wall, i) => (
        <div
          key={i}
          className="spn-ambient-img"
          data-on={i === index}
          style={{ backgroundImage: `url(${wall.blurDataURL})` }}
        />
      ))}
    </div>
  )
}
