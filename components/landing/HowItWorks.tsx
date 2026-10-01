'use client'

const STEPS = [
  { title: 'Envie um print do seu projeto', text: 'Use uma vista do SketchUp que mostre o ambiente que você quer apresentar. O primeiro teste funciona no navegador, sem instalar o plugin.' },
  { title: 'Escolha como quer mostrar o ambiente', text: 'Defina luz, estilo e materiais pelas opções da plataforma. Você não precisa escrever um comando para a IA.' },
  { title: 'Compare antes de apresentar', text: 'Confira o resultado com a imagem original, ajuste o que precisar e baixe a imagem para sua apresentação.' },
]

export function HowItWorks() {
  return (
    <section id="produto" className="spn-how" data-cta-position="section">
      <h2>Do print à apresentação, em três passos.</h2>
      <p className="spn-how-sub">Comece com um projeto real e veja se o resultado serve para o seu trabalho.</p>
      <ol>
        {STEPS.map((step, index) => (
          <li className="spn-glass" key={step.title}>
            <span className="spn-how-number" aria-hidden="true">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <style jsx>{`
        .spn-how { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; padding: 0 24px 64px; scroll-margin-top: 100px; }
        h2 { text-align: center; font-size: clamp(26px, 3vw, 38px); font-weight: 500; letter-spacing: -.025em; line-height: 1.2; color: var(--color-text-primary); margin: 0 0 12px; text-wrap: balance; }
        .spn-how-sub { text-align: center; color: var(--color-text-secondary); font-size: 15px; line-height: 1.6; margin: 0 auto 24px; max-width: 560px; }
        ol { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; list-style: none; padding: 0; margin: 0; }
        li { padding: 24px; border-radius: var(--r-card); }
        .spn-how-number { font-size: 12px; color: var(--color-text-tertiary); }
        h3 { font-size: 17px; font-weight: 500; line-height: 1.35; color: var(--color-text-primary); margin: 12px 0 10px; }
        li p { font-size: 15px; line-height: 1.6; color: var(--color-text-secondary); margin: 0; }
        @media (max-width: 768px) { .spn-how { padding: 0 16px 48px; } ol { grid-template-columns: 1fr; } li { padding: 20px; } }
      `}</style>
    </section>
  )
}
