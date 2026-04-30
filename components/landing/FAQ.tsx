'use client'

import { useState } from 'react'

const faqs = [
  {
    q: 'Funciona com arquivos do SketchUp?',
    a: 'Sim. Você pode enviar um print de tela, exportação de imagem ou foto do modelo diretamente do SketchUp — sem necessidade de plugin ou integração. O SpaceNode também aceita imagens do Revit, ArchiCAD, Blender e qualquer modelador 3D. Se você consegue visualizar na tela, consegue gerar o render.',
  },
  {
    q: 'A IA altera meu projeto? Proporções e geometria são preservadas?',
    a: 'Esse é o nosso diferencial técnico. O Geometry Lock é um controle exclusivo que define o quanto a IA respeita a geometria original. Com 100% de lock, ela transforma apenas a aparência — materiais, iluminação, fotorrealismo — sem alterar proporções, layout ou composição. Você decide o equilíbrio entre fidelidade e criatividade.',
  },
  {
    q: 'Posso usar as imagens geradas em apresentações para clientes?',
    a: 'Sim, todos os direitos são seus. Imagens geradas no SpaceNode podem ser usadas livremente em apresentações, portfólios, redes sociais, sites e entregas ao cliente. Planos Pro e Studio incluem saída em alta resolução (até 4K) para impressão.',
  },
  {
    q: 'O que é um node? Quantos nodes um render consome?',
    a: 'Nodes são a unidade de consumo do SpaceNode. Um render HD consome 4 nodes, um render 2K consome 8 nodes e um render 4K consome 20 nodes. Os nodes renovam mensalmente e não acumulam para o mês seguinte.',
  },
  {
    q: 'Preciso instalar algum programa ou plugin?',
    a: 'Não. O SpaceNode é 100% web — funciona direto no navegador. Nenhuma instalação, nenhuma GPU dedicada, nenhum espaço em disco. Funciona em qualquer computador, tablet ou celular com acesso à internet.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Depende do plano. No plano mensal, você pode cancelar quando quiser — paga apenas o mês em uso e mantém o acesso até o fim do período. No plano anual, o compromisso é de 12 meses, já que o pagamento é feito de forma antecipada. Em ambos os casos, o cancelamento é feito direto no painel, sem burocracia.',
  },
  {
    q: 'Qual a resolução das imagens geradas?',
    a: 'Depende do plano. Starter gera até HD, Pro até 2K (ideal para apresentações e redes sociais) e Studio até 4K, pronto para impressão e materiais de alto impacto.',
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section style={{ padding: '96px 24px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Dúvidas frequentes
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10, color: 'var(--color-text-primary)' }}>
          tudo que você precisa saber.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em', lineHeight: 1.6 }}>
          Perguntas reais de arquitetos e designers de interiores do beta. Respondidas de forma direta.
        </p>
      </div>

      <div style={{ border: '0.5px solid var(--color-border-strong)', borderRadius: 14, overflow: 'hidden' }}>
        {faqs.map((faq, i) => {
          const isOpen = open === i
          return (
            <div key={i} style={{ borderBottom: i < faqs.length - 1 ? '0.5px solid var(--color-border)' : 'none' }}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '20px 24px', cursor: 'pointer', gap: 16,
                  background: isOpen ? 'var(--color-surface)' : 'var(--color-bg-elevated)',
                  border: 'none', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', lineHeight: 1.4 }}>
                  {faq.q}
                </span>
                <span style={{
                  width: 20, height: 20, flexShrink: 0,
                  border: `0.5px solid ${isOpen ? 'transparent' : 'var(--color-border-strong)'}`,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isOpen ? 'var(--color-surface-hover)' : 'transparent',
                  transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s ease, background 0.15s',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
                    <path d="M12 5v14M5 12h14" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </span>
              </button>

              <div style={{
                maxHeight: isOpen ? 300 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)',
              }}>
                <p style={{ padding: '0 24px 22px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7, letterSpacing: '-0.005em' }}>
                  {faq.a}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
