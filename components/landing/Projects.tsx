'use client'

import Image from 'next/image'
import { useState } from 'react'
import { BeforeAfter } from './BeforeAfter'
import styles from './EditorialProjects.module.css'

// Pares da seleção aprovada para a landing. O crédito acompanha cada vista.
const projects = [
  { id: 142, title: 'Pátio com espelho d’água', author: 'muda arquitetura', alt: 'Pátio arborizado com volumes de concreto, espelho d’água e deck de madeira.' },
  { id: 183, title: 'Sala com painel de madeira', author: 'Bruna Plentz', alt: 'Living integrado com painel de madeira, poltrona caramelo e tapete azul.' },
  { id: 13, title: 'Fachada residencial', author: 'Natália Benchimol Maggi', alt: 'Fachada de dois pavimentos com volumes brancos, revestimento de pedra e jardim.' },
  { id: 345, title: 'Quarto com detalhes amarelos', author: 'Nathalia Costa', alt: 'Quarto com iluminação indireta, marcenaria escura e roupa de cama com detalhes amarelos.' },
  { id: 94, title: 'Cozinha com marcenaria', author: 'muda arquitetura', alt: 'Cozinha com armários de madeira, piso escuro e revestimento estampado.' },
  { id: 25, title: 'Escritório', author: 'Bruna Plentz', alt: 'Escritório com poltronas azuis e estante iluminada ao fundo.' },
  { id: 174, title: 'Cozinha com bancada de madeira', author: 'Natália Benchimol Maggi', alt: 'Cozinha com ilha de madeira, banquetas e armários superiores.' },
  { id: 100, title: 'Sala de estar', author: 'Nathalia Costa', alt: 'Sala clara com sofá, painel de madeira e mesa lateral.' },
  { id: 21, title: 'Sala de estar colorida', author: 'Bruna Plentz', alt: 'Sala com sofá azul e pintura em tom terracota acompanhando a área de jantar.' },
]

function Chevron({ back = false }: { back?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transform: back ? 'rotate(180deg)' : undefined }}><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function Projects() {
  const [index, setIndex] = useState(0)
  const [compare, setCompare] = useState(false)
  const project = projects[index]
  const render = project.id === 183 ? '/cliente-bruna-sala-painel-tv-183-render.jpg' : `/projetos-aprovados/${project.id}.webp`
  const base = project.id === 183 ? '/cliente-bruna-sala-painel-tv-183-base.jpg' : `/projetos-aprovados/${project.id}-base.webp`

  function move(delta: number) {
    setIndex(current => (current + delta + projects.length) % projects.length)
  }

  return (
    <section id="projetos" aria-label="Galeria de projetos realizados com a SpaceNode" className={styles.projects}>
      <figure>
        <div className={styles.media}>
          {compare
            ? <BeforeAfter key={project.id} base={base} render={render} sizes="(max-width: 700px) 100vw, 94vw" aspect="auto" />
            : <Image src={render} alt={project.alt} fill preload={index === 0} sizes="(max-width: 700px) 100vw, 94vw" className={styles.image} />}
          <button type="button" className={styles.compare} aria-pressed={compare} onClick={() => setCompare(value => !value)}>
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="4" width="16" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M9 2v16" stroke="currentColor" strokeWidth="1.5"/></svg>
            {compare ? 'Ver só o render' : 'Comparar com o original'}
          </button>
        </div>
        <figcaption className={styles.caption}>
          <div className={styles.credit} aria-live="polite" aria-atomic="true"><strong>{project.title}</strong><span>{project.author}</span></div>
          <div className={styles.controls}>
            <span aria-label={`Projeto ${index + 1} de ${projects.length}`}>{String(index + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}</span>
            <button type="button" aria-label="Projeto anterior" onClick={() => move(-1)}><Chevron back /></button>
            <button type="button" aria-label="Próximo projeto" onClick={() => move(1)}><Chevron /></button>
          </div>
        </figcaption>
      </figure>
    </section>
  )
}
