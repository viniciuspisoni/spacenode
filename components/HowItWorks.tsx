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
    <section
      id="como-funciona"
      style={{
        padding: "100px 48px",
        borderTop: "0.5px solid var(--color-border)",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 64px" }}>
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
          <h2
            style={{
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 400,
              letterSpacing: "-0.04em",
              margin: "0 0 16px",
              lineHeight: 1.1,
            }}
          >
            três passos.
            <br />
            sem curva de aprendizado.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--color-text-secondary)",
              lineHeight: 1.55,
            }}
          >
            Sem prompts complexos. Sem plugins. Sem configurações técnicas.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 32,
          }}
        >
          {steps.map((s) => (
            <div key={s.num}>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  color: "var(--color-text-tertiary)",
                  margin: "0 0 14px",
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.num}
              </p>
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  margin: "0 0 10px",
                  letterSpacing: "-0.02em",
                  color: "var(--color-text-primary)",
                }}
              >
                {s.title}
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
