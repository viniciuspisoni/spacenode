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

      <style jsx>{`
        .spn-ambient {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          background: var(--color-bg);
        }
        /* Degradê de base: segura o mesmo papel quando o blurDataURL não
           existe (SVG no acervo, build sem otimização de imagem). Metade da
           intensidade do painel do plugin — aqui ele SOMA com o render e os
           dois hotspots caem no alto do viewport, justamente onde há texto
           passando; junto com o papel de parede estourariam o teto de
           luminância que o contraste do terciário exige. */
        .spn-ambient::before {
          content: '';
          position: absolute;
          inset: -20%;
          background:
            radial-gradient(60% 50% at 20% 0%, rgba(120, 140, 180, 0.10), transparent 70%),
            radial-gradient(50% 40% at 90% 20%, rgba(180, 140, 120, 0.08), transparent 70%);
        }
        /* Mesmo tratamento do painel v1 do plugin. A camada é fixa e não se
           move: o borrão é rasterizado uma vez e depois só composto — rolar
           a página não refaz o filtro. O tamanho de 150% existe porque a
           aresta de um elemento borrado desbota; sem a folga, apareceria
           uma moldura clara em volta do viewport. */
        .spn-ambient-img {
          position: absolute;
          inset: -25%;
          width: 150%;
          height: 150%;
          background-size: cover;
          background-position: center;
          filter: blur(48px) saturate(1.7);
          opacity: 0;
          transform: scale(1.1);
          transition: opacity 900ms var(--ease);
        }
        .spn-ambient-img[data-on='true'] {
          opacity: var(--ambient-opacity);
        }
        /* Véu: o que garante contraste AA do texto sobre o papel de parede. */
        .spn-ambient::after {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--ambient-veil);
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-ambient-img { transition: none; }
        }
      `}</style>
    </div>
  )
}
