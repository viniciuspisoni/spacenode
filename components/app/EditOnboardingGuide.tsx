'use client'

import { useState } from 'react'
import styles from './Onboarding.module.css'

/** Shared introduction across the current and legacy editors. */
export default function EditOnboardingGuide() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return <section className={`spn-glass ${styles.editGuide}`} aria-label="Guia do primeiro ajuste">
    <div className={styles.head}>
      <strong style={{ fontSize: 13 }}>Uma mudança por vez. Seu projeto como referência.</strong>
      <button type="button" className={styles.close} aria-label="Fechar guia do ajuste" onClick={() => setOpen(false)}>×</button>
    </div>
    <p>01 · Abra sua imagem. 02 · Escolha o detalhe e descreva a mudança. 03 · Confira o custo em Nodes, gere e compare o resultado com o original.</p>
  </section>
}
