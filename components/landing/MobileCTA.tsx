"use client";

import { useEffect, useState } from "react";

export function MobileCTA() {
  const [visible, setVisible] = useState(false);

  // Show after user scrolls past the hero (~ first viewport)
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div
        className="mobile-cta-bar"
        data-visible={visible}
        aria-hidden={!visible}
      >
        <a
          href="/login"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "15px 18px",
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 500,
            textAlign: "center",
            textDecoration: "none",
            letterSpacing: "-0.01em",
            minHeight: 52,
          }}
        >
          Começar agora
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <p
          style={{
            fontSize: 10,
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            margin: "8px 0 0",
            letterSpacing: "0.01em",
          }}
        >
          40 nodes grátis · sem cartão de crédito
        </p>
      </div>

      <style jsx>{`
        .mobile-cta-bar {
          display: none;
        }
        @media (max-width: 768px) {
          .mobile-cta-bar {
            display: block;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
            background: color-mix(in srgb, var(--color-bg) 92%, transparent);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 0.5px solid var(--color-border-strong);
            z-index: 40;
            transform: translateY(100%);
            opacity: 0;
            transition: transform 0.28s ease, opacity 0.28s ease;
            pointer-events: none;
          }
          .mobile-cta-bar[data-visible="true"] {
            transform: translateY(0);
            opacity: 1;
            pointer-events: auto;
          }
        }
      `}</style>
    </>
  );
}
