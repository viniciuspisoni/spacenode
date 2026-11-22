'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { exteriorProjects, interiorProjects, projectImages, userProjects, type LandingProject } from './projectImageCatalog'
import galleryStyles from './EditorialProjects.module.css'
import styles from './ProjectImageReview.module.css'

const allGroups = {
  exterior: { name: 'Área externa', projects: exteriorProjects },
  interior: { name: 'Interior', projects: interiorProjects },
}

const userGroups = {
  exterior: { name: 'Área externa', projects: userProjects.filter(project => project.exterior) },
  interior: { name: 'Interior', projects: userProjects.filter(project => !project.exterior) },
}

type Group = keyof typeof allGroups

export function CoverComparison({ cover, chooseCover, usersOnly }: {
  cover: LandingProject; chooseCover: (id: string) => void; usersOnly: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<Group>('exterior')
  const [options, setOptions] = useState<Partial<Record<Group, string>>>({})
  const [aspectRatio, setAspectRatio] = useState<string>()
  const comparisonGroups = usersOnly ? userGroups : allGroups
  function selectedProject(group: Group) {
    const { projects } = comparisonGroups[group]
    return projects.find(item => item.id === options[group]) ?? projects[0]
  }
  const project = selectedProject(active)
  const { render } = projectImages(project)

  useEffect(() => {
    if (!open) return
    const coverFrame = document.querySelector('#projetos figure > div')
    if (!coverFrame || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width && height) setAspectRatio(`${width} / ${height}`)
    })
    observer.observe(coverFrame)
    return () => observer.disconnect()
  }, [open])

  function selectOption(group: Group, id: string) {
    setOptions(previous => ({ ...previous, [group]: id }))
    setActive(group)
  }

  return (
    <details className={styles.comparison} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Comparar duas capas<span aria-hidden="true" className={styles.indicator} /></summary>
      {open && <div className={styles.comparisonContent}>
        <div className={styles.selectors}>
          {(['exterior', 'interior'] as const).map(group => (
            <label key={group}>
              {group === 'exterior' ? 'Foto externa' : 'Foto de interior'}
              <select value={selectedProject(group).id} onChange={event => selectOption(group, event.target.value)}>
                {comparisonGroups[group].projects.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div role="group" aria-label="Capa em exibição" className={styles.filters}>
          {(['exterior', 'interior'] as const).map(group => (
            <button key={group} type="button" aria-pressed={active === group} onClick={() => setActive(group)}>
              {comparisonGroups[group].name}
            </button>
          ))}
        </div>
        <figure className={styles.comparisonFigure} data-cover-preview={project.id}>
          <div className={`${styles.comparisonFrame} ${project.fullFrame ? styles.fullFrame : ''}`} style={{ aspectRatio }}>
            <Image src={render} unoptimized={render.startsWith('/review-assets/')} alt={project.alt} fill
              sizes="(max-width: 760px) 86vw, (max-width: 1340px) 82vw, 1150px" className={galleryStyles.image} />
          </div>
          <figcaption>
            <div aria-live="polite" aria-atomic="true">
              <strong>{project.title}</strong><span>{project.author}</span>
            </div>
            <button className={styles.copy} type="button" disabled={cover.id === project.id} onClick={() => chooseCover(project.id)}>
              {cover.id === project.id ? 'Capa escolhida' : 'Usar esta capa'}
            </button>
          </figcaption>
        </figure>
      </div>}
    </details>
  )
}
