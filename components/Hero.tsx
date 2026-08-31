"use client";

import Image from "next/image";
import fachadaImg from "@/public/gallery-casa-before.jpg";
import interiorImg from "@/public/gallery-living-after.jpg";
import comercialImg from "@/public/gallery-comercial-before.jpg";

// Composição editorial image-first: 3 renders finais reais (fachada,
// interior, comercial). Sem carrossel, sem comparativo — o antes/depois
// vem na seção seguinte. A fachada é o LCP: `preload` (Next 16 — sucessor
// do `priority`); as demais ficam em lazy (default).
//
// Gotcha do acervo: nos pares casa/comercial os arquivos estão trocados no
// disco — o RENDER deles é o `-before.jpg` (ver marketing/BRIEF.md).

const CAPTIONS = {
  fachada: "Residencial · Fachada",
  interior: "Interior · Sala de estar",
  comercial: "Comercial · Fachada urbana",
};

function Caption({ children }: { children: string }) {
  return (
    <span
      style={{
        position: "absolute",
        bottom: 10,
        left: 10,
        zIndex: 1,
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.82)",
        background: "var(--color-scrim)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        padding: "4px 8px",
        borderRadius: 4,
        pointerEvents: "none",
      }}
    >
      {children}
    </span>
  );
}

export default function Hero() {
  return (
    <section className="spn-hero">
      <div className="spn-hero-copy">
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

        <div className="spn-hero-ctas">
          <a href="/login?mode=signup" className="spn-hero-cta-primary">
            Testar grátis
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <a href="#galeria" className="spn-hero-cta-secondary">
            Ver projetos reais
          </a>
        </div>

        <p className="spn-hero-microcopy">
          80 nodes grátis · sem cartão · em português
        </p>
      </div>

      {/* Cluster editorial: fachada grande à esquerda, interior e faixa
          comercial empilhados à direita. Alturas definidas pelos aspect
          ratios das células — zero layout shift. */}
      <div className="spn-hero-media">
        <figure className="spn-hero-img spn-hero-img--fachada">
          <Image
            src={fachadaImg}
            alt="Render fotorrealista de fachada residencial contemporânea gerado na SpaceNode"
            fill
            preload
            placeholder="blur"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 58vw, 640px"
            style={{ objectFit: "cover" }}
          />
          <Caption>{CAPTIONS.fachada}</Caption>
        </figure>
        <figure className="spn-hero-img spn-hero-img--interior">
          <Image
            src={interiorImg}
            alt="Render fotorrealista de sala de estar gerado na SpaceNode"
            fill
            placeholder="blur"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 38vw, 420px"
            style={{ objectFit: "cover" }}
          />
          <Caption>{CAPTIONS.interior}</Caption>
        </figure>
        <figure className="spn-hero-img spn-hero-img--comercial">
          <Image
            src={comercialImg}
            alt="Render fotorrealista de fachada comercial urbana gerado na SpaceNode"
            fill
            placeholder="blur"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 38vw, 420px"
            style={{ objectFit: "cover" }}
          />
          <Caption>{CAPTIONS.comercial}</Caption>
        </figure>
      </div>

      <style jsx>{`
        .spn-hero {
          padding: 72px 40px 80px;
          max-width: 1080px;
          margin: 0 auto;
        }
        .spn-hero-copy {
          text-align: center;
          max-width: 760px;
          margin: 0 auto 48px;
        }
        .spn-hero-title {
          font-size: clamp(34px, 5.5vw, 56px);
          font-weight: 300;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 0 auto 20px;
          max-width: 660px;
          color: var(--color-text-primary);
        }
        .spn-hero-sub {
          font-size: 16px;
          color: var(--color-text-secondary);
          line-height: 1.55;
          margin: 0 auto 32px;
          max-width: 520px;
          letter-spacing: -0.01em;
        }
        .spn-hero-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .spn-hero-cta-primary {
          background: var(--color-text-primary);
          color: var(--color-bg);
          border-radius: 12px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
          white-space: nowrap;
          letter-spacing: -0.01em;
          padding: 15px 28px;
          font-size: 14px;
          min-height: 52px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .spn-hero-cta-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        .spn-hero-cta-primary:focus-visible,
        .spn-hero-cta-secondary:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }
        .spn-hero-cta-secondary {
          color: var(--color-text-secondary);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 12px;
          border: 0.5px solid var(--color-border);
          white-space: nowrap;
          letter-spacing: -0.01em;
          padding: 15px 22px;
          font-size: 13px;
          min-height: 52px;
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .spn-hero-cta-secondary:hover {
          color: var(--color-text-primary);
          border-color: var(--color-border-strong);
        }
        .spn-hero-microcopy {
          font-size: 12px;
          color: var(--color-text-tertiary);
          margin: 0;
          letter-spacing: 0.01em;
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-hero-cta-primary,
          .spn-hero-cta-secondary { transition: none; }
          .spn-hero-cta-primary:hover { transform: none; }
        }

        .spn-hero-media {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          grid-template-rows: auto auto;
          gap: 10px;
        }
        .spn-hero-img {
          position: relative;
          overflow: hidden;
          border-radius: 14px;
          background: var(--color-bg-elevated);
          border: 0.5px solid var(--color-border);
          margin: 0;
        }
        .spn-hero-img--fachada {
          grid-row: 1 / 3;
          min-height: 100%;
        }
        .spn-hero-img--interior {
          aspect-ratio: 16 / 10;
        }
        .spn-hero-img--comercial {
          aspect-ratio: 21 / 9;
        }

        @media (max-width: 768px) {
          .spn-hero {
            padding: 48px 20px 56px;
          }
          .spn-hero-copy {
            margin: 0 auto 32px;
          }
          .spn-hero-title {
            font-size: clamp(34px, 9vw, 46px);
            margin-bottom: 16px;
            line-height: 1.08;
          }
          .spn-hero-sub {
            font-size: 15px;
            line-height: 1.5;
            margin-bottom: 28px;
          }
          .spn-hero-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            margin-bottom: 14px;
          }
          .spn-hero-cta-primary,
          .spn-hero-cta-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
          .spn-hero-media {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: none;
            gap: 8px;
          }
          .spn-hero-img--fachada {
            grid-column: 1 / 3;
            grid-row: auto;
            aspect-ratio: 16 / 10;
            min-height: 0;
          }
          .spn-hero-img--interior,
          .spn-hero-img--comercial {
            aspect-ratio: 4 / 3;
          }
          .spn-hero-img {
            border-radius: 12px;
          }
        }
      `}</style>
    </section>
  );
}
