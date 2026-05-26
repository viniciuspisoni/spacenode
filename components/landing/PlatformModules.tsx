import React from 'react'

const IconSpaces = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
  </svg>
)
const IconRender = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const IconEnhance = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.88 5.47L19 10l-5.12 1.53L12 17l-1.88-5.47L5 10l5.12-1.53L12 3z"/>
    <path d="M5 3l.94 2.06L8 6l-2.06.94L5 9l-.94-2.06L2 6l2.06-.94L5 3z"/>
    <path d="M19 13l.94 2.06L22 16l-2.06.94L19 19l-.94-2.06L16 16l2.06-.94L19 13z"/>
  </svg>
)
const IconEdit = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IconVideo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2"/>
  </svg>
)
const IconText = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 7 4 4 20 4 20 7"/>
    <line x1="9" y1="20" x2="15" y2="20"/>
    <line x1="12" y1="4" x2="12" y2="20"/>
  </svg>
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
    Icon: IconSpaces,
    name: 'spaces',
    desc: 'Cada projeto, um Space. A Vista Mestre define o DNA visual — variações geradas preservam proporções, geometria e identidade do projeto.',
    status: 'active',
  },
  {
    Icon: IconRender,
    name: 'renderizar',
    desc: 'Transforme sketches e modelos 3D em imagens fotorrealistas em segundos. Sem plugins, sem GPU.',
    status: 'active',
  },
  {
    Icon: IconEnhance,
    name: 'ampliar',
    desc: 'Faça upload de um render existente e refine realismo, iluminação e materiais com IA.',
    status: 'active',
  },
  {
    Icon: IconEdit,
    name: 'editar',
    desc: 'Altere sofás, fachadas, cores e materiais diretamente na imagem, sem re-renderizar.',
    status: 'active',
  },
  {
    Icon: IconVideo,
    name: 'animar',
    desc: 'Anime renders estáticos para walkthroughs e apresentações cinematográficas ao cliente.',
    status: 'active',
  },
  {
    Icon: IconText,
    name: 'texto para imagem',
    desc: 'Gere conceitos visuais completos a partir de uma descrição em texto. Do briefing à imagem.',
    status: 'soon',
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
          Tudo que seu projeto precisa para impressionar.
        </h2>
        <p className="spn-modules-sub">
          Um ecossistema visual completo para arquitetura e interiores — em constante expansão.
        </p>
      </div>

      <div className="spn-modules-grid">
        {MODULES.map(({ Icon, name, desc, status }) => {
          const active = status === 'active'
          return (
            <div
              key={name}
              className="spn-module-card"
              style={{
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                borderTop: active ? '2px solid var(--color-accent-green)' : '0.5px solid var(--color-border)',
                opacity: active ? 1 : 0.6,
              }}
            >
              <div
                className="spn-module-icon"
                style={{
                  background: active ? 'rgba(48,180,108,0.10)' : 'var(--color-surface)',
                  color: active ? 'var(--color-accent-green)' : 'var(--color-text-tertiary)',
                }}
              >
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
        <a
          href="/login"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
            color: 'var(--color-accent-green)', textDecoration: 'none',
          }}
        >
          Comece com Renderizar, gratuitamente
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      <style jsx>{`
        .spn-modules {
          padding: 96px 24px;
          max-width: 960px;
          margin: 0 auto;
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
          gap: 12px;
        }
        .spn-module-card {
          padding: 24px 22px;
          border-radius: 14px;
          transition: opacity 0.2s;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .spn-module-icon {
          width: 36px; height: 36px;
          border-radius: 9px;
          margin-bottom: 16px;
          display: flex; align-items: center; justify-content: center;
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
          color: var(--color-text-tertiary);
          line-height: 1.6;
          margin: 0;
          letter-spacing: -0.005em;
        }
        .spn-modules-cta {
          text-align: center;
          margin-top: 40px;
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
            padding: 18px 18px;
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
