'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { exteriorProjects, interiorProjects, originalProjects, projectById, projectImages, type LandingProject } from './projectImageCatalog'
import { CoverComparison } from './CoverComparison'
import styles from './ProjectImageReview.module.css'

const groups = {
  exterior: { label: 'Fachadas e externas', projects: exteriorProjects },
  interior: { label: 'Interiores', projects: interiorProjects },
  original: { label: 'Galeria original', projects: originalProjects },
} satisfies Record<string, { label: string; projects: LandingProject[] }>

const storageKey = 'spacenode:landing:project-selection:v1'
const changeEvent = 'spacenode-project-selection-change'
const originalIds = originalProjects.map(project => project.id)
let memoryOverride: string | null = null

function readSaved() {
  if (memoryOverride !== null) return memoryOverride
  try { return window.localStorage.getItem(storageKey) || '' } catch { return '' }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(changeEvent, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(changeEvent, onChange)
  }
}

function save(ids: string[] | null) {
  const raw = ids ? JSON.stringify(ids) : ''
  try {
    if (ids) window.localStorage.setItem(storageKey, raw)
    else window.localStorage.removeItem(storageKey)
    memoryOverride = null
  } catch {
    memoryOverride = raw
  }
  window.dispatchEvent(new Event(changeEvent))
  return memoryOverride === null
}

function readIds(raw: string): string[] {
  if (raw) {
    try {
      const stored: unknown = JSON.parse(raw)
      if (Array.isArray(stored)) {
        const ids = stored.filter((id): id is string => typeof id === 'string' && projectById.has(id))
        if (ids.length) return [...new Set(ids)]
      }
    } catch { /* Uma seleção de uma versão antiga pode ser restaurada. */ }
  }
  return originalIds
}

function projectsFrom(ids: string[]) {
  return ids.flatMap(id => {
    const project = projectById.get(id)
    return project ? [project] : []
  })
}

function describe(project: LandingProject) {
  return `${project.title} · ${project.author} [${project.id}]`
}

export function ProjectImageReview({ renderGallery }: { renderGallery: (projects: LandingProject[]) => ReactNode }) {
  const stored = useSyncExternalStore(subscribe, readSaved, () => '')
  const applied = readIds(stored)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [group, setGroup] = useState<keyof typeof groups>('exterior')
  const [notice, setNotice] = useState('')
  const [manualCopy, setManualCopy] = useState('')
  const panel = useRef<HTMLDetailsElement>(null)
  const copyField = useRef<HTMLTextAreaElement>(null)
  const selected = draft ?? applied
  const [cover, ...remaining] = projectsFrom(selected)
  const candidates = groups[group].projects

  useEffect(() => {
    function openFromLink() {
      if (window.location.hash === '#selecao-imagens' && panel.current) panel.current.open = true
    }
    openFromLink()
    window.addEventListener('hashchange', openFromLink)
    return () => window.removeEventListener('hashchange', openFromLink)
  }, [])

  useEffect(() => {
    if (manualCopy) {
      copyField.current?.focus()
      copyField.current?.select()
    }
  }, [manualCopy])

  function edit(ids: string[]) {
    setDraft(ids)
    setManualCopy('')
    setNotice('')
  }

  function chooseCover(id: string) {
    edit([id, ...selected.filter(value => value !== id)])
  }

  function toggleImage(id: string) {
    edit(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id])
  }

  function apply() {
    const persisted = save(selected)
    setDraft(null)
    setManualCopy('')
    setNotice(persisted ? 'Seleção aplicada e salva neste navegador.' : 'Seleção aplicada para esta visita.')
    requestAnimationFrame(() => {
      const gallery = document.getElementById('projetos')
      gallery?.focus({ preventScroll: true })
      gallery?.scrollIntoView({ block: 'start' })
    })
  }

  function restore() {
    save(null)
    setDraft(null)
    setManualCopy('')
    setNotice('A capa e a galeria originais foram restauradas.')
  }

  async function copySelection() {
    const text = [
      'Minha seleção para a landing da SpaceNode',
      'Capa — ' + describe(cover),
      'Outras imagens da galeria',
      ...(remaining.length ? remaining.map((project, index) => `${index + 1}. ${describe(project)}`) : ['Somente a capa.']),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setManualCopy('')
      setNotice('Seleção copiada. Cole o texto no chat.')
    } catch {
      setManualCopy(text)
      setNotice('Copie o texto selecionado abaixo e cole no chat.')
    }
  }

  return (
    <>
      {renderGallery(projectsFrom(applied))}
      <details ref={panel} id="selecao-imagens" className={styles.panel}>
        <summary><strong>Escolher imagens da prévia</strong><span aria-hidden="true" className={styles.indicator} /></summary>
        <div className={styles.content}>
          <p className={styles.intro}>Escolha a foto que abre a página e marque as outras imagens da galeria. Suas escolhas ficam neste navegador.</p>
          <CoverComparison cover={cover} chooseCover={chooseCover} />
          <div role="group" aria-label="Conjunto de imagens" className={styles.filters}>
            {(['exterior', 'interior', 'original'] as const).map(key => (
              <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>
                {groups[key].label} ({groups[key].projects.length})
              </button>
            ))}
          </div>
          <div className={styles.grid}>
            {candidates.map(project => {
              const { render } = projectImages(project)
              return (
                <article key={project.id} className={styles.card} data-project-id={project.id} aria-label={project.title}>
                  <div className={styles.thumbnail}>
                    <Image src={render} unoptimized={render.startsWith('/review-assets/')} alt={project.alt} fill sizes="(max-width: 600px) 43vw, (max-width: 920px) 28vw, 260px" />
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.author}</p>
                  <div className={styles.choices}>
                    <label>
                      <input type="radio" name="spacenode-review-cover" checked={cover.id === project.id}
                        aria-label={`Capa — ${project.title}`}
                        onChange={() => chooseCover(project.id)} />
                      Capa
                    </label>
                    <label>
                      <input type="checkbox" checked={selected.includes(project.id)} disabled={cover.id === project.id}
                        aria-label={`Galeria — ${project.title}`} onChange={() => toggleImage(project.id)} />
                      Galeria
                    </label>
                  </div>
                </article>
              )
            })}
          </div>
          <div className={styles.selection}>
            <p aria-live="polite">Capa · <strong>{cover.title}</strong> <span>({selected.length} {selected.length === 1 ? 'imagem' : 'imagens'} na galeria)</span></p>
            <button type="button" className={styles.textButton} onClick={() => edit([cover.id])} disabled={selected.length < 2}>Manter só a capa</button>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.apply} onClick={apply}>Aplicar e ver na página</button>
            <button type="button" className={styles.copy} onClick={copySelection}>Copiar seleção</button>
            <button type="button" className={styles.textButton} onClick={restore}>Restaurar seleção original</button>
          </div>
          <p role="status" className={styles.notice}>{notice}</p>
          {manualCopy && <textarea ref={copyField} readOnly value={manualCopy} className={styles.copyField} aria-label="Texto da seleção para copiar" />}
        </div>
      </details>
    </>
  )
}
