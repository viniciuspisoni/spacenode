'use client'

import { useState } from 'react'
import { track } from '@/lib/analytics/client'
import styles from './Onboarding.module.css'

export function OnboardingVideo({ clip = 'first-image' }: { clip?: 'first-image' | 'review-result' }) {
  const [open, setOpen] = useState(false)
  return <div>
    <button type="button" className={styles.videoToggle} aria-expanded={open} onClick={() => {
      setOpen(!open)
      if (!open) track('cta_clicked', { cta: 'onboarding_video_opened', clip })
    }}>{open ? 'Fechar vídeo' : `▷ Ver o caminho em ${clip === 'first-image' ? '18' : '14'} segundos`}</button>
    {open && <div style={{ marginTop: 12 }}>
      <video className={styles.video} controls playsInline preload="none" poster="/demo-render.jpg"
        onPlay={() => track('cta_clicked', { cta: 'onboarding_video_played', clip })}
        onEnded={() => track('cta_clicked', { cta: 'onboarding_video_completed', clip })}>
        <source src={`/onboarding/${clip}.mp4`} type="video/mp4" />
        <track kind="captions" src={`/onboarding/${clip}.vtt`} srcLang="pt-BR" label="Português" />
        Seu navegador não suporta este vídeo.
      </video>
      <p className={styles.caption}>Guia visual legendado, sem áudio. As imagens são um exemplo da SpaceNode.</p>
    </div>}
  </div>
}

export default function OnboardingDemo() {
  const [position, setPosition] = useState(50)
  return <div>
    <div className={styles.demo}>
      {/* Existing first-party demonstration pair, never presented as the user's output. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/demo-render.jpg" alt="Exemplo de visualização de uma casa em concreto e vidro" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/demo-sketch.jpg" alt="Vista do modelo usada como referência no exemplo" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} />
      <div className={styles.handle} style={{ left: `${position}%` }}><span>↔</span></div>
    </div>
    <input className={styles.range} type="range" min="0" max="100" value={position}
      aria-label="Comparar modelo e visualização do exemplo" aria-valuetext={`${position}% do modelo visível`}
      onChange={event => setPosition(Number(event.target.value))}
      onPointerUp={() => track('cta_clicked', { cta: 'onboarding_demo_compared' })} />
    <div className={styles.labels}><span>MODELO</span><span>VISUALIZAÇÃO</span></div>
    <p className={styles.caption}>Arraste para comparar. Este é um exemplo; o seu resultado depende da imagem e das escolhas de geração.</p>
  </div>
}
