'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import styles from './AiTechnologyCarousel.module.css'

const TECHNOLOGIES = [
  {
    id: 'google',
    name: 'Google',
    models: 'Gemini · Veo',
    logo: '/brand/ai/google-gemini.svg',
    category: 'Imagem, análise e vídeo',
    description: 'Gemini participa da criação, edição e análise das imagens do seu projeto. Veo transforma imagens em vídeos para explorar os ambientes em movimento.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: 'GPT Image',
    logo: '/brand/ai/openai.svg',
    category: 'Criação de imagens',
    description: 'A tecnologia de imagem da OpenAI está integrada ao motor Orion para gerar novas visualizações a partir do seu projeto.',
  },
  {
    id: 'byteplus',
    name: 'BytePlus',
    models: 'Seedream · ByteDance',
    logo: '/brand/ai/byteplus.svg',
    category: 'Criação e edição de imagens',
    description: 'Seedream, da ByteDance, participa da renderização com o motor Quasar e da edição de imagens. Sua integração reúne esses recursos dentro do fluxo da SpaceNode.',
  },
  {
    id: 'kling',
    name: 'Kling AI',
    models: 'Kling',
    logo: '/brand/ai/kling.svg',
    category: 'Vídeos do seu projeto',
    description: 'Kling dá movimento às imagens dos seus ambientes no recurso Animar, com opções para criar vídeos a partir de uma imagem do projeto.',
  },
  {
    id: 'topaz',
    name: 'Topaz Labs',
    models: 'Topaz',
    logo: '/brand/ai/topaz.svg',
    category: 'Ampliação e recuperação',
    description: 'Topaz participa da ampliação e recuperação das imagens. Você escolhe a finalidade, e a SpaceNode cuida da tecnologia usada para processar o arquivo.',
  },
  {
    id: 'tripo',
    name: 'Tripo',
    models: 'Tripo 3D',
    logo: '/brand/ai/tripo.svg',
    category: 'Criação de blocos 3D',
    description: 'Tripo transforma imagens de objetos em modelos tridimensionais no recurso Blocos 3D, para ajudar a compor suas cenas.',
  },
  {
    id: 'hyper3d',
    name: 'Hyper3D',
    models: 'Rodin',
    logo: '/brand/ai/hyper3d.png',
    category: 'Criação de blocos 3D',
    description: 'Rodin, da Hyper3D, participa da criação de blocos tridimensionais a partir de referências, na opção de alta qualidade do Blocos 3D.',
  },
  {
    id: 'meshy',
    name: 'Meshy',
    models: 'Meshy 3D',
    logo: '/brand/ai/meshy.svg',
    category: 'Criação de blocos 3D',
    description: 'Meshy está integrado à opção Premium do Blocos 3D, com geração a partir de imagens e formatos de arquivo para continuar o trabalho em outras ferramentas.',
  },
] as const

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={direction === 'left' ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AiTechnologyCarousel() {
  const id = useId()
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLUListElement>(null)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const [allowFocusedPlayback, setAllowFocusedPlayback] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const selected = TECHNOLOGIES[selectedIndex]

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReducedMotion(query.matches)
    const updateVisibility = () => setDocumentVisible(document.visibilityState === 'visible')
    updateMotion()
    updateVisibility()
    query.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)

    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.15 })
    if (sectionRef.current) observer.observe(sectionRef.current)

    return () => {
      query.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!isPlaying || reducedMotion || !isVisible || !documentVisible || isHovered || (hasFocus && !allowFocusedPlayback)) return

    // Rotation reveals the logos only; it never changes the description or focus.
    const timer = window.setInterval(() => {
      const track = trackRef.current
      if (!track) return
      const lastPosition = track.scrollWidth - track.clientWidth
      if (lastPosition <= 1) return
      const firstCard = track.firstElementChild as HTMLElement | null
      const step = (firstCard?.offsetWidth ?? 180) + 12
      const left = track.scrollLeft >= lastPosition - 8 ? 0 : Math.min(track.scrollLeft + step, lastPosition)
      track.scrollTo({ left, behavior: 'smooth' })
    }, 6000)
    return () => window.clearInterval(timer)
  }, [isPlaying, reducedMotion, isVisible, documentVisible, isHovered, hasFocus, allowFocusedPlayback])

  function reveal(index: number) {
    const track = trackRef.current
    const card = buttonRefs.current[index]?.parentElement
    if (!track || !card) return
    const trackBounds = track.getBoundingClientRect()
    const cardBounds = card.getBoundingClientRect()
    if (cardBounds.left < trackBounds.left || cardBounds.right > trackBounds.right) {
      const left = track.scrollLeft + cardBounds.left - trackBounds.left - (track.clientWidth - cardBounds.width) / 2
      track.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' })
    }
  }

  function select(index: number, focus = false) {
    const next = (index + TECHNOLOGIES.length) % TECHNOLOGIES.length
    setIsPlaying(false)
    setSelectedIndex(next)
    setAnnouncement(`${TECHNOLOGIES[next].name}. ${TECHNOLOGIES[next].description}`)
    if (focus) buttonRefs.current[next]?.focus({ preventScroll: true })
    reveal(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowRight') next = index + 1
    else if (event.key === 'ArrowLeft') next = index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TECHNOLOGIES.length - 1
    else return
    event.preventDefault()
    select(next, true)
  }

  return (
    <section
      id="tecnologias"
      ref={sectionRef}
      className={styles.section}
      aria-labelledby={`${id}-title`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => {
        setHasFocus(true)
        setAllowFocusedPlayback(false)
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false)
      }}
    >
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Tecnologias integradas à SpaceNode</p>
        <h2 id={`${id}-title`} className={styles.title}>
          Seu projeto em primeiro lugar.
          <span>A escolha da IA por nossa conta.</span>
        </h2>
        <p className={styles.intro}>
          Você escolhe o que quer fazer. A SpaceNode cuida da tecnologia por trás, com modelos de referência para criar, editar, ampliar e dar movimento aos seus projetos.
        </p>
      </div>

      <div className={styles.toolbar}>
        <p id={`${id}-hint`} className={styles.hint}>Conheça a tecnologia por trás de cada recurso.</p>
        <div className={styles.controls}>
          {!reducedMotion && (
            <button type="button" className={styles.playButton} onClick={() => {
              setAllowFocusedPlayback(!isPlaying)
              setIsPlaying(value => !value)
            }} aria-label={isPlaying ? 'Pausar movimento do carrossel' : 'Ativar movimento do carrossel'} aria-controls={`${id}-logos`}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                {isPlaying ? <path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /> : <path d="M5 3.5l7 4.5-7 4.5v-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />}
              </svg>
              <span>{isPlaying ? 'Pausar' : 'Reproduzir'}</span>
            </button>
          )}
          <button type="button" className={styles.arrowButton} onClick={() => select(selectedIndex - 1)} aria-label="Conhecer a tecnologia anterior" aria-controls={`${id}-logos`}><Arrow direction="left" /></button>
          <button type="button" className={styles.arrowButton} onClick={() => select(selectedIndex + 1)} aria-label="Conhecer a próxima tecnologia" aria-controls={`${id}-logos`}><Arrow direction="right" /></button>
        </div>
      </div>

      <ul
        id={`${id}-logos`}
        ref={trackRef}
        className={styles.track}
        aria-label="Tecnologias integradas"
        aria-describedby={`${id}-hint`}
        onPointerDown={() => setIsPlaying(false)}
        onWheel={() => setIsPlaying(false)}
      >
        {TECHNOLOGIES.map((technology, index) => (
          <li key={technology.id} className={styles.card}>
            <button
              ref={element => { buttonRefs.current[index] = element }}
              type="button"
              className={styles.brandButton}
              aria-pressed={selectedIndex === index}
              aria-controls={`${id}-detail`}
              onClick={() => select(index)}
              onKeyDown={event => handleKeyDown(event, index)}
              onFocus={() => reveal(index)}
            >
              <span className={styles.logoSlot} data-surface={technology.id === 'openai' ? 'light' : undefined}>
                {/* Brand assets stay unmodified, including their approved colors. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.logo} src={technology.logo} alt="" width="124" height="36" loading="lazy" draggable="false" />
              </span>
              <span className={styles.brandName}>{technology.name}</span>
              <span className={styles.models}>{technology.models}</span>
              <span className={styles.selection} aria-hidden="true">{selectedIndex === index ? 'Em destaque' : 'Conhecer'}</span>
            </button>
          </li>
        ))}
      </ul>

      <div id={`${id}-detail`} className={styles.detail} role="region" aria-labelledby={`${id}-detail-title`}>
        <div className={styles.detailLabel}>
          <span className={styles.counter} aria-hidden="true">{String(selectedIndex + 1).padStart(2, '0')} / {String(TECHNOLOGIES.length).padStart(2, '0')}</span>
          <h3 id={`${id}-detail-title`}>{selected.name}</h3>
          <p>{selected.category}</p>
        </div>
        <p className={styles.description}>{selected.description}</p>
      </div>
      <p className={styles.note}>As tecnologias participam de recursos diferentes da plataforma.</p>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  )
}
