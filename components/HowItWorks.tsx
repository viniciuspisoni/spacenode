const steps = [
  {
    num: "01",
    title: "envie seu projeto",
    desc: "Prints do SketchUp, imagens base, estudos volumétricos ou referências. O que você tiver em mãos.",
  },
  {
    num: "02",
    title: "defina a intenção",
    desc: "Atmosfera, enquadramento, iluminação, materiais e nível de fidelidade. Escolhas de arquiteto, não prompts.",
  },
  {
    num: "03",
    title: "gere, refine e apresente",
    desc: "Imagens coerentes para testar alternativas e apresentar ao cliente — no mesmo projeto.",
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="spn-hiw">
      <div className="spn-hiw-inner">
        <div className="spn-hiw-head">
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--color-text-tertiary)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <span style={{ display: "block", width: 32, height: "0.5px", background: "var(--color-border-strong)" }} />
            Fluxo
            <span style={{ display: "block", width: 32, height: "0.5px", background: "var(--color-border-strong)" }} />
          </div>
          <h2 className="spn-hiw-title">
            três passos. do estudo à apresentação.
          </h2>
          <p className="spn-hiw-sub">
            Sem prompts complexos. Sem plugins. Escolhas de arquitetura, não de
            tecnologia.
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
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          margin: 0 0 10px;
          line-height: 1.2;
          color: var(--color-text-primary);
        }
        .spn-hiw-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0;
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
            font-size: 24px;
          }
          .spn-hiw-sub {
            font-size: 13px;
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
