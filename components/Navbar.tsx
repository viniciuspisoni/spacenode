'use client';

import { useState, useEffect } from 'react';
import { Logo } from './brand';

const LINKS = [
  { href: '#como-funciona', label: 'COMO FUNCIONA' },
  { href: '#galeria',       label: 'GALERIA'       },
  { href: '#planos',        label: 'PLANOS'        },
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
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                fontWeight: 500,
                transition: 'color 0.2s',
              }}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }} className="nav-actions">
          <a
            href="/login"
            style={{
              fontSize: 10,
              letterSpacing: '0.18em',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            ENTRAR
          </a>
          <a
            href="/login"
            style={{
              background: 'var(--color-text-primary)',
              color: 'var(--color-bg)',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Testar agora
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
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'var(--color-text-primary)',
                color: 'var(--color-bg)',
                borderRadius: 12,
                padding: '16px 24px',
                fontSize: 15,
                fontWeight: 500,
                textDecoration: 'none',
                letterSpacing: '-0.01em',
                minHeight: 52,
              }}
            >
              Testar agora
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <a
              href="/login"
              onClick={() => setOpen(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '15px 24px',
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                letterSpacing: '-0.01em',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 12,
                minHeight: 52,
              }}
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

        @media (max-width: 768px) {
          .spn-nav { padding: 14px 20px; }
          .nav-links, .nav-actions { display: none !important; }
          .nav-burger { display: inline-flex !important; }
        }

        .nav-drawer {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: var(--color-bg);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.18s ease;
          overflow-y: auto;
        }
        .nav-drawer.is-open {
          opacity: 1;
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

        a:hover { color: var(--color-text-primary); }
      `}</style>
    </>
  );
}
