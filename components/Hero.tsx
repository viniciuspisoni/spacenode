"use client";

export default function Hero() {
  return (
    <section
      id="hero"
      style={{
        padding: "120px 40px 56px",
        textAlign: "center",
        maxWidth: 880,
        margin: "0 auto",
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.28em",
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 24,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--color-accent-green)",
            boxShadow: "0 0 8px var(--color-accent-green-glow)",
          }}
        />
        BETA ABERTO
      </span>

      <h1
        style={{
          fontSize: "clamp(32px, 6vw, 56px)",
          fontWeight: 400,
          letterSpacing: "-0.045em",
          lineHeight: 1.05,
          margin: "24px 0",
          color: "var(--color-text-primary)",
        }}
      >
        Transforme projetos em apresentações
        <br />
        <span style={{ color: "var(--color-text-tertiary)" }}>
          visuais de alto impacto.
        </span>
      </h1>

      <p
        style={{
          fontSize: 17,
          color: "var(--color-text-secondary)",
          lineHeight: 1.55,
          margin: "0 auto 40px",
          maxWidth: 560,
        }}
      >
        Crie renders, refine imagens, gere vídeos e impressione clientes em
        minutos. Para arquitetos e designers de interiores.
      </p>

      {/* CTAs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <a
          href="/login"
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 12,
            padding: "15px 28px",
            fontSize: 14,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            whiteSpace: "nowrap",
            transition: "opacity 0.2s",
            letterSpacing: "-0.01em",
          }}
        >
          Começar grátis
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <a
          href="#como-funciona"
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "15px 22px",
            borderRadius: 12,
            border: "0.5px solid var(--color-border-strong)",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
            transition: "border-color 0.2s",
          }}
        >
          Ver demonstração
        </a>
      </div>

      {/* Trust line */}
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          display: "flex",
          justifyContent: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span>3 imagens grátis ao criar conta</span>
        <span>·</span>
        <span>sem cartão de crédito</span>
        <span>·</span>
        <span>para arquitetura e interiores</span>
      </div>
    </section>
  );
}
