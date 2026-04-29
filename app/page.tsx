"use client";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Demo from "@/components/Demo";
import HowItWorks from "@/components/HowItWorks";
import Gallery from "@/components/Gallery";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import { ProductMockup } from "@/components/landing/ProductMockup";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { FAQ } from "@/components/landing/FAQ";
import { PricingToggle } from "@/components/landing/PricingToggle";
import { PlatformModules } from "@/components/landing/PlatformModules";
import { ValueProps } from "@/components/landing/ValueProps";
import { SocialProof } from "@/components/landing/SocialProof";
import { MobileCTA } from "@/components/landing/MobileCTA";

const Divider = () => (
  <hr style={{ border: 'none', borderTop: '0.5px solid rgba(255,255,255,0.06)', maxWidth: 960, margin: '0 auto' }} />
)

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <ValueProps />
      <Divider />
      <Demo />
      <Divider />
      <PlatformModules />
      <Divider />
      <HowItWorks />
      <Divider />
      <ProductMockup />
      <Divider />
      <SocialProof />
      <Divider />
      <ComparisonTable />
      <Divider />
      <Gallery />
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
