"use client";

import { useState } from "react";

export default function Hero() {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);

  return (
    <section className="spn-hero">
      <h1 className="spn-hero-title">
        Visualização arquitetônica{" "}
        <span style={{ color: "var(--color-text-tertiary)" }}>
          que respeita seu projeto.
        </span>
      </h1>

      <p className="spn-hero-sub">
        Renderize imagens fotorrealistas a partir de modelos, prints e
        referências — preservando geometria, proporções e intenção
        arquitetônica.
      </p>

      {/* CTAs */}
      <div className="spn-hero-ctas">
        <a
          href="/login?mode=signup"
          onMouseEnter={() => setPrimaryHovered(true)}
          onMouseLeave={() => setPrimaryHovered(false)}
          className="spn-hero-cta-primary"
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 12,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            textDecoration: "none",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
            transform: primaryHovered ? "translateY(-1px)" : "translateY(0)",
            boxShadow: primaryHovered ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          Começar agora
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <a
          href="#como-funciona"
          onMouseEnter={() => setSecondaryHovered(true)}
          onMouseLeave={() => setSecondaryHovered(false)}
          className="spn-hero-cta-secondary"
          style={{
            color: secondaryHovered ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 12,
            border: `0.5px solid ${secondaryHovered ? "var(--color-border-strong)" : "var(--color-border)"}`,
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
            transition: "all 0.2s ease",
          }}
        >
          Ver como funciona
        </a>
      </div>

      {/* Trust lines */}
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-secondary)",
          margin: "0 0 10px",
          letterSpacing: "-0.005em",
        }}
      >
        Feita por arquiteto, para arquitetos e designers de interiores.
      </p>
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
        <span>80 nodes grátis</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>Sem cartão</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>Sem compromisso</span>
      </div>

      <style jsx>{`
        .spn-hero {
          padding: 140px 40px 88px;
          text-align: center;
          max-width: 880px;
          margin: 0 auto;
        }
        .spn-hero-title {
          font-size: clamp(34px, 6vw, 58px);
          font-weight: 300;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 28px auto;
          max-width: 660px;
          color: var(--color-text-primary);
        }
        .spn-hero-sub {
          font-size: 17px;
          color: var(--color-text-secondary);
          line-height: 1.55;
          margin: 0 auto 40px;
          max-width: 520px;
          letter-spacing: -0.01em;
        }
        .spn-hero-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 28px;
        }
        .spn-hero-cta-primary {
          padding: 15px 28px;
          font-size: 14px;
          min-height: 52px;
        }
        .spn-hero-cta-secondary {
          padding: 15px 22px;
          font-size: 13px;
          min-height: 52px;
        }

        @media (max-width: 768px) {
          .spn-hero {
            padding: 72px 20px 64px;
          }
          .spn-hero-title {
            font-size: clamp(34px, 9vw, 46px);
            margin: 24px auto 20px;
            line-height: 1.08;
          }
          .spn-hero-sub {
            font-size: 15px;
            line-height: 1.5;
            margin: 0 auto 32px;
          }
          .spn-hero-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            margin-bottom: 24px;
          }
          .spn-hero-cta-primary,
          .spn-hero-cta-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
        }
      `}</style>
    </section>
  );
}
