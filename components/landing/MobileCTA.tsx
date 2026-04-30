"use client";

export function MobileCTA() {
  return (
    <>
      <div className="mobile-cta-bar">
        <a
          href="/login"
          style={{
            display: "block",
            width: "100%",
            padding: "14px",
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 500,
            textAlign: "center",
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          Começar grátis →
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
          12 nodes grátis · sem cartão de crédito
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
            padding: 16px 20px 24px;
            background: var(--color-bg);
            border-top: 0.5px solid var(--color-border-strong);
            z-index: 100;
          }
        }
      `}</style>
    </>
  );
}
