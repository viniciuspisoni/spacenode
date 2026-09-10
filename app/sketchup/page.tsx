import type { Metadata } from 'next'
import { SketchUpLanding } from '@/components/sketchup/SketchUpLanding'

// Casca server-side da página do plugin: só a metadata mora aqui. O
// conteúdo é Client Component porque usa styled-jsx e o papel de parede
// (Ambient) — ver components/sketchup/SketchUpLanding.tsx.

export const metadata: Metadata = {
  title: 'SPACENODE para SketchUp',
  description:
    'Renderize suas vistas do SketchUp com o motor de fidelidade da SPACENODE — sem sair do modelo. Extensão oficial para SketchUp 2021 ou superior.',
}

export default function SketchUpPage() {
  return <SketchUpLanding />
}
