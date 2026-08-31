"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import sketchImg from "@/public/demo-sketch.jpg";
import renderImg from "@/public/demo-render.jpg";

// O melhor antes/depois do acervo: modelo SketchUp branco → render da mesma
// casa, geometria idêntica. Fica logo após o hero, em fundo claro.
export default function Demo() {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newPos = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, newPos)));
  }, []);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -5 : 5;
      setPosition((p) => Math.max(0, Math.min(100, p + delta)));
    }
  }, []);

  return (
    <section id="antes-depois" className="spn-demo">
      <div className="spn-demo-head">
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
          Antes / depois
          <span style={{ display: "block", width: 32, height: "0.5px", background: "var(--color-border-strong)" }} />
        </div>
        <h2 className="spn-demo-title">
          a mesma geometria, pronta para apresentar.
        </h2>
        <p className="spn-demo-sub">
          Modelo SketchUp e resultado, lado a lado. Compare a estrutura: nada
          foi reinterpretado.
        </p>
      </div>

      <div
        style={{
          background: "var(--color-bg-elevated)",
          borderRadius: 20,
          padding: 12,
          border: "0.5px solid var(--color-border-strong)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          ref={containerRef}
          onMouseMove={(e) => isDragging.current && handleMove(e.clientX)}
          onMouseDown={(e) => { isDragging.current = true; handleMove(e.clientX); }}
          onMouseUp={() => (isDragging.current = false)}
          onMouseLeave={() => (isDragging.current = false)}
          onTouchStart={() => (isDragging.current = true)}
          onTouchEnd={() => (isDragging.current = false)}
          onTouchMove={(e) => isDragging.current && handleMove(e.touches[0].clientX)}
          onKeyDown={handleKey}
          tabIndex={0}
          role="slider"
          aria-label="Comparar modelo e render — setas movem o divisor"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          className="spn-demo-frame"
          style={{
            position: "relative",
            borderRadius: 14,
            overflow: "hidden",
            cursor: "ew-resize",
            userSelect: "none",
            background: "var(--color-surface)",
            touchAction: "pan-y",
          }}
        >
          <Image
            src={sketchImg}
            alt="Imagem base — modelo SketchUp"
            fill
            draggable={false}
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 92vw, 936px"
            style={{
              objectFit: "cover",
              pointerEvents: "none",
              filter: "contrast(0.9) saturate(0.9) brightness(0.95) blur(0.4px)",
            }}
          />

          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: `inset(0 0 0 ${position}%)`,
            }}
          >
            <Image
              src={renderImg}
              alt="Resultado SpaceNode — render fotorrealista"
              fill
              draggable={false}
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 92vw, 936px"
              style={{
                objectFit: "cover",
                pointerEvents: "none",
                filter: "contrast(1.05) saturate(1.05)",
              }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${position}%`,
              width: 2,
              background: "#ffffff",
              transform: "translateX(-50%)",
              boxShadow: "0 0 10px rgba(255,255,255,0.5), 0 0 3px rgba(255,255,255,1)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#ffffff",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 4px 20px rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#1a1a1a" aria-hidden>
                <path d="M6 1L2 5L6 9" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#1a1a1a" aria-hidden>
                <path d="M4 1L8 5L4 9" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <span
            style={{
              position: "absolute",
              bottom: 14,
              left: 14,
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.75)",
              fontWeight: 600,
              textTransform: "uppercase",
              background: "var(--color-scrim)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              padding: "4px 8px",
              borderRadius: 4,
              pointerEvents: "none",
            }}
          >
            imagem base
          </span>
          <span
            style={{
              position: "absolute",
              bottom: 14,
              right: 14,
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.92)",
              fontWeight: 600,
              textTransform: "uppercase",
              background: "var(--color-scrim)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              padding: "4px 8px",
              borderRadius: 4,
              pointerEvents: "none",
            }}
          >
            resultado
          </span>
        </div>
      </div>

      <p
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          textAlign: "center",
          margin: "12px 0 24px",
          letterSpacing: "0.05em",
        }}
      >
        arraste para comparar
      </p>

      <div style={{ textAlign: "center" }}>
        <a href="/login?mode=signup" className="spn-demo-cta">
          Testar com meu projeto
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      <style jsx>{`
        .spn-demo {
          max-width: 960px;
          margin: 0 auto;
          padding: 88px 32px 48px;
        }
        .spn-demo-head {
          text-align: center;
          max-width: 600px;
          margin: 0 auto 40px;
        }
        .spn-demo-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-demo-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0;
        }
        .spn-demo-frame {
          aspect-ratio: 16 / 9;
        }
        .spn-demo-frame:focus-visible {
          outline: 2px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        .spn-demo-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          letter-spacing: -0.01em;
          white-space: nowrap;
          padding: 14px 28px;
          min-height: 52px;
        }
        .spn-demo-cta:focus-visible {
          outline: 2px solid var(--color-border-focus);
          outline-offset: 2px;
        }

        @media (max-width: 768px) {
          .spn-demo {
            padding: 64px 20px 40px;
          }
          .spn-demo-head {
            margin: 0 auto 28px;
          }
          .spn-demo-title {
            font-size: 24px;
          }
          .spn-demo-sub {
            font-size: 13px;
          }
          .spn-demo-frame {
            aspect-ratio: 4 / 3;
            border-radius: 12px;
          }
          .spn-demo-cta {
            width: 100%;
            padding: 16px 24px;
            font-size: 15px;
            min-height: 54px;
          }
        }
      `}</style>
    </section>
  );
}
