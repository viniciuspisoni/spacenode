"use client";

import ForceLightScope from "@/lib/theme/ForceLightScope";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Demo from "@/components/Demo";
import HowItWorks from "@/components/HowItWorks";
import Gallery from "@/components/Gallery";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import { ProductMockup } from "@/components/landing/ProductMockup";
import { Differentiators } from "@/components/landing/Differentiators";
import { ForWho } from "@/components/landing/ForWho";
import { FAQ } from "@/components/landing/FAQ";
import { PricingToggle } from "@/components/landing/PricingToggle";
import { MobileCTA } from "@/components/landing/MobileCTA";

const Divider = () => (
  <hr style={{ border: 'none', borderTop: '0.5px solid var(--color-border)', maxWidth: 960, margin: '0 auto', width: 'calc(100% - 40px)' }} />
)

export default function Home() {
  return (
    <main>
      {/* Landing é sempre light (#fafafa predominante); as faixas pretas
          (#1a1a1a, via .spn-dark) são intencionais: header/hero, produto/
          interface, projetos reais e o fecho CTA final + footer. O script do
          layout raiz já força light na rota "/" (anti-flash pré-paint);
          ForceLightScope cobre a navegação client-side e restaura o tema do
          usuário ao sair. */}
      <ForceLightScope />
      <Navbar />
      <div className="spn-dark">
        <Hero />
      </div>
      <Demo />
      <Divider />
      <Differentiators />
      <div className="spn-dark">
        <ProductMockup />
        <Gallery />
      </div>
      <HowItWorks />
      <Divider />
      <ForWho />
      <Divider />
      <PricingToggle />
      <Divider />
      <FAQ />
      {/* Fecho preto: a própria troca de faixa separa do FAQ — sem divider. */}
      <div className="spn-dark">
        <FinalCTA />
        <Footer />
      </div>
      <MobileCTA />
    </main>
  );
}
