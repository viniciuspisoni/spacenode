// Faixa do plugin de SketchUp. Fica entre o produto e os planos: quem já
// entendeu a plataforma descobre aqui que ela entra dentro do modelo.
//
// Os três pontos são recursos REAIS em produção. O texto carrega as
// condições de verdade de propósito — sem elas a faixa mentiria:
//
// - edge map: `want_edge` em main.rb NÃO vale em variação com âncora, onde
//   o render anterior já é a estrutura. (Desde a v0.6 a fidelidade é sempre
//   máxima — o seletor foi descontinuado — então a captura dupla é a regra.)
// - sol: prompts.ts só injeta o bloco solar quando a iluminação é
//   "Preservar Original"; escolher um preset de atmosfera descarta o sol
//   medido de propósito (senão o fato contradiria o override).
const POINTS = [
  {
    title: 'cenas em lote',
    desc: 'Selecione as cenas do modelo e gere o caderno inteiro com os mesmos presets e a mesma semente.',
  },
  {
    title: 'geometria como verdade',
    desc: 'Cada cena é capturada duas vezes: a vista e um mapa de arestas da mesma câmera. O motor recebe a estrutura medida, não inferida do pixel.',
  },
  {
    title: 'o modelo entra como dado',
    desc: 'Preservando a luz do projeto, a posição do sol — data, hora e local do modelo — e a lente da câmera vão no prompt como fato medido.',
  },
]

export function SketchUpBand() {
  return (
    <section id="sketchup" className="spn-skp">
      <div className="spn-skp-card spn-glass">
        <div className="spn-skp-head">
          <span className="spn-skp-eyebrow">plugin oficial</span>
          <h2 className="spn-skp-title">renderize de dentro do SketchUp.</h2>
          <p className="spn-skp-sub">
            A extensão captura a vista atual e manda junto o que só quem está
            dentro do modelo tem. O render volta sem exportar imagem e sem
            sair do projeto.
          </p>
        </div>

        <div className="spn-skp-points">
          {POINTS.map(p => (
            <div key={p.title} className="spn-skp-point">
              <p className="spn-skp-point-title">{p.title}</p>
              <p className="spn-skp-point-desc">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="spn-skp-foot">
          <a href="/sketchup" className="spn-skp-cta spn-glass--raised">
            Conhecer o plugin
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <span className="spn-skp-note">Grátis — os renders usam os Nodes da sua conta.</span>
        </div>
      </div>

      <style jsx>{`
        .spn-skp {
          position: relative;
          z-index: 1;
          padding: 0 24px 96px;
          max-width: 1000px;
          margin: 0 auto;
        }
        .spn-skp-card {
          padding: 44px 40px 36px;
          border-radius: calc(var(--r-card) + 6px);
          box-shadow: var(--shadow-float);
        }
        .spn-skp-head {
          max-width: 560px;
          margin-bottom: 32px;
        }
        .spn-skp-eyebrow {
          display: inline-block;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 14px;
        }
        .spn-skp-title {
          font-size: clamp(22px, 3.6vw, 30px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-skp-sub {
          font-size: 14.5px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          letter-spacing: -0.005em;
          margin: 0;
        }
        .spn-skp-points {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 26px;
          padding-top: 28px;
          border-top: 0.5px solid var(--glass-line);
        }
        .spn-skp-point-title {
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: var(--color-text-primary);
          margin: 0 0 7px;
        }
        .spn-skp-point-desc {
          font-size: 13px;
          color: var(--color-text-secondary);
          line-height: 1.55;
          margin: 0;
        }
        .spn-skp-foot {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 32px;
        }
        .spn-skp-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 13px 22px;
          min-height: 48px;
          border-radius: var(--r-inner);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          text-decoration: none;
          color: var(--color-text-primary);
          transition: transform 200ms var(--ease), border-color 200ms var(--ease);
        }
        .spn-skp-cta:hover {
          transform: translateY(-1px);
          border-color: var(--glass-line-strong);
        }
        .spn-skp-cta:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        .spn-skp-note {
          font-size: 12px;
          color: var(--color-text-tertiary);
        }

        @media (max-width: 768px) {
          .spn-skp { padding: 0 16px 64px; }
          .spn-skp-card { padding: 28px 22px 26px; }
          .spn-skp-head { margin-bottom: 24px; }
          .spn-skp-points { grid-template-columns: 1fr; gap: 20px; padding-top: 22px; }
          .spn-skp-foot { margin-top: 26px; gap: 12px; }
          .spn-skp-cta { width: 100%; justify-content: center; }
          .spn-skp-note { width: 100%; text-align: center; }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-skp-cta { transition: none; }
          .spn-skp-cta:hover { transform: none; }
        }
      `}</style>
    </section>
  )
}
