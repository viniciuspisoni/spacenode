'use client'

import ForceDarkScope from '@/lib/theme/ForceDarkScope'
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import FinalCTA from '@/components/FinalCTA'
import Footer from '@/components/Footer'
import { Ambient } from '@/components/landing/Ambient'
import { Projects } from '@/components/landing/Projects'
import { Differentiators } from '@/components/landing/Differentiators'
import { HowItWorks } from '@/components/landing/HowItWorks'
import LpViewPing from '@/components/marketing/LpViewPing'
import { track } from '@/lib/analytics/client'
import { SketchUpBand } from '@/components/landing/SketchUpBand'
import { PricingToggle } from '@/components/landing/PricingToggle'
import { FAQ } from '@/components/landing/FAQ'
import { MobileCTA } from '@/components/landing/MobileCTA'
import { IdentityLaunchBanner } from '@/components/IdentityLaunchBanner'

export default function Home() {
  return (
    <main className="spn-landing" onClick={event => {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a[href="/login?mode=signup"]')
      if (!link) return
      track('cta_clicked', {
        lp: 'home-presentation-v1',
        cta: link.closest('[data-cta-position]')?.getAttribute('data-cta-position') ?? 'navigation',
      })
    }}>
      <ForceDarkScope />
      <Ambient />

      <Navbar />
      <LpViewPing slug="home-presentation-v1" />
      <Hero />
      <HowItWorks />
      <Projects />
      <Differentiators />
      <PricingToggle />
      <SketchUpBand />
      <FAQ />
      <FinalCTA />
      <IdentityLaunchBanner />
      <Footer />
      <MobileCTA label="Testar no meu projeto grátis" />

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
