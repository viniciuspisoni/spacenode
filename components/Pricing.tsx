const plans = [
  {
    name: "Starter",
    credits: 50,
    price: "89",
    meter: "16.6%",
    features: [
      "Motor padrão",
      "Saída até 1K",
      "Histórico ilimitado",
      "Suporte por e-mail",
    ],
    cta: "começar com starter",
    featured: false,
    badge: null,
  },
  {
    name: "Pro",
    credits: 150,
    price: "149",
    meter: "50%",
    features: [
      "Todos os motores",
      "Saída até 2K",
      "Histórico ilimitado",
      "Suporte por e-mail",
    ],
    cta: "começar com pro",
    featured: true,
    badge: "recomendado",
  },
  {
    name: "Studio",
    credits: 500,
    price: "299",
    meter: "100%",
    features: [
      "Todos os motores",
      "Saída até 4K",
      "Histórico ilimitado",
      "Suporte prioritário",
    ],
    cta: "começar com studio",
    featured: false,
    badge: null,
  },
];

export default function Pricing() {
  return (
    <section
      id="planos"
      style={{
        padding: "120px 24px",
        borderTop: "0.5px solid var(--color-border)",
        background: "var(--color-bg)",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                display: "block",
                width: 32,
                height: 0.5,
                background: "var(--color-border-strong)",
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--color-text-tertiary)",
              }}
            >
              planos
            </span>
            <span
              style={{
                display: "block",
                width: 32,
                height: 0.5,
                background: "var(--color-border-strong)",
              }}
            />
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
              marginBottom: 10,
              color: "var(--color-text-primary)",
            }}
          >
            Escolha seu volume de geração
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-tertiary)",
              letterSpacing: "-0.005em",
              lineHeight: 1.6,
            }}
          >
            Créditos renovam mensalmente. Cancele quando quiser.
          </p>
        </div>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {plans.map((p) => (
            <div
              key={p.name}
              style={{
                background: p.featured
                  ? "var(--color-text-primary)"
                  : "var(--color-bg-elevated)",
                border: `0.5px solid ${p.featured ? "transparent" : "var(--color-border-strong)"}`,
                borderRadius: 14,
                padding: "28px 24px 24px",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Badge */}
              {p.badge && (
                <span
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    background: "var(--color-accent-green)",
                    color: "#fff",
                    padding: "3px 8px",
                    borderRadius: 20,
                  }}
                >
                  {p.badge}
                </span>
              )}

              {/* Plan name */}
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: p.featured ? "var(--color-bg)" : "var(--color-text-tertiary)",
                  opacity: p.featured ? 0.45 : 1,
                  marginBottom: 20,
                }}
              >
                {p.name}
              </p>

              {/* Credits */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 40,
                    fontWeight: 500,
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                    color: p.featured ? "var(--color-bg)" : "var(--color-text-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {p.credits}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: p.featured ? "var(--color-bg)" : "var(--color-text-tertiary)",
                    opacity: p.featured ? 0.4 : 1,
                    letterSpacing: "-0.005em",
                  }}
                >
                  nodes / mês
                </span>
              </div>

              {/* Price */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 4,
                  marginBottom: 24,
                  marginTop: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: p.featured ? "var(--color-bg)" : "var(--color-text-tertiary)",
                    opacity: p.featured ? 0.4 : 1,
                  }}
                >
                  R$
                </span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    color: p.featured ? "var(--color-bg)" : "var(--color-text-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {p.price}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: p.featured ? "var(--color-bg)" : "var(--color-text-tertiary)",
                    opacity: p.featured ? 0.35 : 1,
                    letterSpacing: "-0.005em",
                  }}
                >
                  /mês
                </span>
              </div>

              {/* Meter */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    height: 2,
                    background: p.featured
                      ? "rgba(0,0,0,0.12)"
                      : "var(--color-border-strong)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: p.meter,
                      borderRadius: 2,
                      background: p.featured
                        ? "var(--color-accent-green)"
                        : "var(--color-text-primary)",
                    }}
                  />
                </div>
              </div>

              {/* Divider */}
              <div
                style={{
                  height: 0.5,
                  background: p.featured
                    ? "rgba(0,0,0,0.1)"
                    : "var(--color-border-strong)",
                  marginBottom: 20,
                }}
              />

              {/* Features */}
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 28,
                  flex: 1,
                }}
              >
                {p.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 12,
                      color: p.featured ? "var(--color-bg)" : "var(--color-text-primary)",
                      opacity: p.featured ? 0.75 : 1,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="var(--color-accent-green)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <path d="M2 7l3.5 3.5L12 3.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.01em",
                  cursor: "pointer",
                  border: `0.5px solid ${p.featured ? "transparent" : "var(--color-border-strong)"}`,
                  background: p.featured ? "var(--color-bg)" : "var(--color-surface)",
                  color: "var(--color-text-primary)",
                  fontFamily: "inherit",
                }}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <p
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              letterSpacing: "-0.005em",
              lineHeight: 1.7,
            }}
          >
            Cada render consome 1 crédito. Créditos não utilizados não acumulam para o mês
            seguinte.
            <br />
            Dúvidas?{" "}
            <a
              href="#"
              style={{
                color: "var(--color-text-primary)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              fale com a gente.
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
