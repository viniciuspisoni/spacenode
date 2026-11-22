'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import styles from './EditorialTools.module.css'

const finishes = [
  { name: 'Areia', image: '/gallery-living-after.jpg', swatch: '#c5b39a' },
  { name: 'Azul-cobalto', image: '/landing-editorial/sofa-cobalto.webp', swatch: '#274678' },
] as const

export function EditorialTools() {
  const [selected, setSelected] = useState(0)
  const finish = finishes[selected]

  return (
    <section id="produto" aria-labelledby="editorial-tools-title" className={styles.section}>
      <div className={styles.heading}>
        <h2 id="editorial-tools-title">O que dá para fazer</h2>
        <p>Edite um acabamento, explore a luz da cena ou transforme um render em vídeo para apresentar ao cliente.</p>
      </div>

      <div className={styles.examples}>
        <figure>
          <div className={styles.media}>
            <Image
              src={finish.image}
              alt={`Sala de estar com painel terracota e sofá da esquerda em ${finish.name.toLocaleLowerCase('pt-BR')}`}
              fill
              sizes="(max-width: 760px) 90vw, (max-width: 1340px) 44vw, 590px"
            />
          </div>
          <figcaption className={styles.caption}>
            <h3>Teste outro acabamento</h3>
            <p>Troque a cor do sofá da esquerda e compare as duas versões da sala.</p>
            <div role="group" aria-label="Cor do sofá no exemplo de edição" className={styles.swatches}>
              {finishes.map((option, index) => (
                <button
                  key={option.name}
                  type="button"
                  aria-pressed={selected === index}
                  onClick={() => setSelected(index)}
                >
                  <span aria-hidden="true" style={{ backgroundColor: option.swatch }} />
                  {option.name}
                </button>
              ))}
            </div>
          </figcaption>
        </figure>

        <figure>
          <div className={styles.media}>
            <video
              controls
              playsInline
              preload="none"
              poster="/demo-render.jpg"
              aria-label="Demonstração de um minuto. Como preparar uma fachada com luz de fim de tarde na SpaceNode."
            >
              <source src="/onboarding/first-image.mp4" type="video/mp4" />
              <track kind="captions" src="/onboarding/first-image.vtt" srcLang="pt-BR" label="Português" />
              <a href="/onboarding/first-image.mp4">Abrir o vídeo da demonstração</a>
            </video>
          </div>
          <figcaption className={styles.caption}>
            <h3>Escolha a luz da cena</h3>
            <p>Em um minuto, acompanhe na plataforma como preparar uma fachada de concreto e vidro com luz de fim de tarde.</p>
          </figcaption>
        </figure>
      </div>

      <p id="sketchup" className={styles.plugin}>
        Trabalha no SketchUp? Capture a vista direto do modelo com o{' '}
        <Link href="/sketchup">plugin da SpaceNode</Link>.
      </p>
    </section>
  )
}
