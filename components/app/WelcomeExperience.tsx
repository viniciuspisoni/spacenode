'use client'

import { useEffect, useRef, useState } from 'react'
import { ONBOARDING_PATHS, type OnboardingSource } from '@/lib/onboarding'
import { track } from '@/lib/analytics/client'
import OnboardingDemo, { OnboardingVideo } from './OnboardingDemo'
import styles from './Onboarding.module.css'

export default function WelcomeExperience({ open, onDismiss, onStart }: {
  open: boolean
  onDismiss: () => void
  onStart: (source: OnboardingSource) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState<OnboardingSource | null>(null)
  const [step, setStep] = useState(1)
  const path = source ? ONBOARDING_PATHS[source] : null

  const closeDialog = () => {
    dialogRef.current?.querySelectorAll('video').forEach(video => video.pause())
    dialogRef.current?.close()
  }
  const dismiss = () => { closeDialog(); onDismiss() }

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) dialog.showModal()
    if (!open && dialog?.open) {
      dialog.querySelectorAll('video').forEach(video => video.pause())
      dialog.close()
    }
  }, [open])

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="welcome-title" onCancel={event => {
    event.preventDefault()
    dismiss()
  }}>
    <div className={styles.shell}>
      <div className={styles.content}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>Seu projeto, no centro · {step} de 2</span>
          <button type="button" className={styles.close} aria-label="Fechar introdução" onClick={dismiss}>×</button>
        </div>
        <div className={styles.progress} aria-hidden="true"><span data-active="true" /><span data-active={step === 2} /></div>
        <div aria-live="polite">
          <h1 id="welcome-title" className={styles.title}>{step === 1 ? 'O que vamos criar hoje?' : path?.title}</h1>
          <p className={styles.description}>{step === 1
            ? 'Comece por uma imagem do seu projeto. Vamos guiar você até um resultado que possa avaliar e usar.'
            : path?.instruction}</p>
        </div>
        {step === 1 ? <div className={styles.choices} role="group" aria-label="Escolha seu ponto de partida">
          {(Object.entries(ONBOARDING_PATHS) as [OnboardingSource, typeof ONBOARDING_PATHS[OnboardingSource]][]).map(([key, item], index) =>
            <button type="button" key={key} className={styles.choice} aria-pressed={source === key} onClick={() => {
              setSource(key)
              track('cta_clicked', { cta: 'onboarding_source_selected', source: key })
            }}>
              <span className={styles.choiceIndex}>0{index + 1}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span aria-hidden="true">{source === key ? '✓' : '↗'}</span>
            </button>)}
        </div> : <div>
          <p className={styles.eyebrow} style={{ marginBottom: 16 }}>O que ajuda a começar</p>
          <ul className={styles.checklist} key={source}>{path?.checklist.map(item =>
            <li key={item}><label><input type="checkbox" />{item}</label></li>)}</ul>
          <p className={styles.caption}>A lista é uma ajuda. Você pode seguir sem marcar os itens.</p>
        </div>}
        <div className={styles.footer}>
          {step === 1 ? <button type="button" className="spn-cta" disabled={!source} onClick={() => setStep(2)}>Preparar meu projeto →</button>
            : <button type="button" className="spn-cta" onClick={() => { if (source) { closeDialog(); onStart(source) } }}>{path?.action} →</button>}
          <button type="button" className={styles.mutedButton} onClick={step === 1 ? dismiss : () => setStep(1)}>
            {step === 1 ? 'Explorar por conta própria' : 'Voltar'}
          </button>
        </div>
        <p className={styles.caption}>O custo em Nodes aparece antes de cada geração.</p>
      </div>
      <aside className={styles.visual} aria-label="Conheça o caminho até o resultado">
        <span className={styles.eyebrow}>Do modelo à visualização</span>
        <OnboardingDemo />
        <p className={styles.description}>Uma imagem. Uma intenção. Seu primeiro passo para apresentar o projeto.</p>
        <OnboardingVideo />
      </aside>
    </div>
  </dialog>
}
