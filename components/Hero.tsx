"use client";

import { useState } from "react";

export default function Hero() {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);

  return (
    <section
      style={{
        padding: "140px 40px 88px",
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
          marginBottom: 28,
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
          fontSize: "clamp(32px, 6vw, 58px)",
          fontWeight: 300,
          letterSpacing: "-0.045em",
          lineHeight: 1.05,
          margin: "28px auto",
          maxWidth: 660,
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
          lineHeight: 1.6,
          margin: "0 auto 48px",
          maxWidth: 520,
          letterSpacing: "-0.01em",
        }}
      >
        A plataforma visual para arquitetos e designers de interiores. Crie
        imagens, refine renders e apresente projetos em minutos.
      </p>

      {/* CTAs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 28,
        }}
      >
        <a
          href="/login"
          onMouseEnter={() => setPrimaryHovered(true)}
          onMouseLeave={() => setPrimaryHovered(false)}
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
            letterSpacing: "-0.01em",
            transform: primaryHovered ? "translateY(-1px)" : "translateY(0)",
            boxShadow: primaryHovered ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          Começar grátis
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <a
          href="#como-funciona"
          onMouseEnter={() => setSecondaryHovered(true)}
          onMouseLeave={() => setSecondaryHovered(false)}
          style={{
            fontSize: 13,
            color: secondaryHovered ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "15px 22px",
            borderRadius: 12,
            border: `0.5px solid ${secondaryHovered ? "var(--color-border-strong)" : "var(--color-border)"}`,
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
            transition: "all 0.2s ease",
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
          letterSpacing: "0.02em",
        }}
      >
        <span>12 nodes grátis</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>Sem cartão</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>Sem compromisso</span>
      </div>
    </section>
  );
}
