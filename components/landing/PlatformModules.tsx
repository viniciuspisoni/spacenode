import React from 'react'

// Ícones — mesmo desenho de components/app/sidebar-icons.tsx (viewBox 24×24,
// stroke 1.5, terminações arredondadas), em 20px para os cards de módulo.
const MSVG = ({ children }: { children: React.ReactNode }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    shapeRendering="geometricPrecision"
  >
    {children}
  </svg>
)
const IconRender = () => (
  <MSVG>
    <rect x="3" y="3" width="18" height="18" rx="2.6" />
    <circle cx="8.4" cy="8.4" r="1.5" />
    <path d="M21 14.5l-4.6-4-7.4 7" />
  </MSVG>
)
const IconSpaces = () => (
  <MSVG>
    <rect x="8" y="3" width="13" height="13" rx="2.2" />
    <path d="M16 21H5.2A2.2 2.2 0 0 1 3 18.8V8" />
  </MSVG>
)
const IconEdit = () => (
  <MSVG>
    <path d="M12.5 20H21" />
    <path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.2 18.8l-4 1 1-4L16.4 3.6z" />
  </MSVG>
)
const IconEnhance = () => (
  <MSVG>
    <path d="M8 3.5H4.5a1 1 0 0 0-1 1V8" />
    <path d="M16 3.5h3.5a1 1 0 0 1 1 1V8" />
    <path d="M20.5 16v3.5a1 1 0 0 1-1 1H16" />
    <path d="M3.5 16v3.5a1 1 0 0 0 1 1H8" />
    <path d="M9.5 12h5M12 9.5v5" />
  </MSVG>
)
const IconVideo = () => (
  <MSVG>
    <rect x="2.5" y="5.5" width="13.5" height="13" rx="2.4" />
    <path d="M16 10l5.5-3.2v10.4L16 14" />
  </MSVG>
)
const IconHistory = () => (
  <MSVG>
    <path d="M3.2 12a8.8 8.8 0 1 0 2.7-6.3" />
    <path d="M3 4.5V8h3.5" />
    <path d="M12 7.8v4.4l3 1.9" />
  </MSVG>
)

type ModuleStatus = 'active' | 'soon'

type Module = {
  Icon: () => React.ReactElement
  name: string
  desc: string
  status: ModuleStatus
}

const MODULES: Module[] = [
  {
    Icon: IconRender,
    name: 'renderizar',
    desc: 'Transforme estudos e modelos em imagens fotorrealistas com fidelidade geométrica.',
    status: 'active',
  },
  {
    Icon: IconSpaces,
    name: 'spaces',
    desc: 'Crie variações coerentes do mesmo projeto: novos ângulos, luzes, atmosferas e detalhes.',
    status: 'active',
  },
  {
    Icon: IconEdit,
    name: 'editar',
    desc: 'Faça ajustes pontuais sem recomeçar a imagem inteira.',
    status: 'active',
  },
  {
    Icon: IconEnhance,
    name: 'ampliar',
    desc: 'Aumente resolução, nitidez e qualidade final para apresentação.',
    status: 'active',
  },
  {
    Icon: IconVideo,
    name: 'animar',
    desc: 'Transforme imagens do projeto em vídeos curtos para apresentação e conteúdo.',
    status: 'active',
  },
  {
    Icon: IconHistory,
    name: 'histórico',
    desc: 'Acesse gerações anteriores, compare versões e mantenha o controle visual do projeto.',
    status: 'active',
  },
]

