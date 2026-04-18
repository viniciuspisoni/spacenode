export default function Quote() {
  return (
    <section
      style={{
        padding: "120px 40px",
        background: "var(--color-surface)",
        borderTop: "0.5px solid var(--color-border)",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
        <p
          style={{
            fontSize: "clamp(20px, 3.5vw, 26px)",
            lineHeight: 1.35,
            color: "var(--color-text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.025em",
            margin: "0 0 32px",
          }}
        >
          Em cinco minutos apresento três variações para o cliente que antes
          levavam uma semana. A Spacenode virou parte do meu fluxo.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--color-text-primary)",
              color: "var(--color-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.08em",
            }}
          >
            CM
          </div>
          <div style={{ textAlign: "left" }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                margin: 0,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Camila Mendes
            </p>
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                margin: "4px 0 0",
                letterSpacing: "0.05em",
              }}
            >
              ARQUITETA · PORTO ALEGRE · RS
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
