'use client'

import {
  isLaunchOfferOpen,
  launchOfferDeadlineLabel,
  LAUNCH_OFFER_HEADLINE,
} from '@/lib/launch-offer'

/**
 * Faixa da campanha de lançamento no topo da landing.
 *
 * Fica no fluxo normal (acima da Navbar sticky): rola junto e libera o topo
 * para a navegação depois do primeiro scroll, em vez de roubar altura fixa da
 * viewport no mobile.
 */
export function LaunchOfferBanner() {
  if (!isLaunchOfferOpen()) return null

  return (
    <a href="#planos" className="spn-launch-banner">
      <span className="spn-launch-dot" />
      <span className="spn-launch-label">{LAUNCH_OFFER_HEADLINE}</span>
      <span className="spn-launch-sep">·</span>
      <span className="spn-launch-main">
        <strong>50% de desconto</strong> na primeira mensalidade
      </span>
      <span className="spn-launch-sep spn-launch-hide-sm">·</span>
      <span className="spn-launch-deadline spn-launch-hide-sm">
        até {launchOfferDeadlineLabel()}
      </span>
      <span className="spn-launch-cta">
        Ver planos
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>

      <style jsx>{`
        .spn-launch-banner {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          padding: 11px 20px;
          text-decoration: none;
          background: var(--color-accent-green-bg);
          border-bottom: 0.5px solid var(--color-accent-green-border);
          color: var(--color-text-primary);
          font-size: 12.5px;
          letter-spacing: -0.005em;
          transition: background var(--duration-fast) ease;
        }
        .spn-launch-banner:hover {
          background: var(--color-accent-green-bg);
          filter: brightness(1.25);
        }
        .spn-launch-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--color-accent-green);
          box-shadow: 0 0 8px var(--color-accent-green-glow);
          flex-shrink: 0;
        }
        .spn-launch-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-accent-green);
        }
        .spn-launch-sep {
          color: var(--color-text-quaternary);
        }
        .spn-launch-main strong {
          font-weight: 500;
        }
        .spn-launch-deadline {
          color: var(--color-text-tertiary);
        }
        .spn-launch-cta {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-weight: 500;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        @media (max-width: 640px) {
          .spn-launch-banner {
            padding: 10px 16px;
            gap: 6px;
            font-size: 12px;
          }
          .spn-launch-hide-sm {
            display: none;
          }
        }
      `}</style>
    </a>
  )
}
