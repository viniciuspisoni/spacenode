const steps = [
  {
    num: "01",
    title: "envie seu projeto",
    desc: "Foto, sketch, modelagem 3D ou croqui. O que você tiver em mãos.",
  },
  {
    num: "02",
    title: "escolha o estilo",
    desc: "Estilos curados para arquitetura e interiores. Sem configurações técnicas.",
  },
  {
    num: "03",
    title: "receba em segundos",
    desc: "Imagem pronta para apresentar ao cliente. Baixe e use.",
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="spn-hiw">
      <div className="spn-hiw-inner">
        <div className="spn-hiw-head">
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.28em",
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              fontWeight: 500,
              display: "inline-block",
              marginBottom: 16,
            }}
          >
            FLUXO
          </span>
          <h2 className="spn-hiw-title">
            três passos.
            <br />
            sem curva de aprendizado.
          </h2>
          <p className="spn-hiw-sub">
            Sem prompts complexos. Sem plugins. Sem configurações técnicas.
          </p>
        </div>

        <div className="spn-hiw-grid">
          {steps.map((s) => (
            <div key={s.num} className="spn-hiw-step">
              <p className="spn-hiw-num">{s.num}</p>
              <p className="spn-hiw-step-title">{s.title}</p>
              <p className="spn-hiw-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .spn-hiw {
          padding: 100px 48px;
          border-top: 0.5px solid var(--color-border);
        }
        .spn-hiw-inner {
          max-width: 920px;
          margin: 0 auto;
        }
        .spn-hiw-head {
          text-align: center;
          max-width: 600px;
          margin: 0 auto 64px;
        }
        .spn-hiw-title {
          font-size: clamp(28px, 5vw, 40px);
          font-weight: 400;
          letter-spacing: -0.04em;
          margin: 0 0 16px;
          line-height: 1.1;
        }
        .spn-hiw-sub {
          font-size: 15px;
          color: var(--color-text-secondary);
          line-height: 1.55;
        }
        .spn-hiw-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 32px;
        }
        .spn-hiw-num {
          font-size: 10px;
          letter-spacing: 0.22em;
          color: var(--color-text-tertiary);
          margin: 0 0 14px;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
        }
        .spn-hiw-step-title {
          font-size: 18px;
          font-weight: 500;
          margin: 0 0 10px;
          letter-spacing: -0.02em;
          color: var(--color-text-primary);
        }
        .spn-hiw-step-desc {
          font-size: 13.5px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
        }

        @media (max-width: 768px) {
          .spn-hiw {
            padding: 72px 20px;
          }
          .spn-hiw-head {
            margin: 0 auto 40px;
          }
          .spn-hiw-title {
            font-size: 28px;
            letter-spacing: -0.035em;
          }
          .spn-hiw-sub {
            font-size: 14px;
          }
          .spn-hiw-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .spn-hiw-step {
            padding: 22px 20px;
            background: var(--color-bg-elevated);
            border: 0.5px solid var(--color-border);
            border-radius: 14px;
            position: relative;
          }
          .spn-hiw-num {
            font-size: 11px;
            margin-bottom: 10px;
            color: var(--color-accent-green);
          }
          .spn-hiw-step-title {
            font-size: 17px;
            margin-bottom: 6px;
          }
          .spn-hiw-step-desc {
            font-size: 13.5px;
          }
        }
      `}</style>
    </section>
  );
}
