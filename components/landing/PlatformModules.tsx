import React from 'react'

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
    Icon: IconRender,
    name: 'Renderizar Imagem',
    desc: 'Transforme sketches e modelos 3D em imagens fotorrealistas em segundos. Sem plugins, sem GPU.',
    status: 'active',
  },
  {
    Icon: IconEnhance,
    name: 'Melhorar Imagem',
    desc: 'Faça upload de um render existente e refine realismo, iluminação e materiais com IA.',
    status: 'soon',
  },
  {
    Icon: IconEdit,
    name: 'Editar Imagem',
    desc: 'Altere sofás, fachadas, cores e materiais diretamente na imagem, sem re-renderizar.',
    status: 'soon',
  },
  {
    Icon: IconVideo,
    name: 'Gerar Vídeo',
    desc: 'Anime renders estáticos para walkthroughs e apresentações cinematográficas ao cliente.',
    status: 'soon',
  },
  {
    Icon: IconText,
    name: 'Texto para Imagem',
    desc: 'Gere conceitos visuais completos a partir de uma descrição em texto. Do briefing à imagem.',
    status: 'soon',
  },
]

export function PlatformModules() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{
          fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
          textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Plataforma
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 style={{
          fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em',
          lineHeight: 1.2, marginBottom: 10, color: 'var(--color-text-primary)',
        }}>
          Tudo que seu projeto precisa para impressionar.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em', lineHeight: 1.6 }}>
          Um ecossistema visual completo para arquitetura e interiores — em constante expansão.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 12,
      }}>
        {MODULES.map(({ Icon, name, desc, status }) => {
          const active = status === 'active'
          return (
            <div
              key={name}
              style={{
                padding: '24px 22px',
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                borderTop: active ? '2px solid var(--color-accent-green)' : '0.5px solid var(--color-border)',
                borderRadius: 14,
                opacity: active ? 1 : 0.55,
                transition: 'opacity 0.2s',
                position: 'relative' as const,
              }}
            >
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 9, marginBottom: 16,
                background: active ? 'rgba(48,180,108,0.10)' : 'var(--color-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: active ? 'var(--color-accent-green)' : 'var(--color-text-tertiary)',
              }}>
                <Icon />
              </div>

              {/* Name + badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
                  color: 'var(--color-text-primary)',
                }}>
                  {name}
                </span>
                {!active && (
                  <span style={{
                    fontSize: 8, fontWeight: 600, letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const,
                    color: 'var(--color-text-tertiary)',
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border-strong)',
                    padding: '2px 7px', borderRadius: 20,
                  }}>
                    em breve
                  </span>
                )}
              </div>

              {/* Description */}
              <p style={{
                fontSize: 12, color: 'var(--color-text-tertiary)',
                lineHeight: 1.65, margin: 0, letterSpacing: '-0.005em',
              }}>
                {desc}
              </p>
            </div>
          )
        })}
      </div>

      {/* Inline CTA */}
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <a
          href="/login"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
            color: 'var(--color-accent-green)', textDecoration: 'none',
          }}
        >
          Comece com Renderizar Imagem, gratuitamente
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

    </section>
  )
}