export function PlatformModules() {
  return (
    <section className="spn-modules">

      <div className="spn-modules-head">
        <div className="spn-modules-eyebrow">
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Plataforma
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-modules-title">
          módulos que acompanham o projeto inteiro.
        </h2>
        <p className="spn-modules-sub">
          Do primeiro estudo ao material final — tudo no mesmo lugar, com o mesmo controle.
        </p>
      </div>

      <div className="spn-modules-grid">
        {MODULES.map(({ Icon, name, desc, status }) => {
          const active = status === 'active'
          return (
            <div
              key={name}
              className={`spn-module-card${active ? '' : ' is-soon'}`}
            >
              <div className="spn-module-icon">
                <Icon />
              </div>

              <div className="spn-module-meta">
                <div className="spn-module-name-row">
                  <span className="spn-module-name">{name}</span>
                  {!active && (
                    <span className="spn-module-badge">em breve</span>
                  )}
                </div>
                <p className="spn-module-desc">{desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="spn-modules-cta">
        <a href="/login?mode=signup" className="spn-modules-cta-btn">
          Começar agora — 40 nodes grátis
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      <style jsx>{`
        .spn-modules {
          position: relative;
          padding: 96px 24px;
          max-width: 960px;
          margin: 0 auto;
        }
        /* luz ambiente sutil atrás dos cards — dá leitura ao vidro sem virar glow */
        .spn-modules::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(520px 300px at 18% 32%, rgba(255, 255, 255, 0.028), transparent 70%),
            radial-gradient(460px 280px at 82% 72%, rgba(255, 255, 255, 0.022), transparent 70%);
          pointer-events: none;
        }
        .spn-modules-head {
          text-align: center;
          margin-bottom: 56px;
        }
        .spn-modules-eyebrow {
          font-size: 10px; font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 16px;
          display: flex; align-items: center; justify-content: center;
          gap: 10px;
        }
        .spn-modules-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-modules-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0;
        }
        .spn-modules-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 14px;
        }
        .spn-module-card {
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 26px 24px;
          border-radius: var(--radius-lg);
          background: rgba(255, 255, 255, 0.035);
          border: 0.5px solid rgba(255, 255, 255, 0.08);
          -webkit-backdrop-filter: blur(16px) saturate(150%);
          backdrop-filter: blur(16px) saturate(150%);
          box-shadow:
            0 1px 1px rgba(0, 0, 0, 0.14),
            0 12px 32px -16px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          transition:
            transform var(--duration-slow) cubic-bezier(0.21, 0.6, 0.35, 1),
            background-color var(--duration-base) ease,
            border-color var(--duration-base) ease,
            box-shadow var(--duration-slow) ease;
        }
        /* reflexo hairline no topo — assinatura do vidro */
        .spn-module-card::before {
          content: '';
          position: absolute;
          top: 0; left: 12%; right: 12%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent);
          opacity: 0.7;
          transition: opacity var(--duration-base) ease, left var(--duration-slow) ease, right var(--duration-slow) ease;
        }
        /* sheen suave que desce do topo */
        .spn-module-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.012) 34%, transparent 58%);
          pointer-events: none;
          opacity: 0.75;
          transition: opacity var(--duration-base) ease;
        }
        .spn-module-card:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.13);
          box-shadow:
            0 1px 1px rgba(0, 0, 0, 0.14),
            0 20px 44px -18px rgba(0, 0, 0, 0.55);
        }
        .spn-module-card:hover::before { opacity: 1; left: 6%; right: 6%; }
        .spn-module-card:hover::after { opacity: 1; }
        .spn-module-card.is-soon { opacity: 0.55; }
        .spn-module-card.is-soon:hover { transform: none; }
        .spn-module-icon {
          width: 36px; height: 36px;
          border-radius: var(--radius-md);
          margin-bottom: 18px;
          display: flex; align-items: center; justify-content: center;
          color: var(--color-text-secondary);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.028));
          border: 0.5px solid rgba(255, 255, 255, 0.09);
          box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.1);
          transition: color var(--duration-base) ease, border-color var(--duration-base) ease;
        }
        .spn-module-card:hover .spn-module-icon {
          color: var(--color-text-primary);
          border-color: rgba(255, 255, 255, 0.14);
        }
        .spn-module-card.is-soon .spn-module-icon {
          color: var(--color-text-tertiary);
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-module-card,
          .spn-module-card::before,
          .spn-module-card::after,
          .spn-module-icon,
          .spn-modules-cta-btn { transition: none; }
          .spn-module-card:hover,
          .spn-modules-cta-btn:hover { transform: none; }
        }
        .spn-module-name-row {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 8px;
        }
        .spn-module-name {
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--color-text-primary);
        }
        .spn-module-badge {
          font-size: 8px; font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          background: var(--color-surface);
          border: 0.5px solid var(--color-border-strong);
          padding: 2px 7px;
          border-radius: 20px;
        }
        .spn-module-desc {
          font-size: 13px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
          letter-spacing: -0.005em;
        }
        .spn-modules-cta {
          text-align: center;
          margin-top: 40px;
        }
        /* CTA glass — sem verde, mesma linguagem dos pills da navbar */
        .spn-modules-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 22px;
          border-radius: var(--radius-full);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          text-decoration: none;
          color: var(--color-text-primary);
          background: rgba(255, 255, 255, 0.055);
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
          box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
          transition:
            transform var(--duration-base) cubic-bezier(0.21, 0.6, 0.35, 1),
            background-color var(--duration-base) ease,
            border-color var(--duration-base) ease;
        }
        .spn-modules-cta-btn:hover {
          background: rgba(255, 255, 255, 0.085);
          border-color: rgba(255, 255, 255, 0.16);
          transform: translateY(-1px);
        }
        .spn-modules-cta-btn:active { transform: translateY(0); }
        .spn-modules-cta-btn:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }

        @media (max-width: 768px) {
          .spn-modules {
            padding: 72px 20px;
          }
          .spn-modules-head {
            margin-bottom: 36px;
          }
          .spn-modules-title {
            font-size: 24px;
          }
          .spn-modules-sub {
            font-size: 13px;
          }
          .spn-modules-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .spn-module-card {
            padding: 20px 18px;
            flex-direction: row;
            gap: 16px;
          }
          .spn-module-icon {
            margin-bottom: 0;
            flex-shrink: 0;
          }
          .spn-module-meta {
            flex: 1;
            min-width: 0;
          }
          .spn-module-name-row {
            margin-bottom: 4px;
          }
          .spn-module-desc {
            font-size: 12.5px;
            line-height: 1.5;
          }
          .spn-modules-cta {
            margin-top: 28px;
          }
        }
      `}</style>
    </section>
  )
}
