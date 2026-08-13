"use client";

// Hero v2 (2026-08-13, conversão): visual acima da dobra. Copy enxuta à
// esquerda; à direita o comparador modelo → render (par "living" da galeria,
// o mais leve — LCP). O divisor faz uma varredura única ao montar pra
// sinalizar interatividade (rAF por tempo; pula com prefers-reduced-motion e
// morre no primeiro toque). A régua de valor no rodapé absorve a antiga
// seção ValueProps — os 4 pontos em uma linha, sem parágrafos.

import { useEffect, useRef, useState } from "react";

const HERO_BEFORE = "/gallery-living-before.jpg";
const HERO_AFTER = "/gallery-living-after.jpg";

const VALUE_POINTS = [
  "Geometria preservada",
  "Coerência entre imagens",
  "Controle sem prompts",
  "Do estudo à apresentação",
];

function HeroCompare() {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<number | null>(null);

  const updatePos = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPos(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)));
  };

  const stopSweep = () => {
    if (sweepRef.current !== null) {
      cancelAnimationFrame(sweepRef.current);
      sweepRef.current = null;
    }
  };

  // Varredura de apresentação: 50 → 76 → 28 → 50 em ~2,6s, easing suave.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const KEYS = [50, 76, 28, 50];
    const SEG = 870;
    const start = performance.now() + 500;
    const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
    const tick = (now: number) => {
      const t = now - start;
      if (t >= 0) {
        const seg = Math.floor(t / SEG);
        if (seg >= KEYS.length - 1) {
          setPos(KEYS[KEYS.length - 1]);
          sweepRef.current = null;
          return;
        }
        const f = ease((t % SEG) / SEG);
        setPos(KEYS[seg] + (KEYS[seg + 1] - KEYS[seg]) * f);
      }
      sweepRef.current = requestAnimationFrame(tick);
    };
    sweepRef.current = requestAnimationFrame(tick);
    return stopSweep;
  }, []);

  return (
    <div className="spn-hero-visual">
      <div
        ref={containerRef}
        className="spn-hero-compare"
        onPointerDown={(e) => {
          stopSweep();
          e.currentTarget.setPointerCapture(e.pointerId);
          updatePos(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) updatePos(e.clientX);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_BEFORE}
          alt="Modelo 3D da sala de estar"
          width={1336}
          height={749}
          draggable={false}
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "contrast(0.9) saturate(0.9) brightness(0.95)",
            pointerEvents: "none",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_AFTER}
          alt="Render fotorrealista gerado na SpaceNode"
          width={1376}
          height={768}
          draggable={false}
          fetchPriority="high"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            clipPath: `inset(0 0 0 ${pos}%)`,
            pointerEvents: "none",
          }}
        />

        {/* Divisor */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${pos}%`,
            width: 1.5,
            background: "#ffffff",
            transform: "translateX(-50%)",
            boxShadow: "0 0 8px rgba(255,255,255,0.5), 0 0 3px rgba(255,255,255,1)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 2px 12px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="11" height="9" viewBox="0 0 10 8" fill="none">
              <path
                d="M0.5 4h9M3 1.5 0.5 4 3 6.5M7 1.5 9.5 4 7 6.5"
                stroke="#1a1a1a"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <span className="spn-hero-compare-label" style={{ left: 12 }}>
          modelo
        </span>
        <span
          className="spn-hero-compare-label"
          style={{ right: 12, color: "rgba(255,255,255,0.88)", textShadow: "0 0 8px rgba(255,255,255,0.25)" }}
        >
          render
        </span>
      </div>
      <p className="spn-hero-visual-caption">
        Sala de estar · gerada na SpaceNode, sem pós-produção. Arraste para comparar.
      </p>

      <style jsx>{`
        .spn-hero-visual {
          width: 100%;
        }
        .spn-hero-compare {
          position: relative;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          border-radius: var(--radius-lg);
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          background: var(--color-surface);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12), 0 24px 64px rgba(0, 0, 0, 0.35);
          cursor: col-resize;
          user-select: none;
          touch-action: pan-y;
        }
        .spn-hero-compare-label {
          position: absolute;
          bottom: 10px;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.38);
          pointer-events: none;
        }
        .spn-hero-visual-caption {
          margin: 12px 2px 0;
          font-size: 11px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

export default function Hero() {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);

  return (
    <section className="spn-hero">
      <div className="spn-hero-grid">
        <div className="spn-hero-copy">
          <h1 className="spn-hero-title">
            Visualização arquitetônica{" "}
            <span style={{ color: "var(--color-text-tertiary)" }}>
              que respeita seu projeto.
            </span>
          </h1>

          <p className="spn-hero-sub">
            Suba o print do seu modelo e receba imagens fotorrealistas em
            minutos — geometria e proporções preservadas.
          </p>

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
                <path
                  d="M2 6h8M6.5 2.5L10 6l-3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a
              href="#galeria"
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
              Ver projetos reais
            </a>
          </div>

          <div className="spn-hero-trust">
            <span>80 nodes grátis</span>
            <span className="spn-hero-trust-dot" aria-hidden>
              •
            </span>
            <span>Sem cartão</span>
            <span className="spn-hero-trust-dot" aria-hidden>
              •
            </span>
            <span>Feita por arquiteto, para arquitetos</span>
          </div>
        </div>

        <HeroCompare />
      </div>

      {/* Régua de valor — a antiga seção ValueProps em uma linha. */}
      <ul className="spn-hero-points">
        {VALUE_POINTS.map((p) => (
          <li key={p} className="spn-hero-point">
            {p}
          </li>
        ))}
      </ul>

      <style jsx>{`
        .spn-hero {
          padding: 96px 40px 72px;
          max-width: 1120px;
          margin: 0 auto;
        }
        .spn-hero-grid {
          display: grid;
          grid-template-columns: minmax(360px, 5fr) minmax(0, 6fr);
          gap: 56px;
          align-items: center;
        }
        .spn-hero-title {
          font-size: clamp(32px, 3.6vw, 46px);
          font-weight: 300;
          letter-spacing: -0.045em;
          line-height: 1.06;
          margin: 0 0 18px;
          color: var(--color-text-primary);
        }
        .spn-hero-sub {
          font-size: 16px;
          color: var(--color-text-secondary);
          line-height: 1.55;
          margin: 0 0 32px;
          max-width: 440px;
          letter-spacing: -0.01em;
        }
        .spn-hero-ctas {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 20px;
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
        .spn-hero-trust {
          font-size: 11px;
          color: var(--color-text-tertiary);
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          letter-spacing: 0.02em;
        }
        .spn-hero-trust-dot {
          opacity: 0.4;
        }
        .spn-hero-points {
          list-style: none;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px 0;
          margin: 64px 0 0;
          padding: 18px 0 0;
          border-top: 0.5px solid rgba(255, 255, 255, 0.06);
        }
        .spn-hero-point {
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-secondary);
          letter-spacing: -0.005em;
          padding: 0 22px;
          white-space: nowrap;
        }
        .spn-hero-point + .spn-hero-point {
          border-left: 0.5px solid rgba(255, 255, 255, 0.1);
        }

        @media (max-width: 960px) {
          .spn-hero-grid {
            grid-template-columns: 1fr;
            gap: 36px;
          }
          .spn-hero-copy {
            text-align: center;
          }
          .spn-hero-sub {
            margin-left: auto;
            margin-right: auto;
          }
          .spn-hero-ctas {
            justify-content: center;
          }
          .spn-hero-trust {
            justify-content: center;
          }
        }

        @media (max-width: 768px) {
          .spn-hero {
            padding: 56px 20px 56px;
          }
          .spn-hero-title {
            font-size: clamp(32px, 8.5vw, 42px);
            margin-bottom: 16px;
          }
          .spn-hero-sub {
            font-size: 15px;
            margin-bottom: 28px;
          }
          .spn-hero-ctas {
            flex-direction: column;
            align-items: stretch;
          }
          .spn-hero-cta-primary,
          .spn-hero-cta-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
          .spn-hero-points {
            margin-top: 44px;
            gap: 12px 0;
          }
          .spn-hero-point {
            padding: 0 14px;
            font-size: 11px;
          }
        }
      `}</style>
    </section>
  );
}
