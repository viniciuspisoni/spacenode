// Faixa do plugin de SketchUp na landing. Fica logo depois de "Para quem"
// (que termina listando as ferramentas do fluxo do arquiteto) e antes dos
// planos: quem se reconheceu no fluxo descobre aqui a integração nativa.
//
// Faixa CLARA com dividers, como HowItWorks/ForWho — o ritmo de faixas
// pretas da landing (hero, produto/galeria, fecho) fica intocado.
//
// Os três pontos são recursos REAIS em produção (Fase 2 do plugin). O texto
// carrega as condições de verdade de propósito — sem elas a faixa mentiria:
//
// - edge map: `want_edge` em main.rb exige fidelidade Máxima (default) e
//   NÃO vale em variação com âncora, onde o render anterior já é a estrutura.
// - sol: prompts.ts só injeta o bloco solar quando a iluminação é
//   "Preservar Original"; escolher um preset de atmosfera descarta o sol
//   medido de propósito (senão o fato contradiria o override).
// - materiais: `materialSel` nasce vazio e a lista nem é carregada até o
//   usuário abrir o painel Avançado — é uma AÇÃO dele, nunca automático.

const POINTS = [
  {
    title: 'cenas em lote',
    desc: 'Selecione as cenas do modelo e gere o caderno inteiro com os mesmos presets e a mesma semente — materiais e estilo coerentes no conjunto.',
  },
  {
    title: 'geometria como verdade',
    desc: 'Na fidelidade máxima, a cena é capturada duas vezes: a vista e um mapa de arestas hidden-line da mesma câmera. O motor recebe a estrutura medida do modelo, no lugar de inferi-la do pixel.',
  },
  {
    title: 'o modelo entra como dado',
    desc: 'Preservando a luz do projeto, a posição do sol (data, hora e local do modelo) e a lente da câmera vão no prompt como fato medido. E você pode apontar texturas do próprio modelo como amostra de material.',
  },
]

export function SketchUpBand() {
  return (
    <section id="sketchup" className="spn-skp">
      <div className="spn-skp-inner">
        <div className="spn-skp-head">
          <div className="spn-skp-eyebrow">
            <span className="spn-skp-rule" />
            Plugin oficial
            <span className="spn-skp-rule" />
          </div>
          <h2 className="spn-skp-title">renderize de dentro do SketchUp.</h2>
          <p className="spn-skp-sub">
            A extensão oficial captura a vista atual e manda junto o que só quem está dentro
            do modelo tem: a geometria em mapa de arestas, a lente da câmera e a posição do
            sol. O render volta com o mesmo motor de fidelidade da plataforma, sem exportar
            imagem e sem sair do projeto.
          </p>
        </div>

        <div className="spn-skp-grid">
          {POINTS.map(p => (
            <div key={p.title} className="spn-skp-point">
              <p className="spn-skp-point-title">{p.title}</p>
              <p className="spn-skp-point-desc">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="spn-skp-cta-row">
          <a href="/sketchup" className="spn-skp-cta">
            Conhecer o plugin →
          </a>
          <span className="spn-skp-note">
            Grátis — os renders usam os Nodes da sua conta.
          </span>
        </div>
      </div>

      <style jsx>{`
        .spn-skp {
          padding: 100px 48px;
        }
        .spn-skp-inner {
          max-width: 920px;
          margin: 0 auto;
        }
        .spn-skp-head {
          text-align: center;
          max-width: 640px;
          margin: 0 auto 56px;
        }
        .spn-skp-eyebrow {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 16px;
        }
        .spn-skp-rule {
          display: block;
          width: 32px;
          height: 0.5px;
          background: var(--color-border-strong);
        }
        .spn-skp-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-skp-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0;
        }
        .spn-skp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 32px;
        }
        .spn-skp-point-title {
          font-size: 18px;
          font-weight: 500;
          letter-spacing: -0.02em;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-skp-point-desc {
          font-size: 13.5px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
        }
        .spn-skp-cta-row {
          margin-top: 56px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .spn-skp-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          padding: 0 24px;
          border-radius: 12px;
          background: var(--color-text-primary);
          color: var(--color-bg);
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.005em;
          text-decoration: none;
          transition: opacity var(--duration-base) ease;
        }
        .spn-skp-cta:hover {
          opacity: 0.88;
          color: var(--color-bg);
        }
        .spn-skp-cta:focus-visible {
          outline: 2px solid var(--color-text-primary);
          outline-offset: 3px;
        }
        .spn-skp-note {
          font-size: 12px;
          color: var(--color-text-tertiary);
        }

        @media (max-width: 768px) {
          .spn-skp {
            padding: 72px 20px;
          }
          .spn-skp-head {
            margin: 0 auto 40px;
          }
          .spn-skp-title {
            font-size: 24px;
          }
          .spn-skp-sub {
            font-size: 13px;
          }
          .spn-skp-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .spn-skp-point {
            padding: 22px 20px;
            background: var(--color-bg-elevated);
            border: 0.5px solid var(--color-border);
            border-radius: 14px;
          }
          .spn-skp-cta-row {
            margin-top: 40px;
          }
          .spn-skp-cta {
            width: 100%;
          }
        }
      `}</style>
    </section>
  )
}
