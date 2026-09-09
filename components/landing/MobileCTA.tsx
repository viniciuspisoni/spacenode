'use client'

import { useEffect, useState } from 'react'

// Barra fixa de conversão no mobile — aparece depois do hero.
export function MobileCTA() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="spn-mcta spn-glass--chrome" data-visible={visible} aria-hidden={!visible}>
      <a href="/login?mode=signup" className="spn-mcta-btn">
        Testar grátis
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
      <p className="spn-mcta-note">80 nodes grátis · sem cartão · em português</p>

      <style jsx>{`
        .spn-mcta { display: none; }

        @media (max-width: 768px) {
          .spn-mcta {
            display: block;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 40;
            padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
            border: none;
            border-top: 0.5px solid var(--glass-line-strong);
            box-shadow: inset 0 0.5px 0 var(--glass-spec);
            transform: translateY(100%);
            opacity: 0;
            pointer-events: none;
            transition: transform 280ms var(--ease), opacity 280ms var(--ease);
          }
          .spn-mcta[data-visible='true'] {
            transform: translateY(0);
            opacity: 1;
            pointer-events: auto;
          }
        }

        .spn-mcta-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          min-height: 52px;
          padding: 15px 18px;
          border-radius: var(--r-inner);
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.01em;
          text-decoration: none;
        }
        .spn-mcta-btn:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        .spn-mcta-note {
          font-size: 10px;
          color: var(--color-text-tertiary);
          text-align: center;
          margin: 8px 0 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .spn-mcta { transition: none; }
        }
      `}</style>
    </div>
  )
}
