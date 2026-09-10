'use client'

import { useState } from 'react'
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, supportWhatsAppUrl } from '@/lib/support'
import { NODES_GRACE_DAYS, NODES_ROLLOVER_COPY } from '@/lib/billing/nodes'

const faqLink = { color: 'var(--color-text-primary)', textDecoration: 'underline', textUnderlineOffset: 3 } as const

// Quatro objeções — as que de fato travam a assinatura. Saíram na reforma
// de vidro (2026-09-09): "o que é a SpaceNode" (a página inteira responde),
// "posso cancelar" (agora está na própria seção de planos) e "como falo com
// o suporte", que virou a linha de contato logo abaixo da lista.
const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: 'A IA altera o meu projeto?',
    a: 'A plataforma é construída para preservar geometria, proporções, perspectiva e composição. Como toda ferramenta de IA, o resultado pode pedir ajustes — mas o objetivo é respeitar o projeto original, não criar uma imagem apenas "parecida".',
  },
  {
    q: 'Funciona com o que eu já uso?',
    a: 'Sim. Prints de tela, exportações, estudos volumétricos e referências funcionam como imagem base — do SketchUp, Revit, ArchiCAD, Blender ou qualquer modelador. Roda no navegador, sem instalação e sem GPU dedicada. Para SketchUp existe também o plugin oficial, que captura a vista direto do modelo.',
  },
  {
    q: 'O que são Nodes?',
    a: `São os créditos de uso. Cada geração, edição ou ampliação consome nodes conforme o motor e a resolução — um render HD parte de 10 nodes; 2K, de 15; 4K, de 25. ${NODES_ROLLOVER_COPY} O que sobrar de um mês soma com os nodes do mês seguinte, e se você cancelar o saldo continua disponível por ${NODES_GRACE_DAYS} dias. Os Nodes extras, comprados avulsos, não expiram — e o consumo usa primeiro os mensais.`,
  },
  {
    q: 'Consigo usar as imagens com clientes?',
    a: 'Sim, os direitos das imagens geradas são seus. Use em apresentações comerciais, portfólio, redes sociais e materiais de projeto — incluindo saída em alta resolução (até 4K) para impressão.',
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="spn-faq">
      <h2 className="spn-faq-title">perguntas de quem projeta.</h2>

      <div className="spn-faq-list spn-glass">
        {faqs.map((faq, i) => {
          const isOpen = open === i
          return (
            <div key={i} className="spn-faq-item" data-last={i === faqs.length - 1}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="spn-faq-q"
                aria-expanded={isOpen}
              >
                <span className="spn-faq-q-text">{faq.q}</span>
                <span className="spn-faq-icon" data-open={isOpen}>
                  <svg viewBox="0 0 24 24" fill="none" width="11" height="11" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              </button>

              <div className="spn-faq-panel" data-open={isOpen}>
                <p className="spn-faq-a">{faq.a}</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="spn-faq-support">
        Ficou outra dúvida? Fale com a gente no WhatsApp{' '}
        <a
          href={supportWhatsAppUrl('Olá! Vim do site da SpaceNode e tenho uma dúvida.')}
          target="_blank"
          rel="noopener noreferrer"
          style={faqLink}
        >
          {SUPPORT_PHONE_DISPLAY}
        </a>
        {' '}ou por e-mail{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={faqLink}>{SUPPORT_EMAIL}</a>.
      </p>

      <style jsx>{`
        .spn-faq {
          position: relative;
          z-index: 1;
          padding: 0 24px 96px;
          max-width: 780px;
          margin: 0 auto;
        }
        .spn-faq-title {
          text-align: center;
          font-size: clamp(22px, 3.6vw, 30px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0 0 28px;
          color: var(--color-text-primary);
        }
        .spn-faq-list {
          border-radius: var(--r-card);
          overflow: hidden;
        }
        .spn-faq-item[data-last='false'] {
          border-bottom: 0.5px solid var(--glass-line);
        }
        .spn-faq-q {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 24px;
          background: none;
          border: none;
          text-align: left;
          cursor: pointer;
          color: inherit;
          transition: background 150ms var(--ease);
        }
        .spn-faq-q:hover { background: var(--color-surface-subtle); }
        .spn-faq-q:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: -3px;
        }
        .spn-faq-q-text {
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: var(--color-text-primary);
        }
        .spn-faq-icon {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-secondary);
          border: 0.5px solid var(--glass-line-strong);
          transition: transform 250ms var(--ease), background 150ms var(--ease);
        }
        .spn-faq-icon[data-open='true'] {
          transform: rotate(45deg);
          background: var(--color-surface-hover);
          border-color: transparent;
        }
        .spn-faq-panel {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 350ms var(--ease);
        }
        .spn-faq-panel[data-open='true'] { grid-template-rows: 1fr; }
        .spn-faq-a {
          overflow: hidden;
          margin: 0;
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--color-text-secondary);
          padding: 0 24px;
        }
        .spn-faq-panel[data-open='true'] .spn-faq-a { padding-bottom: 22px; }
        .spn-faq-support {
          text-align: center;
          font-size: 13px;
          color: var(--color-text-tertiary);
          line-height: 1.6;
          margin: 22px 0 0;
        }

        @media (max-width: 768px) {
          .spn-faq { padding: 0 16px 64px; }
          .spn-faq-title { margin-bottom: 20px; }
          .spn-faq-q { padding: 18px 18px; }
          .spn-faq-q-text { font-size: 14px; }
          .spn-faq-a { padding: 0 18px; font-size: 13px; }
          .spn-faq-panel[data-open='true'] .spn-faq-a { padding-bottom: 18px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-faq-panel, .spn-faq-icon, .spn-faq-q { transition: none; }
        }
      `}</style>
    </section>
  )
}
