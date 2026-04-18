"use client";

import Logo from "./Logo";

export default function Navbar() {
  const scrollToWaitlist = () => {
    const el = document.getElementById("waitlist");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 40px",
        background: "color-mix(in srgb, var(--color-bg) 85%, transparent)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "0.5px solid var(--color-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo size={20} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.22em",
            color: "var(--color-text-primary)",
          }}
        >
          SPACENODE
        </span>
      </div>

      <div style={{ display: "flex", gap: 36 }} className="nav-links">
        <a
          href="#como-funciona"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            fontWeight: 500,
            transition: "color 0.2s",
          }}
        >
          COMO FUNCIONA
        </a>
        <a
          href="#galeria"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            fontWeight: 500,
            transition: "color 0.2s",
          }}
        >
          GALERIA
        </a>
        <a
          href="#planos"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            fontWeight: 500,
            transition: "color 0.2s",
          }}
        >
          PLANOS
        </a>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <a
          href="#entrar"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          ENTRAR
        </a>
        <button
          onClick={scrollToWaitlist}
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Entrar no beta
        </button>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .nav-links {
            display: none !important;
          }
        }
        a:hover {
          color: var(--color-text-primary) !important;
        }
      `}</style>
    </nav>
  );
}
