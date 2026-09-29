import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Brandmark } from '@/components/brand/Brandmark'
import { StructuralN } from '@/components/brand/StructuralN'
import renderImg from '@/public/demo-render.jpg'
import styles from './identidade.module.css'

export const metadata: Metadata = {
  title: 'Nova identidade visual | SpaceNode',
  description: 'Conheça a nova identidade visual da SpaceNode: o N estrutural, a tipografia Geist e as cores da nossa sede na comunicação.',
  openGraph: {
    title: 'Nova identidade visual | SpaceNode',
    description: 'Arquitetura em primeiro plano. Conheça a nova identidade da SpaceNode.',
  },
}

export default function IdentidadePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="SpaceNode, voltar ao início"><Brandmark size={34} tone="primary" /></Link>
        <Link href="/login?mode=signup" className={styles.headerCta}>Testar grátis <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={styles.hero} aria-labelledby="identity-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Uma nova identidade visual</p>
          <h1 id="identity-title">Arquitetura em<br />primeiro plano.</h1>
          <p>O jeito de apresentar a SpaceNode evoluiu. A precisão do projeto, a clareza da interface e a autoria de quem cria seguem no centro.</p>
          <Link href="#sistema" className={styles.heroLink}>Conheça o sistema <span aria-hidden="true">↓</span></Link>
        </div>
        <div className={styles.heroMark} aria-hidden="true"><StructuralN size={260} /></div>
      </section>

      <figure className={styles.photo}>
        <Image src={renderImg} alt="Residência de concreto e vidro ao entardecer, visualizada com a SpaceNode" sizes="(max-width: 800px) 100vw, 1152px" priority />
        <figcaption>O projeto conduz a imagem. A identidade organiza a leitura.</figcaption>
      </figure>

      <section id="sistema" className={styles.system} aria-labelledby="system-title">
        <div>
          <p className={styles.eyebrow}>01 / O símbolo</p>
          <h2 id="system-title">Dois apoios.<br />Uma ligação.</h2>
          <p>O N estrutural expressa construção e conexão. O desenho mantém o mesmo contorno em todos os tamanhos, do aplicativo às peças de comunicação.</p>
        </div>
        <div className={styles.systemMark} aria-hidden="true"><StructuralN size={224} color="#FFFFFF" /></div>
      </section>

      <section className={styles.palette} aria-labelledby="palette-title">
        <div className={styles.paletteIntro}>
          <p className={styles.eyebrow}>02 / A paleta</p>
          <h2 id="palette-title">Da sede para o digital.</h2>
          <p>Tons suaves do nosso espaço se encontram com o azul que já aparece nos destaques do Instagram. A assinatura continua preta ou branca.</p>
        </div>
        <div className={styles.swatches}>
          <div className={styles.siteOne}><span>Sede / 01</span><small>#BAC3C6</small></div>
          <div className={styles.siteTwo}><span>Sede / 02</span><small>#A3AEB0</small></div>
          <div className={styles.highlight}><span>Destaques</span><small>#4D6685</small></div>
        </div>
      </section>

      <section className={styles.close} aria-labelledby="close-title">
        <p className={styles.eyebrow}>Seu projeto. Sua direção.</p>
        <h2 id="close-title">Visualize seus projetos.</h2>
        <p>Renderize, explore e apresente projetos de arquitetura e interiores em um só lugar.</p>
        <Link href="/login?mode=signup" className={styles.closeCta}>Testar grátis <span aria-hidden="true">↗</span></Link>
        <Link href="/" className={styles.homeLink}>Voltar ao site</Link>
      </section>
    </main>
  )
}
