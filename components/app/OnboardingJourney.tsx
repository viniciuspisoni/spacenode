'use client'

import { TOUR_START_EVENT } from './WelcomeTour'
import styles from './Onboarding.module.css'

export default function OnboardingJourney() {
  return <section className={styles.journey} aria-label="Seu primeiro projeto">
    <div>
      <span className={styles.eyebrow}>Seu primeiro projeto</span>
      <h2>Vamos tirar a primeira imagem do papel?</h2>
      <p className={styles.description}>Escolha uma referência sua. O guia acompanha cada etapa.</p>
      <ol><li>01 · Escolher a imagem</li><li>02 · Criar e comparar</li><li>03 · Avaliar o resultado</li></ol>
    </div>
    <button type="button" className="spn-cta" onClick={() => window.dispatchEvent(new Event(TOUR_START_EVENT))}>Começar com o guia →</button>
  </section>
}
