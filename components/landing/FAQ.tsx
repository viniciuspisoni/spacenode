'use client'

import { useState } from 'react'
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, supportWhatsAppUrl } from '@/lib/support'

const faqLink = { color: 'var(--color-text-primary)', textDecoration: 'underline', textUnderlineOffset: 3 } as const

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: 'O que é a SpaceNode?',
    a: 'Uma plataforma de visualização arquitetônica com IA para arquitetos e designers de interiores. Ela transforma estudos, modelos e imagens base em visualizações fotorrealistas — preservando a intenção do projeto, do estudo ao material de apresentação.',
  },
  {
    q: 'A SpaceNode substitui SketchUp, Revit, Enscape ou Lumion?',
    a: 'Não. Ela complementa o fluxo de trabalho: você continua projetando nas ferramentas que já usa e utiliza a SpaceNode para acelerar visualizações, estudos de atmosfera, variações e imagens de apresentação. É 100% web — sem plugin, sem instalação e sem GPU dedicada.',
  },
  {
    q: 'A IA altera o meu projeto?',
    a: 'A plataforma é construída para preservar geometria, proporções, perspectiva e composição. Como toda ferramenta de IA, o resultado pode pedir ajustes — mas o objetivo é respeitar o projeto original e reduzir reinterpretações indesejadas, não criar uma imagem apenas "parecida".',
  },
  {
    q: 'Posso usar imagens do SketchUp como base?',
    a: 'Sim. Prints de tela, exportações de imagem, estudos volumétricos, fotos e referências funcionam como imagem base — do SketchUp, Revit, ArchiCAD, Blender ou qualquer modelador. Quanto mais clara a imagem de origem, maior o controle sobre o resultado.',
  },
  {
    q: 'O que são Nodes?',
    a: 'Nodes são os créditos de uso da SpaceNode. Cada geração, edição ou ampliação consome nodes conforme o motor e a resolução escolhidos — um render HD parte de 10 nodes; 2K, de 15; 4K, de 25. Os nodes renovam mensalmente e não acumulam para o mês seguinte.',
  },
  {
    q: 'Consigo usar as imagens com clientes?',
    a: 'Sim, os direitos das imagens geradas são seus. Use em apresentações comerciais, portfólio, redes sociais, sites e materiais de apoio ao projeto — incluindo saída em alta resolução (até 4K) para impressão.',
  },
  {
    q: 'Funciona para interiores e exteriores?',
    a: 'Sim. Projetos residenciais, comerciais e corporativos; interiores, fachadas, paisagismo e estudos de materialidade. Se é visualização arquitetônica, é caso de uso da plataforma.',
  },
  {
    q: 'Preciso saber criar prompts avançados?',
    a: 'Não. A interface orienta com escolhas de arquitetura — tipo de ambiente, iluminação, câmera, atmosfera e nível de fidelidade. O objetivo é eliminar a dependência de prompts longos e genéricos.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'No plano mensal, sim — você paga apenas o mês em uso e mantém o acesso até o fim do período. No plano anual, o compromisso é de 12 meses, já que o pagamento é antecipado. Em ambos os casos, tudo é feito direto no painel, sem burocracia.',
  },
  {
    q: 'A SpaceNode é indicada para escritórios?',
    a: 'Sim. Os planos Studio e Office foram desenhados para equipes com volume: mais nodes por mês, Lumens avulsos para picos de demanda e suporte prioritário — velocidade e consistência visual em todas as etapas do projeto.',
  },
  {
    q: 'Como falo com o suporte?',
    a: (
      <>
        Pelo WhatsApp{' '}
        <a
          href={supportWhatsAppUrl('Olá! Vim do site da SpaceNode e tenho uma dúvida.')}
          target="_blank"
          rel="noopener noreferrer"
          style={faqLink}
        >
          {SUPPORT_PHONE_DISPLAY}
        </a>
        {' '}ou pelo e-mail{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={faqLink}>{SUPPORT_EMAIL}</a>
        {' '}— atendimento em português.
      </>
    ),
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="spn-faq">

      <div className="spn-faq-head">
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Dúvidas frequentes
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-faq-title">
          perguntas de quem projeta.
        </h2>
        <p className="spn-faq-sub">
          As dúvidas reais de arquitetos e designers antes de assinar — respondidas de forma direta.
        </p>
      </div>

      <div style={{ border: '0.5px solid var(--color-border-strong)', borderRadius: 14, overflow: 'hidden' }}>
        {faqs.map((faq, i) => {
          const isOpen = open === i
          return (
            <div key={i} style={{ borderBottom: i < faqs.length - 1 ? '0.5px solid var(--color-border)' : 'none' }}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="spn-faq-q"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', gap: 16,
                  background: isOpen ? 'var(--color-surface)' : 'var(--color-bg-elevated)',
                  border: 'none', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <span className="spn-faq-q-text">
                  {faq.q}
                </span>
                <span style={{
                  width: 22, height: 22, flexShrink: 0,
                  border: `0.5px solid ${isOpen ? 'transparent' : 'var(--color-border-strong)'}`,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isOpen ? 'var(--color-surface-hover)' : 'transparent',
                  transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s ease, background 0.15s',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" width="11" height="11">
                    <path d="M12 5v14M5 12h14" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </span>
              </button>

              <div style={{
                maxHeight: isOpen ? 400 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)',
              }}>
                <p className="spn-faq-a">
                  {faq.a}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        .spn-faq {
          padding: 96px 24px;
          max-width: 960px;
          margin: 0 auto;
        }
        .spn-faq-head {
          text-align: center;
          margin-bottom: 56px;
        }
        .spn-faq-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-faq-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0;
        }
        .spn-faq-q {
          padding: 20px 24px;
          min-height: 64px;
        }
        .spn-faq-q-text {
          font-size: 13.5px;
          font-weight: 500;
          color: var(--color-text-primary);
          letter-spacing: -0.01em;
          line-height: 1.4;
        }
        .spn-faq-a {
          padding: 0 24px 22px;
          font-size: 13.5px;
          color: var(--color-text-secondary);
          line-height: 1.65;
          letter-spacing: -0.005em;
          margin: 0;
        }

        @media (max-width: 768px) {
          .spn-faq {
            padding: 72px 20px;
          }
          .spn-faq-head {
            margin-bottom: 32px;
          }
          .spn-faq-title { font-size: 24px; }
          .spn-faq-sub  { font-size: 13px; }
          .spn-faq-q {
            padding: 18px 18px;
          }
          .spn-faq-q-text { font-size: 14px; }
          .spn-faq-a {
            padding: 0 18px 20px;
            font-size: 13.5px;
            line-height: 1.6;
          }
        }
      `}</style>
    </section>
  )
}
