"use client";

import ForceDarkScope from "@/lib/theme/ForceDarkScope";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Gallery from "@/components/Gallery";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import { ProductMockup } from "@/components/landing/ProductMockup";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { FAQ } from "@/components/landing/FAQ";
import { PricingToggle } from "@/components/landing/PricingToggle";
import { PlatformModules } from "@/components/landing/PlatformModules";
import { MobileCTA } from "@/components/landing/MobileCTA";
import { LaunchOfferBanner } from "@/components/launch/LaunchOfferBanner";

const Divider = () => (
  <hr style={{ border: 'none', borderTop: '0.5px solid rgba(255,255,255,0.06)', maxWidth: 960, margin: '0 auto', width: 'calc(100% - 40px)' }} />
)

export default function Home() {
  return (
    <main>
      {/* Landing é sempre dark. O script do layout raiz já ignora a preferência
          light na rota "/" (anti-flash pré-paint); ForceDarkScope cobre a
          navegação client-side e restaura o tema do usuário ao sair. */}
      {/* Ordem de conversão (2026-08-13): prova visual primeiro — o hero traz
          o comparador modelo→render e a galeria vem logo em seguida; as seções
          de texto redundantes (ValueProps/ProblemSolution/ForWho) saíram e o
          antigo Demo foi absorvido pelo comparador do hero. */}
      <ForceDarkScope />
      <LaunchOfferBanner />
      <Navbar />
      <Hero />
      <Divider />
      <Gallery />
      <Divider />
      <HowItWorks />
      <Divider />
      <ProductMockup />
      <Divider />
      <PlatformModules />
      <Divider />
      <ComparisonTable />
      <Divider />
      <PricingToggle />
      <Divider />
      <FAQ />
      <Divider />
      <FinalCTA />
      <Footer />
      <MobileCTA />
    </main>
  );
}
