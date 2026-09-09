'use client'

import ForceDarkScope from '@/lib/theme/ForceDarkScope'
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import FinalCTA from '@/components/FinalCTA'
import Footer from '@/components/Footer'
import { Ambient } from '@/components/landing/Ambient'
import { Projects } from '@/components/landing/Projects'
import { Differentiators } from '@/components/landing/Differentiators'
import { ProductMockup } from '@/components/landing/ProductMockup'
import { SketchUpBand } from '@/components/landing/SketchUpBand'
import { PricingToggle } from '@/components/landing/PricingToggle'
import { FAQ } from '@/components/landing/FAQ'
import { MobileCTA } from '@/components/landing/MobileCTA'

export default function Home() {
  return (
    <main className="spn-landing">
      {/* Reforma de 2026-09-09: a landing deixou de ser clara com faixas
          pretas e virou uma superfície escura CONTÍNUA — papel de parede
          borrado atrás, todo o conteúdo em vidro. É a mesma linguagem da v1
          do plugin de SketchUp, e a que o web app vai adotar.

          Sem faixas, o ritmo da página não vem mais da troca de fundo: vem
          do espaçamento entre os cartões e da troca lenta do papel de
          parede conforme se rola. Por isso não há mais <Divider />.

          O script do layout raiz já força dark na rota "/" (anti-flash
          pré-paint); ForceDarkScope cobre a navegação client-side e
          restaura o tema do usuário ao sair. */}
      <ForceDarkScope />
      <Ambient />

      <Navbar />
      <Hero />
      <Projects />
      <Differentiators />
      <ProductMockup />
      <SketchUpBand />
      <PricingToggle />
      <FAQ />
      <FinalCTA />
      <Footer />
      <MobileCTA />

      <style jsx>{`
        .spn-landing {
          position: relative;
          min-height: 100vh;
          background: var(--color-bg);
        }
      `}</style>
    </main>
  )
}
