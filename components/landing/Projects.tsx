'use client'

import Image from 'next/image'
import { useState } from 'react'
import { BeforeAfter } from './BeforeAfter'
import styles from './EditorialProjects.module.css'
import reviewStyles from './ProjectImageReview.module.css'
import { ProjectImageReview } from './ProjectImageReview'
import { originalProjects, projectImages, type LandingProject } from './projectImageCatalog'

const coverSizes = '(max-width: 760px) calc(100vw - 40px), (max-width: 959px) 92vw, (max-width: 1522px) 56vw, 855px'
// A fachada panorâmica preenche o quadro pela altura. O recorte usa apenas parte da largura baixada.
const exteriorSizes = '(max-width: 599px) calc(145vw - 58px), (max-width: 760px) calc(122vw - 49px), (max-width: 959px) 112vw, (max-width: 1522px) 81vw, 1240px'

function Chevron({ back = false }: { back?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transform: back ? 'rotate(180deg)' : undefined }}><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function Projects({ review = false }: { review?: boolean }) {
  return review
    ? <ProjectImageReview renderGallery={projects => <Gallery key={projects.map(project => project.id).join(',')} projects={projects} />} />
    : <Gallery projects={originalProjects} />
}

function Gallery({ projects }: { projects: LandingProject[] }) {
  const [index, setIndex] = useState(0)
  const [compare, setCompare] = useState(false)
  const project = projects[index]
  const { base, render } = projectImages(project)
  const sizes = project.exterior && !project.fullFrame ? exteriorSizes : coverSizes

  function move(delta: number) {
    setIndex(current => (current + delta + projects.length) % projects.length)
  }

  return (
    <section id="projetos" tabIndex={-1} aria-label={project.modelStudy ? 'Estudo de capa com render 3D convencional' : 'Galeria de projetos realizados com a SpaceNode'} className={styles.projects}>
      <figure>
        <div className={project.fullFrame ? `${styles.media} ${reviewStyles.fullFrame}` : styles.media}>
          {compare && base
            ? <BeforeAfter key={project.id} base={base} render={render} renderAlt={project.alt} sizes={sizes} aspect="auto" />
            : <Image src={render} unoptimized={render.startsWith('/review-assets/')} alt={project.alt} fill preload={index === 0} sizes={sizes} className={styles.image} />}
          {base && <button type="button" className={styles.compare} aria-pressed={compare} onClick={() => setCompare(value => !value)}>
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="4" width="16" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><path d="M9 2v16" stroke="currentColor" strokeWidth="1.5"/></svg>
            {compare ? 'Ver só o render' : project.modelStudy ? 'Comparar com a maquete' : 'Comparar com o original'}
          </button>}
        </div>
        <figcaption className={styles.caption}>
          <div className={styles.credit} aria-live="polite" aria-atomic="true">
            <strong>{project.title}</strong>
            <span>{project.modelStudy && 'Estudo de capa · '}{project.author}</span>
          </div>
          <div className={styles.controls}>
            <span aria-label={`Projeto ${index + 1} de ${projects.length}`}>{String(index + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}</span>
            {projects.length > 1 && <>
              <button type="button" aria-label="Projeto anterior" onClick={() => move(-1)}><Chevron back /></button>
              <button type="button" aria-label="Próximo projeto" onClick={() => move(1)}><Chevron /></button>
            </>}
          </div>
        </figcaption>
      </figure>
    </section>
  )
}
