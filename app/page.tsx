"use client";

import ForceDarkScope from "@/lib/theme/ForceDarkScope";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Demo from "@/components/Demo";
import HowItWorks from "@/components/HowItWorks";
import Gallery from "@/components/Gallery";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import { ProductMockup } from "@/components/landing/ProductMockup";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { ForWho } from "@/components/landing/ForWho";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { FAQ } from "@/components/landing/FAQ";
import { PricingToggle } from "@/components/landing/PricingToggle";
import { PlatformModules } from "@/components/landing/PlatformModules";
import { ValueProps } from "@/components/landing/ValueProps";
import { MobileCTA } from "@/components/landing/MobileCTA";

const Divider = () => (
  <hr style={{ border: 'none', borderTop: '0.5px solid rgba(255,255,255,0.06)', maxWidth: 960, margin: '0 auto', width: 'calc(100% - 40px)' }} />
)

export default function Home() {
  return (
    <main>
      {/* Landing é sempre dark. O script do layout raiz já ignora a preferência
          light na rota "/" (anti-flash pré-paint); ForceDarkScope cobre a
          navegação client-side e restaura o tema do usuário ao sair. */}
      <ForceDarkScope />
      <Navbar />
      <Hero />
      <ValueProps />
      <Divider />
      <ProductMockup />
      <Divider />
      <ProblemSolution />
      <Divider />
      <HowItWorks />
      <Divider />
      <PlatformModules />
      <Divider />
      <Demo />
      <Gallery />
      <Divider />
      <ForWho />
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
