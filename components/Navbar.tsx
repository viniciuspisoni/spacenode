'use client';

import { useState, useEffect } from 'react';
import { Logo } from './brand';

const LINKS = [
  { href: '#produto',       label: 'PRODUTO'       },
  { href: '#como-funciona', label: 'COMO FUNCIONA' },
  { href: '#planos',        label: 'PREÇOS'        },
  { href: '#faq',           label: 'FAQ'           },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'color-mix(in srgb, var(--color-bg) 85%, transparent)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '0.5px solid var(--color-border)',
        }}
        className="spn-nav"
      >
        <Logo symbolSize={48} />

        <div style={{ display: 'flex', gap: 36 }} className="nav-links">
          {LINKS.map(l => (
            <a
              key={l.href}
              href={l.href}
              style={{
                fontSize: 10,
                letterSpacing: '0.18em',
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                fontWeight: 500,
                transition: 'color 0.2s',
              }}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="nav-actions">
          <a href="/login" className="nav-pill nav-pill-ghost">
            Entrar
          </a>
          <a href="/login" className="nav-pill nav-pill-cta">
            Começar agora
          </a>
        </div>

        {/* Mobile: hamburger */}
        <button
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="nav-burger"
          style={{
            width: 44,
            height: 44,
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-primary)',
            padding: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            {open ? (
              <>
                <path d="M5 5l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M17 5L5 17"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M3 7h16"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M3 15h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`nav-drawer ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="nav-drawer-inner">
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '20px 4px',
                  fontSize: 22,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text-primary)',
                  textDecoration: 'none',
                  borderBottom: '0.5px solid var(--color-border)',
                  textTransform: 'none',
                }}
              >
                {l.label.toLowerCase()}
              </a>
            ))}
          </nav>

          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href="/login"
              onClick={() => setOpen(false)}
              className="drawer-cta drawer-cta-primary"
            >
              Começar agora
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <a
              href="/login"
              onClick={() => setOpen(false)}
              className="drawer-cta drawer-cta-ghost"
            >
              Já tenho conta
            </a>
          </div>

          <p
            style={{
              marginTop: 28,
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              letterSpacing: '0.02em',
              textAlign: 'center',
            }}
          >
            40 nodes grátis · sem cartão de crédito
          </p>
        </div>
      </div>

      <style jsx>{`
        .spn-nav { padding: 18px 40px; }
        .nav-burger { display: none !important; }

        .nav-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 0 16px;
          border-radius: var(--radius-full);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: -0.01em;
          text-decoration: none;
          transition:
            transform var(--duration-base) cubic-bezier(0.21, 0.6, 0.35, 1),
            background-color var(--duration-base) ease,
            border-color var(--duration-base) ease,
            box-shadow var(--duration-base) ease,
            color var(--duration-base) ease;
        }
        .nav-pill:focus-visible {
          /* landing é sempre dark; --color-border-focus (0.28) não atinge os 3:1 do WCAG 1.4.11 */
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }

        /* "Entrar" — vidro escuro discreto */
        .nav-pill-ghost {
          color: var(--color-text-secondary);
          background: rgba(255, 255, 255, 0.055);
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
          box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
        }
        .nav-pill-ghost:hover {
          color: var(--color-text-primary);
          background: rgba(255, 255, 255, 0.085);
          border-color: rgba(255, 255, 255, 0.16);
          transform: translateY(-1px);
        }

        /* "Começar agora" — vidro branco, CTA principal */
        .nav-pill-cta {
          color: #0b0b0c;
          background: linear-gradient(180deg, #ffffff 0%, #ececf0 100%);
          border: 0.5px solid rgba(255, 255, 255, 0.65);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 1px 2px rgba(0, 0, 0, 0.35),
            0 6px 18px -8px rgba(0, 0, 0, 0.5);
        }
        .nav-pill-cta:hover {
          color: #0b0b0c;
          transform: translateY(-1px);
          background: linear-gradient(180deg, #ffffff 0%, #f2f2f6 100%);
          box-shadow:
            inset 0 1px 0 #ffffff,
            0 2px 4px rgba(0, 0, 0, 0.35),
            0 10px 24px -8px rgba(0, 0, 0, 0.55);
        }
        /* depois dos :hover para vencer o empate de especificidade na cascata */
        .nav-pill:active { transform: translateY(0); }

        @media (prefers-reduced-motion: reduce) {
          .nav-pill { transition: none; }
          .nav-pill:hover { transform: none; }
        }

        @media (max-width: 768px) {
          .spn-nav { padding: 14px 20px; }
          .nav-links, .nav-actions { display: none !important; }
          .nav-burger { display: inline-flex !important; }
        }

        .nav-drawer {
          position: fixed;
          inset: 0;
          z-index: 45; /* below the sticky nav (50) so the close toggle stays clickable */
          background: var(--color-bg);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity var(--duration-base) ease, visibility var(--duration-base) ease;
          overflow-y: auto;
        }
        .nav-drawer.is-open {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        .nav-drawer-inner {
          padding: 80px 20px 40px;
          max-width: 480px;
          margin: 0 auto;
        }

        @media (min-width: 769px) {
          .nav-drawer { display: none; }
        }

        .drawer-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 52px;
          padding: 15px 24px;
          border-radius: var(--radius-md);
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.01em;
          text-decoration: none;
        }
        .drawer-cta:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }
        .drawer-cta-primary {
          color: #0b0b0c;
          background: linear-gradient(180deg, #ffffff 0%, #ececf0 100%);
          border: 0.5px solid rgba(255, 255, 255, 0.65);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 1px 2px rgba(0, 0, 0, 0.35);
        }
        .drawer-cta-primary:hover { color: #0b0b0c; }
        .drawer-cta-ghost {
          font-size: 14px;
          color: var(--color-text-secondary);
          background: rgba(255, 255, 255, 0.05);
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
          box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
        }
        .drawer-cta-ghost:hover { color: var(--color-text-primary); }

        a:hover { color: var(--color-text-primary); }
      `}</style>
    </>
  );
}
