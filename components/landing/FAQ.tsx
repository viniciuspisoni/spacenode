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
    q: 'O que é um crédito? Um render sempre consome 1 crédito?',
    a: 'Cada geração de imagem consome 1 crédito, independente do estilo ou modo escolhido. Os créditos renovam todo mês e não acumulam. No plano Pro você tem 150 renders por mês — suficiente para explorar múltiplas variações de iluminação e estilo em qualquer projeto.',
  },
  {
    q: 'Preciso instalar algum programa ou plugin?',
    a: 'Não. O SpaceNode é 100% web — funciona direto no navegador. Nenhuma instalação, nenhuma GPU dedicada, nenhum espaço em disco. Funciona em qualquer computador, tablet ou celular com acesso à internet.',
  },
  {
    q: 'Funciona para arquitetura brasileira? Estilos tropicais e rústicos?',
    a: 'Sim. O SpaceNode foi criado por um arquiteto brasileiro e treinado com referências de arquitetura do Brasil — estilos como Tropical, Rústico BR, Biofílico e Serrano foram desenvolvidos especificamente para o nosso mercado. Nenhuma ferramenta estrangeira entende esse contexto como a gente.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim. Sem fidelidade, sem multa. Cancele quando quiser direto no painel e continue com acesso até o fim do período pago. Pagamento processado via Stripe com todos os protocolos de segurança.',
  },
  {
    q: 'Qual a resolução das imagens geradas?',
    a: 'Depende do plano. Starter gera até 1K (1024px), Pro até 2K (2048px) — ideal para apresentações e redes sociais — e Studio até 4K (4096px), pronto para impressão e materiais de alta qualidade.',
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section style={{ padding: '96px 24px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
          Dúvidas frequentes
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10, color: '#fafafa' }}>
          tudo que você precisa saber.
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '-0.005em', lineHeight: 1.6 }}>
          Perguntas reais de arquitetos do beta. Respondidas de forma direta.
        </p>
      </div>

      <div style={{ border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        {faqs.map((faq, i) => {
          const isOpen = open === i
          return (
            <div key={i} style={{ borderBottom: i < faqs.length - 1 ? '0.5px solid rgba(255,255,255,0.06)' : 'none' }}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '20px 24px', cursor: 'pointer', gap: 16,
                  background: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent',
                  border: 'none', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa', letterSpacing: '-0.01em', lineHeight: 1.4 }}>
                  {faq.q}
                </span>
                <span style={{
                  width: 20, height: 20, flexShrink: 0,
                  border: `0.5px solid ${isOpen ? 'transparent' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isOpen ? 'rgba(255,255,255,0.15)' : 'transparent',
                  transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s ease, background 0.15s',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
                    <path d="M12 5v14M5 12h14" stroke={isOpen ? '#fafafa' : 'rgba(255,255,255,0.4)'} strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </span>
              </button>

              <div style={{
                maxHeight: isOpen ? 300 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)',
              }}>
                <p style={{ padding: '0 24px 22px', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, letterSpacing: '-0.005em' }}>
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
