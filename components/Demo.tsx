"use client";

import { useState, useRef } from "react";

export default function Demo() {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newPos = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, newPos)));
  };

  return (
    <section style={{ maxWidth: 960, margin: "20px auto 0", padding: "0 32px" }}>
      {/* Caption */}
      <p
        style={{
          textAlign: "center",
          fontSize: 13,
          color: "var(--color-text-secondary)",
          letterSpacing: "-0.01em",
          marginBottom: 20,
        }}
      >
        De modelo simples para imagem pronta para apresentação
      </p>

      {/* Elevated wrapper */}
      <div
        style={{
          background: "var(--color-bg-elevated)",
          borderRadius: 20,
          padding: 12,
          boxShadow:
            "0 2px 4px rgba(0,0,0,0.12), 0 16px 48px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(255,255,255,0.06)",
        }}
      >
        <div
          ref={containerRef}
          onMouseMove={(e) => isDragging.current && handleMove(e.clientX)}
          onMouseDown={() => (isDragging.current = true)}
          onMouseUp={() => (isDragging.current = false)}
          onMouseLeave={() => (isDragging.current = false)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX)}
          style={{
            position: "relative",
            aspectRatio: "16/9",
            borderRadius: 14,
            overflow: "hidden",
            cursor: "ew-resize",
            userSelect: "none",
            background: "var(--color-surface)",
          }}
        >
          {/* Before — visually softened */}
          <img
            src="/demo-sketch.jpg"
            alt="Sketch SketchUp"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
              filter: "contrast(0.9) saturate(0.9) brightness(0.95) blur(0.4px)",
            }}
          />

          {/* After — crisp and vibrant */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: `inset(0 0 0 ${position}%)`,
            }}
          >
            <img
              src="/demo-render.jpg"
              alt="Render fotorrealista"
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                pointerEvents: "none",
                filter: "contrast(1.05) saturate(1.05)",
              }}
            />
          </div>

          {/* Divider line */}
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
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#1a1a1a">
                <path d="M6 1L2 5L6 9" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#1a1a1a">
                <path d="M4 1L8 5L4 9" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Labels */}
          <span
            style={{
              position: "absolute",
              bottom: 14,
              left: 14,
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.4)",
              fontWeight: 600,
              textTransform: "uppercase",
              pointerEvents: "none",
            }}
          >
            sketch
          </span>
          <span
            style={{
              position: "absolute",
              bottom: 14,
              right: 14,
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.85)",
              fontWeight: 600,
              textTransform: "uppercase",
              pointerEvents: "none",
            }}
          >
            render
          </span>
        </div>
      </div>

      {/* Drag hint */}
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

      {/* CTA */}
      <div style={{ textAlign: "center" }}>
        <a
          href="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 12,
            padding: "14px 28px",
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          Testar com meu projeto
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </section>
  );
}
