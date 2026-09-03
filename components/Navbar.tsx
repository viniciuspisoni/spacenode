'use client';

import { useState, useEffect, useRef } from 'react';
import { Logo } from './brand';

// '#sketchup' é a faixa do plugin na própria landing; o link "Conhecer o
// plugin" de lá leva pra /sketchup. Mantendo tudo como âncora, o scroll-spy
// e o drawer seguem funcionando sem exceção.
const LINKS = [
  { href: '#produto',       label: 'PRODUTO'       },
  { href: '#como-funciona', label: 'COMO FUNCIONA' },
  { href: '#sketchup',      label: 'SKETCHUP'      },
  { href: '#planos',        label: 'PREÇOS'        },
  { href: '#faq',           label: 'FAQ'           },
];

/** Deslocamento máximo do texto em direção ao cursor. */
const MAGNET_PX = 1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  /** Seção visível no scroll. Nunca preenchida — só o texto clareia. */
  const [active, setActive] = useState<string | null>(null);

  /** Reflexo e magnético só existem com cursor real e movimento permitido. */
  const pointerOkRef = useRef(false);

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

  // Estado "rolado": a barra encolhe um pouco e o fundo fica mais opaco.
  // Leitura em rAF (scroll passivo) e histerese 12/4px para não piscar.
  useEffect(() => {
    let raf = 0;
    let last = false;
    const read = () => {
      raf = 0;
      const next = last ? window.scrollY > 4 : window.scrollY > 12;
      if (next !== last) { last = next; setScrolled(next); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read(); // reload no meio da página já entra no estado certo
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { pointerOkRef.current = fine.matches && !still.matches; };
    sync();
    fine.addEventListener('change', sync);
    still.addEventListener('change', sync);
    return () => {
      fine.removeEventListener('change', sync);
      still.removeEventListener('change', sync);
    };
  }, []);

  // Scroll-spy: marca a seção que cruza a faixa central do viewport.
  useEffect(() => {
    const sections = LINKS
      .map(l => document.getElementById(l.href.slice(1)))
      .filter((el): el is HTMLElement => el !== null);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      entries => {
        const entering = entries.filter(e => e.isIntersecting);
        if (entering.length) {
          setActive(`#${entering[entering.length - 1].target.id}`);
        } else {
          // nenhuma seção na faixa (ex.: hero) — limpa se o ativo foi quem saiu
          const left = new Set(entries.map(e => `#${e.target.id}`));
          setActive(prev => (prev && left.has(prev) ? null : prev));
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Reflexo e magnético saem de duas custom properties escritas direto no
  // elemento: sem estado React, sem rAF. A suavidade vem da transition do CSS,
  // que persegue o alvo enquanto o cursor anda.
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!pointerOkRef.current) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--tx', `${(clamp((px - 0.5) * 2, -1, 1) * MAGNET_PX).toFixed(2)}px`);
  };

  const onPointerLeave = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty('--tx', '0px');
  };

  // A superfície da barra vai inline porque nenhum styled-jsx desta landing
  // entra na folha que bloqueia o paint (o CSS só é injetado na hidratação) —
  // assim a barra já nasce escura e integrada, como na versão original.
  // O que varia por breakpoint (altura, paddings) fica no CSS.
  // No topo da página não há nada atrás da barra além do fundo claro do body
  // (#fafafa): qualquer transparência ali vira cinza, não vidro — medimos
  // rgb(64,64,64) com 78%. Então a barra nasce preta e opaca, e só vira vidro
  // depois que existe conteúdo passando por baixo.
  const glass = 'blur(20px) saturate(160%)';
  const navStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: scrolled
      ? 'color-mix(in srgb, var(--color-bg) 92%, transparent)'
      : 'var(--color-bg)',
    backdropFilter: scrolled ? glass : 'none',
    WebkitBackdropFilter: scrolled ? glass : 'none',
    borderBottom: `0.5px solid rgba(255, 255, 255, ${scrolled ? 0.1 : 0.06})`,
    // reflexo interno muito discreto, só a linha de topo
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.045)',
  };

  return (
    <>
      {/* spn-dark: a barra fica sempre escura sobre a landing light — mesma
          linguagem das faixas hero/produto/galeria. */}
      <nav className={`spn-nav spn-dark ${scrolled ? 'is-scrolled' : ''}`} style={navStyle}>
        <span className="nav-logo">
          <Logo symbolSize={48} />
        </span>

        <div className="nav-links">
          {LINKS.map(l => (
            <a
              key={l.href}
              href={l.href}
              className={`nav-link ${active === l.href ? 'is-active' : ''}`}
              aria-current={active === l.href ? 'true' : undefined}
              onPointerMove={onPointerMove}
              onPointerLeave={onPointerLeave}
            >
              <span className="nav-link-label">{l.label}</span>
            </a>
          ))}
        </div>

        <div className="nav-actions">
          <a href="/login" className="nav-pill nav-pill-ghost">
            Entrar
          </a>
          <a
            href="/login?mode=signup"
            className="nav-pill nav-pill-cta"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
          >
            Testar grátis
          </a>
        </div>

        {/* Mobile: hamburger */}
        <button
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="nav-burger"
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
        className={`nav-drawer spn-dark ${open ? 'is-open' : ''}`}
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
              href="/login?mode=signup"
              onClick={() => setOpen(false)}
              className="drawer-cta drawer-cta-primary"
            >
              Testar grátis
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
            80 nodes grátis · sem cartão · em português
          </p>
        </div>
      </div>

      <style jsx>{`
        /* ── Barra: reta, de ponta a ponta, integrada à página ────────────── */
        /* A superfície vai inline (ver comentário no JSX); aqui fica só a
           métrica por breakpoint e a transição que anima aquelas mudanças. */
        .spn-nav {
          height: 84px;
          padding: 0 40px;
          transition:
            height var(--duration-slow) cubic-bezier(0.22, 1, 0.36, 1),
            background-color var(--duration-slow) ease,
            border-color var(--duration-slow) ease;
        }
        .spn-nav.is-scrolled { height: 72px; }
        .nav-burger { display: none !important; }

        /* ── Logo ─────────────────────────────────────────────────────────── */
        .nav-logo {
          display: inline-flex;
          align-items: center;
          flex: 0 0 auto;
        }
        /* O Logo vem de outro componente: alcançamos suas partes via :global. */
        .nav-logo :global(svg) {
          transition: transform var(--duration-slow) cubic-bezier(0.34, 1.4, 0.64, 1);
        }
        .nav-logo :global(span > span) {
          display: inline-block;
          transition: transform var(--duration-slow) cubic-bezier(0.34, 1.4, 0.64, 1);
        }
        .nav-logo:hover :global(svg) { transform: scale(1.06) rotate(-1.5deg); }
        .nav-logo:hover :global(span > span) { transform: translateX(1px); }

        /* ── Links: o vidro mora aqui, e só no hover ──────────────────────── */
        /* padding 12 + gap 12 reproduz os 36px entre textos da barra original. */
        .nav-links {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 0 1 auto;
        }
        .nav-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          height: 34px;
          padding: 0 12px;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 500;
          color: var(--color-text-secondary);
          text-decoration: none;
          white-space: nowrap;
          border-radius: var(--radius-full);
          transition: color var(--duration-base) ease;
        }
        /* Painel de vidro com a MESMA superfície do "Entrar" (.nav-pill-ghost):
           mesmo fundo, mesma borda, mesmo brilho de topo e mesmo blur — só que
           some por completo fora do hover. O reflexo que segue --mx fica por
           cima, como 1ª camada do background. */
        .nav-link::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background:
            radial-gradient(
              44px circle at var(--mx, 50%) 50%,
              rgba(255, 255, 255, 0.1) 0%,
              rgba(255, 255, 255, 0) 72%
            ),
            rgba(255, 255, 255, 0.055);
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.09);
          opacity: 0;
          pointer-events: none;
          transition: opacity var(--duration-base) ease;
        }
        .nav-link:hover::before,
        .nav-link:focus-visible::before {
          opacity: 1;
          /* só ligamos o blur no hover: fora dele não há custo de composição */
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          backdrop-filter: blur(12px) saturate(140%);
        }
        .nav-link:hover,
        .nav-link:focus-visible { color: var(--color-text-primary); }

        /* Texto acompanha o cursor no máximo 1px; o <a> não se move. */
        .nav-link-label {
          position: relative;
          display: inline-block;
          transform: translateX(var(--tx, 0px));
          transition: transform var(--duration-base) cubic-bezier(0.25, 0.1, 0.25, 1);
        }

        /* Seção ativa: só o texto clareia, nunca um fundo permanente. */
        .nav-link.is-active { color: var(--color-text-primary); }

        .nav-link:focus-visible {
          /* landing é sempre dark; --color-border-focus (0.28) não atinge os 3:1 do WCAG 1.4.11 */
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }

        /* ── CTAs ─────────────────────────────────────────────────────────── */
        .nav-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
        }
        .nav-pill {
          position: relative;
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
          white-space: nowrap;
          transition:
            background-color var(--duration-base) ease,
            border-color var(--duration-base) ease,
            color var(--duration-base) ease;
        }
        .nav-pill:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }

        /* "Entrar" — vidro escuro discreto */
        .nav-pill-ghost {
          color: var(--color-text-secondary);
          background: rgba(255, 255, 255, 0.055);
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          backdrop-filter: blur(12px) saturate(140%);
          box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.09);
        }
        .nav-pill-ghost:hover {
          color: var(--color-text-primary);
          background: rgba(255, 255, 255, 0.085);
          border-color: rgba(255, 255, 255, 0.16);
        }

        /* "Testar grátis" — claro e de alto contraste; ganha só um reflexo
           líquido que segue o cursor no hover. */
        .nav-pill-cta {
          color: #0b0b0c;
          background: linear-gradient(180deg, #ffffff 0%, #ececf0 100%);
          border: 0.5px solid rgba(255, 255, 255, 0.65);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 1px 2px rgba(0, 0, 0, 0.28);
          overflow: hidden;
        }
        .nav-pill-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(
            56px circle at var(--mx, 50%) 50%,
            rgba(255, 255, 255, 0.9) 0%,
            rgba(255, 255, 255, 0) 70%
          );
          opacity: 0;
          pointer-events: none;
          transition: opacity var(--duration-base) ease;
        }
        .nav-pill-cta:hover::before { opacity: 1; }
        .nav-pill-cta:hover { color: #0b0b0c; }

        /* ── Reduced motion ───────────────────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .spn-nav,
          .nav-link,
          .nav-link::before,
          .nav-link-label,
          .nav-pill,
          .nav-pill-cta::before,
          .nav-logo :global(svg),
          .nav-logo :global(span > span) {
            transition: none;
          }
          /* o pointermove nem roda aqui; isto trava o texto por garantia */
          .nav-link-label { transform: none; }
          .nav-logo:hover :global(svg) { transform: none; }
          .nav-logo:hover :global(span > span) { transform: none; }
        }

        /* ── Responsivo ───────────────────────────────────────────────────── */
        /* Menu central + CTAs já colidiam em 768px na barra original: o
           hambúrguer precisa entrar antes. */
        @media (max-width: 900px) {
          .spn-nav { height: 76px; padding: 0 20px; }
          .spn-nav.is-scrolled { height: 68px; }
          .nav-links, .nav-actions { display: none !important; }
          .nav-burger { display: inline-flex !important; }
        }

        /* ── Hambúrguer ───────────────────────────────────────────────────── */
        .nav-burger {
          width: 44px;
          height: 44px;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--radius-full);
          cursor: pointer;
          color: var(--color-text-primary);
          padding: 0;
        }
        .nav-burger:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }

        /* ── Drawer ───────────────────────────────────────────────────────── */
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
          padding: 96px 20px 40px;
          max-width: 480px;
          margin: 0 auto;
        }

        @media (min-width: 901px) {
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

      {/* Âncoras (#produto, #planos…) não podem parar embaixo da barra. */}
      <style jsx global>{`
        html { scroll-padding-top: 88px; }
        @media (max-width: 900px) {
          html { scroll-padding-top: 80px; }
        }
      `}</style>
    </>
  );
}
