// /app/theme-qa — página interna de QA visual do sistema de temas.
// Amostras dos principais elementos da UI nos tokens do design system,
// com o seletor de aparência inline para alternar e comparar.
// Não linkada na navegação; acessível direto pela URL.

import ThemeQAClient from './ThemeQAClient'

export const metadata = { title: 'Theme QA · SpaceNode', robots: { index: false, follow: false } }

export default function ThemeQAPage() {
  return <ThemeQAClient />
}
