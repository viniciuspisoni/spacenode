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
    <section style={{ maxWidth: 880, margin: "20px auto 0", padding: "0 40px" }}>
      <div
        style={{
          background: "var(--color-bg-elevated)",
          borderRadius: 20,
          padding: 12,
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
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
            background: "#f2f2f7",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f2f2f7",
            }}
          >
            <svg
              viewBox="0 0 400 225"
              style={{ width: "55%", opacity: 0.85 }}
            >
              <polygon
                points="80,120 200,60 320,120 320,200 80,200"
                fill="#ffffff"
                stroke="#888"
                strokeWidth="0.8"
              />
              <rect
                x="120"
                y="140"
                width="40"
                height="60"
                fill="#d4d4d4"
                stroke="#888"
                strokeWidth="0.5"
              />
              <rect
                x="240"
                y="140"
                width="40"
                height="60"
                fill="#d4d4d4"
                stroke="#888"
                strokeWidth="0.5"
              />
              <rect x="185" y="170" width="30" height="30" fill="#555" />
            </svg>
            <span
              style={{
                position: "absolute",
                bottom: 16,
                left: 16,
                fontSize: 10,
                letterSpacing: "0.22em",
                background: "rgba(255,255,255,0.95)",
                color: "#1a1a1a",
                padding: "5px 12px",
                borderRadius: 20,
                fontWeight: 500,
                textTransform: "uppercase",
              }}
            >
              sketch
            </span>
          </div>

          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, #c9a876 0%, #6b4d2a 100%)",
              clipPath: `inset(0 0 0 ${position}%)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(135deg, rgba(255,220,160,0.25) 0%, rgba(60,35,15,0.55) 100%)",
              }}
            />
            <span
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                fontSize: 10,
                letterSpacing: "0.22em",
                background: "rgba(255,255,255,0.95)",
                color: "#1a1a1a",
                padding: "5px 12px",
                borderRadius: 20,
                fontWeight: 500,
                textTransform: "uppercase",
              }}
            >
              render · 6s
            </span>
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
              boxShadow: "0 0 12px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#ffffff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
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
        </div>
      </div>
      <p
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          textAlign: "center",
          margin: "14px 0 0",
          letterSpacing: "0.05em",
        }}
      >
        arraste para comparar
      </p>
    </section>
  );
}
