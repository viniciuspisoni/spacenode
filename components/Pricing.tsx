const plans = [
  {
    tag: "STARTER",
    title: "para experimentar",
    price: "R$ 97",
    unit: "/mês",
    features: [
      "30 renders por mês",
      "resolução padrão",
      "histórico de 30 dias",
      "suporte por e-mail",
    ],
    cta: "começar com starter",
    featured: false,
  },
  {
    tag: "PRO · RECOMENDADO",
    title: "para uso profissional",
    price: "R$ 197",
    unit: "/mês",
    features: [
      "150 renders por mês",
      "alta resolução",
      "histórico ilimitado",
      "suporte prioritário",
      "early access a novos estilos",
    ],
    cta: "começar com pro",
    featured: true,
  },
];

export default function Pricing() {
  return (
    <section
      id="planos"
      style={{
        padding: "120px 40px",
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
            PLANOS
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
            comece grátis.
            <br />
            cresça conforme precisar.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--color-text-tertiary)",
              lineHeight: 1.55,
            }}
          >
            3 renders grátis para testar. Sem cartão de crédito. Assinatura apenas
            se fizer sentido.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            maxWidth: 680,
            margin: "0 auto",
          }}
        >
          {plans.map((p) => (
            <div
              key={p.tag}
              style={{
                border: p.featured
                  ? "1.5px solid var(--color-text-primary)"
                  : "0.5px solid var(--color-border-strong)",
                borderRadius: 16,
                padding: 32,
                background: p.featured
                  ? "var(--color-text-primary)"
                  : "var(--color-bg-elevated)",
                color: p.featured ? "var(--color-bg)" : "var(--color-text-primary)",
                transition: "all 0.2s",
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: p.featured
                    ? "var(--color-text-quaternary)"
                    : "var(--color-text-tertiary)",
                  fontWeight: 500,
                  margin: "0 0 8px",
                }}
              >
                {p.tag}
              </p>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  margin: "0 0 24px",
                  letterSpacing: "-0.015em",
                }}
              >
                {p.title}
              </h3>
              <p
                style={{
                  fontSize: 40,
                  fontWeight: 400,
                  margin: "0 0 4px",
                  letterSpacing: "-0.04em",
                }}
              >
                {p.price}
                <span
                  style={{
                    fontSize: 13,
                    color: p.featured
                      ? "var(--color-text-quaternary)"
                      : "var(--color-text-tertiary)",
                    fontWeight: 400,
                  }}
                >
                  {" "}
                  {p.unit}
                </span>
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: "24px 0",
                  fontSize: 13,
                  color: p.featured
                    ? "var(--color-text-quaternary)"
                    : "var(--color-text-secondary)",
                }}
              >
                {p.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      padding: "6px 0 6px 22px",
                      position: "relative",
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 13,
                        width: 12,
                        height: 1,
                        background: p.featured
                          ? "var(--color-text-tertiary)"
                          : "var(--color-text-quaternary)",
                      }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  border: p.featured
                    ? "none"
                    : "0.5px solid var(--color-text-primary)",
                  background: p.featured ? "var(--color-bg)" : "transparent",
                  color: p.featured
                    ? "var(--color-text-primary)"
                    : "var(--color-text-primary)",
                  transition: "all 0.2s",
                }}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
