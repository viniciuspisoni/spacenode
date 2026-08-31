import React from 'react'
import Image from 'next/image'

// ── Ícones — mesmo desenho de components/app/sidebar-icons.tsx, em escala
//    de mockup (viewBox 24×24, stroke 1.5, terminações arredondadas) ─────────

type IconProps = { size?: number }

const SVG = ({ size = 11, children }: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
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

const IconProjects = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h3.8a1.5 1.5 0 0 1 1.06.44L10.6 8H19.5A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5z" />
  </SVG>
)
const IconDashboard = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </SVG>
)
const IconHistory = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M3.2 12a8.8 8.8 0 1 0 2.7-6.3" />
    <path d="M3 4.5V8h3.5" />
    <path d="M12 7.8v4.4l3 1.9" />
  </SVG>
)
const IconGenerate = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.6" />
    <circle cx="8.4" cy="8.4" r="1.5" />
    <path d="M21 14.5l-4.6-4-7.4 7" />
  </SVG>
)
const IconSpaces = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="8" y="3" width="13" height="13" rx="2.2" />
    <path d="M16 21H5.2A2.2 2.2 0 0 1 3 18.8V8" />
  </SVG>
)
const IconRetocar = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M12.5 20H21" />
    <path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.2 18.8l-4 1 1-4L16.4 3.6z" />
  </SVG>
)
const IconEnhance = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M8 3.5H4.5a1 1 0 0 0-1 1V8" />
    <path d="M16 3.5h3.5a1 1 0 0 1 1 1V8" />
    <path d="M20.5 16v3.5a1 1 0 0 1-1 1H16" />
    <path d="M3.5 16v3.5a1 1 0 0 0 1 1H8" />
    <path d="M9.5 12h5M12 9.5v5" />
  </SVG>
)
const IconVideo = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="2.5" y="5.5" width="13.5" height="13" rx="2.4" />
    <path d="M16 10l5.5-3.2v10.4L16 14" />
  </SVG>
)
const IconFinalizar = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.6" />
    <path d="M8 12.2l2.8 2.8L16.5 9" />
  </SVG>
)

// Marca — ConstellationN original, monocromático (a versão com nó de acento
// verde foi aposentada; traço mais grosso que o oficial só pela legibilidade
// nesta escala de miniatura)
const Logo = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-label="spacenode">
    <g stroke="#fafafa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1="16" y1="16" x2="16" y2="48"/>
      <line x1="16" y1="16" x2="48" y2="48"/>
      <line x1="48" y1="16" x2="48" y2="48"/>
    </g>
    <circle cx="16" cy="16" r="4" fill="#fafafa"/>
    <circle cx="16" cy="48" r="4" fill="#fafafa"/>
    <circle cx="48" cy="48" r="4" fill="#fafafa"/>
    <circle cx="48" cy="16" r="4" fill="#fafafa"/>
  </svg>
)

// ── Bits compartilhados ────────────────────────────────────────────────────────

const hairline = '0.5px solid rgba(255,255,255,0.07)'

function GreenDot({ size = 5 }: { size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
      background: 'var(--color-accent-green)',
    }} />
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 7.5, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.32)',
    }}>
      {children}
    </div>
  )
}

// ── Dados do mockup ────────────────────────────────────────────────────────────

const NAV_SECTIONS: { label: string; items: { Icon: (p?: IconProps) => React.ReactElement; label: string; active?: boolean }[] }[] = [
  {
    label: 'PROJETOS',
    items: [
      { Icon: IconProjects,  label: 'Meus projetos', active: true },
      { Icon: IconDashboard, label: 'Dashboard' },
      { Icon: IconHistory,   label: 'Histórico' },
    ],
  },
  {
    label: 'CRIAR',
    items: [
      { Icon: IconGenerate,  label: 'Renderizar' },
      { Icon: IconSpaces,    label: 'Spaces' },
      { Icon: IconRetocar,   label: 'Editar' },
      { Icon: IconEnhance,   label: 'Ampliar' },
      { Icon: IconVideo,     label: 'Animar' },
      { Icon: IconFinalizar, label: 'Finalizar' },
    ],
  },
]

const DNA_ITEMS = [
  { label: 'Estilo',    value: 'Contemporâneo' },
  { label: 'Materiais', value: '6 detectados' },
  { label: 'Paleta',    value: '5 cores' },
  { label: 'Contexto',  value: 'Serra · Golden hour' },
]

const FILTER_PILLS = ['Todas', 'Favoritas', 'Iluminação', 'Detalhe']

const VISTAS = [
  { src: '/gallery-living-after.jpg',   badge: 'Sala de estar',  dot: '#d4a35a', meta: '2h · 2K' },
  { src: '/gallery-banheiro-after.jpg', badge: 'Banheiro suíte', dot: '#8fb7d4', meta: '1h · 2K' },
]

// ── Miniaturas dos blocos da tela "Space em uso" ───────────────────────────────

function DnaStrip() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {DNA_ITEMS.map(it => (
        <div key={it.label} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 9px',
          background: 'rgba(255,255,255,0.03)',
          border: hairline, borderRadius: 7,
          minWidth: 0,
        }}>
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 6.2l2.6 2.6L10 3.4" stroke="var(--color-accent-green)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 6.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>
              {it.label}
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 500, color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function VistaMiniCard({ v }: { v: typeof VISTAS[number] }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: hairline, borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'rgba(255,255,255,0.03)' }}>
        <Image src={v.src} alt={v.badge} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
        <span style={{
          position: 'absolute', top: 6, left: 6,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', borderRadius: 4,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          fontSize: 7, color: '#fff', letterSpacing: '0.02em',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: v.dot, display: 'inline-block' }} />
          {v.badge}
        </span>
      </div>
      <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.badge}
        </span>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.02em', flexShrink: 0 }}>
          {v.meta}
        </span>
      </div>
    </div>
  )
}

function VistaProcessingCard() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: hairline, borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{
        aspectRatio: '4 / 3', background: 'rgba(255,255,255,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.35)', fontSize: 8,
      }}>
        Gerando…
      </div>
      <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.01em' }}>
          Noturno
        </span>
        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.02em', flexShrink: 0 }}>
          agora · 4K
        </span>
      </div>
    </div>
  )
}

function VistaMestreBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{
      position: 'relative', borderRadius: compact ? 10 : 9, overflow: 'hidden',
      aspectRatio: compact ? '16 / 9' : '32 / 9',
      background: 'rgba(255,255,255,0.03)', border: hairline,
    }}>
      <Image src="/demo-render.jpg" alt="Vista Mestre" fill sizes="(max-width: 768px) 90vw, 620px" style={{ objectFit: 'cover' }} />
      <span style={{
        position: 'absolute', top: 8, left: 8,
        fontSize: 6.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: '#fff', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        padding: '3px 7px', borderRadius: 3,
      }}>
        vista mestre
      </span>
      {!compact && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 6.5, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)', background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)', border: '0.5px solid rgba(255,255,255,0.14)',
          padding: '3px 7px', borderRadius: 3,
        }}>
          Trocar Vista Mestre
        </span>
      )}
    </div>
  )
}

function DnaChip({ small = false }: { small?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '2px 7px' : '3px 8px', borderRadius: 999,
      background: 'rgba(48,209,88,0.09)', color: 'var(--color-accent-green)',
      border: '0.5px solid rgba(48,209,88,0.22)',
      fontSize: small ? 6.5 : 7, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
      whiteSpace: 'nowrap' as const,
    }}>
      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <rect x="4" y="11" width="16" height="10" rx="1.5"/>
        <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
      </svg>
      DNA travado
    </span>
  )
}

function BalanceBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 9px', borderRadius: 6,
      background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.12)',
      fontSize: 8, letterSpacing: '-0.005em', whiteSpace: 'nowrap' as const,
    }}>
      <GreenDot size={4} />
      <span style={{ color: '#fafafa', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>1.240</span>
      <span style={{ color: 'rgba(255,255,255,0.35)' }}>nodes</span>
    </span>
  )
}

// ── Desktop — shell do app: sidebar flutuante + tela "Space em uso" ───────────

function DesktopMockup() {
  return (
    <div style={{ perspective: 1400 }}>
      <div style={{
        background: '#0a0a0a',
        border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.6)',
        transform: 'rotateX(4deg) rotateY(-1deg)',
        transformOrigin: 'center top',
      }}>

        {/* Browser chrome */}
        <div style={{
          background: '#0d0d0d',
          borderBottom: hairline,
          padding: '9px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['#ff5f57','#ffbd2e','#28c840'] as const).map((c, i) => (
              <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
            ))}
          </div>
          <div style={{
            flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 5,
            padding: '4px 12px', fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center',
          }}>
            spacenode.app/app/spaces
          </div>
          <div style={{ width: 48 }} />
        </div>

        {/* App shell: sidebar flutuante + conteúdo */}
        <div style={{ display: 'flex', minHeight: 520, background: '#0a0a0a' }}>

          {/* Sidebar — card arredondado com gradiente, como no app */}
          <div style={{
            width: 158, flexShrink: 0,
            margin: 5,
            background: 'linear-gradient(180deg, #121212 0%, #0c0c0c 100%)',
            border: hairline,
            borderRadius: 12,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '14px 13px 11px' }}>
              <Logo size={16} />
              <span style={{ fontSize: 10.5, color: '#fafafa', fontWeight: 500, letterSpacing: '-0.02em' }}>spacenode</span>
            </div>
            <div style={{ height: 0.5, background: 'rgba(255,255,255,0.1)', margin: '0 10px 8px' }} />

            {/* Nav */}
            <div style={{ padding: '0 7px', display: 'flex', flexDirection: 'column' }}>
              {NAV_SECTIONS.map((section, gi) => (
                <div key={section.label}>
                  {gi > 0 && <div style={{ height: 0.5, background: 'rgba(255,255,255,0.08)', margin: '8px 7px' }} />}
                  <div style={{
                    fontSize: 6.5, fontWeight: 500, letterSpacing: '0.16em',
                    color: 'rgba(255,255,255,0.28)', padding: '4px 7px 3px',
                  }}>
                    {section.label}
                  </div>
                  {section.items.map(({ Icon, label, active }) => (
                    <div key={label} style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '0 7px', height: 24, borderRadius: 8,
                      color: active ? '#fafafa' : 'rgba(255,255,255,0.5)',
                      background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                    }}>
                      {active && (
                        <span style={{
                          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                          width: 2, height: 13, borderRadius: 999,
                          background: 'var(--color-accent-green)',
                          boxShadow: '0 0 8px rgba(48,209,88,0.45)',
                        }} />
                      )}
                      <Icon />
                      <span style={{ fontSize: 8.5, fontWeight: active ? 500 : 400, letterSpacing: '-0.01em' }}>{label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* User — avatar com anel de consumo */}
            <div style={{ marginTop: 'auto', borderTop: hairline, padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: 'conic-gradient(var(--color-accent-green) 0deg 248deg, rgba(255,255,255,0.12) 248deg 360deg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 19, height: 19, borderRadius: '50%',
                  background: '#161616',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 6.5, fontWeight: 600, color: '#fff',
                }}>VP</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.01em' }}>Vinicius</div>
                <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.35)' }}>Pro · 1.240 nodes</div>
              </div>
            </div>
          </div>

          {/* Conteúdo — tela "Space em uso" */}
          <div style={{ flex: 1, minWidth: 0, padding: '14px 16px 14px 11px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>
              <span>Meus projetos</span>
              <span style={{ opacity: 0.4, fontSize: 6.5 }}>›</span>
              <span style={{ color: '#fafafa', fontWeight: 500 }}>Residência Horizonte</span>
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 500, color: '#fafafa', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                  Residência Horizonte
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <DnaChip />
                  <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Vega · Residencial
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <BalanceBadge />
                <span style={{
                  padding: '5px 10px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.12)',
                  fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap',
                }}>
                  Pack →
                </span>
              </div>
            </div>

            {/* Vista Mestre banner */}
            <VistaMestreBanner />

            {/* DNA strip */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SectionLabel>DNA do projeto</SectionLabel>
              <DnaStrip />
            </div>

            {/* Vistas geradas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionLabel>Vistas geradas</SectionLabel>
                <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.3)' }}>DNA preservado em cada variação</span>
              </div>

              {/* Filter pills */}
              <div style={{ display: 'flex', gap: 4 }}>
                {FILTER_PILLS.map((f, i) => (
                  <span key={f} style={{
                    padding: '3px 9px', borderRadius: 999, fontSize: 7.5,
                    fontWeight: i === 0 ? 500 : 400, whiteSpace: 'nowrap',
                    background: i === 0 ? '#fafafa' : 'transparent',
                    color: i === 0 ? '#0a0a0a' : 'rgba(255,255,255,0.4)',
                    border: `0.5px solid ${i === 0 ? '#fafafa' : 'rgba(255,255,255,0.14)'}`,
                  }}>
                    {f}
                  </span>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                {VISTAS.map(v => <VistaMiniCard key={v.badge} v={v} />)}
                <VistaProcessingCard />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mobile — shell de telefone com a mesma tela ────────────────────────────────

function MobileMockup() {
  return (
    <div style={{
      maxWidth: 320,
      margin: '0 auto',
      background: '#0d0d0d',
      borderRadius: 28,
      border: '0.5px solid rgba(255,255,255,0.1)',
      padding: 8,
      boxShadow: '0 2px 4px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        background: '#0a0a0a',
        borderRadius: 22,
        overflow: 'hidden',
        border: hairline,
      }}>
        {/* App header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: hairline,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Logo size={17} />
            <span style={{ fontSize: 13, color: '#fafafa', fontWeight: 500, letterSpacing: '-0.02em' }}>spacenode</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <GreenDot />
            <span style={{ fontSize: 11, color: '#fafafa', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>1.240</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>nodes</span>
          </div>
        </div>

        <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Breadcrumb + header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
            <span>Meus projetos</span>
            <span style={{ opacity: 0.4, fontSize: 7 }}>›</span>
            <span style={{ color: '#fafafa', fontWeight: 500 }}>Residência Horizonte</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#fafafa', fontWeight: 500, letterSpacing: '-0.02em' }}>
              Residência Horizonte
            </span>
            <DnaChip small />
          </div>

          {/* Vista Mestre */}
          <VistaMestreBanner compact />

          {/* Meta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Vega · Residencial
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8.5, color: 'var(--color-accent-green)' }}>
              <GreenDot size={4} /> DNA preservado
            </span>
          </div>

          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.07)' }} />

          {/* Vistas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionLabel>Vistas geradas</SectionLabel>
            <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.3)' }}>2 de 3 concluídas</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {VISTAS.map(v => <VistaMiniCard key={v.badge} v={v} />)}
          </div>

          {/* CTA */}
          <div style={{
            marginTop: 2,
            background: '#fafafa',
            color: '#0a0a0a',
            borderRadius: 10,
            padding: '11px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.01em',
          }}>
            Gerar variações
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Faixa compacta de módulos (absorve a antiga seção PlatformModules) ────────

const MODULES = [
  { Icon: IconGenerate,  name: 'renderizar', desc: 'Estudos e modelos viram imagens fotorrealistas com fidelidade geométrica.' },
  { Icon: IconSpaces,    name: 'spaces',     desc: 'Variações coerentes do mesmo projeto: ângulos, luzes, atmosferas.' },
  { Icon: IconRetocar,   name: 'editar',     desc: 'Ajustes pontuais sem recomeçar a imagem inteira.' },
  { Icon: IconEnhance,   name: 'ampliar',    desc: 'Mais resolução, nitidez e qualidade final para apresentação.' },
  { Icon: IconVideo,     name: 'animar',     desc: 'Imagens do projeto viram vídeos curtos de apresentação.' },
  { Icon: IconHistory,   name: 'histórico',  desc: 'Gerações anteriores, comparação de versões e controle visual.' },
]

// ── Section wrapper ────────────────────────────────────────────────────────────

export function ProductMockup() {
  return (
    <section id="produto" className="spn-mockup">

      <div className="spn-mockup-head">
        <div className="spn-mockup-eyebrow">
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          O produto
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-mockup-title">
          um espaço de trabalho, não um gerador de imagens.
        </h2>
        <p className="spn-mockup-sub">
          Cada projeto vira um Space: a Vista Mestre define o DNA — estilo,
          materiais, paleta e contexto — e cada variação preserva geometria e
          identidade. Motor, resolução e consumo sempre visíveis.
        </p>
      </div>

      <div className="spn-mockup-desktop"><DesktopMockup /></div>
      <div className="spn-mockup-mobile"><MobileMockup /></div>

      <div className="spn-mockup-modules">
        {MODULES.map(({ Icon, name, desc }) => (
          <div key={name} className="spn-mockup-module">
            <span className="spn-mockup-module-icon"><Icon size={16} /></span>
            <div>
              <div className="spn-mockup-module-name">{name}</div>
              <p className="spn-mockup-module-desc">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="spn-mockup-cta">
        <a href="/login?mode=signup" className="spn-mockup-cta-btn">
          Testar grátis — 80 nodes
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      <style jsx>{`
        .spn-mockup {
          padding: 96px 24px;
          max-width: 960px;
          margin: 0 auto;
        }
        .spn-mockup-head {
          text-align: center;
          margin-bottom: 56px;
        }
        .spn-mockup-eyebrow {
          font-size: 10px; font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 16px;
          display: flex; align-items: center; justify-content: center;
          gap: 10px;
        }
        .spn-mockup-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-mockup-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0 auto;
          max-width: 580px;
        }
        .spn-mockup-desktop { display: block; }
        .spn-mockup-mobile { display: none; }

        .spn-mockup-modules {
          margin-top: 48px;
          padding-top: 36px;
          border-top: 0.5px solid var(--color-border);
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px 28px;
        }
        .spn-mockup-module {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .spn-mockup-module-icon {
          width: 30px;
          height: 30px;
          flex-shrink: 0;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-secondary);
          background: rgba(255, 255, 255, 0.05);
          border: 0.5px solid rgba(255, 255, 255, 0.09);
        }
        .spn-mockup-module-name {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--color-text-primary);
          margin-bottom: 3px;
        }
        .spn-mockup-module-desc {
          font-size: 12px;
          color: var(--color-text-tertiary);
          line-height: 1.55;
          letter-spacing: -0.005em;
          margin: 0;
        }
        .spn-mockup-cta {
          text-align: center;
          margin-top: 40px;
        }
        .spn-mockup-cta-btn {
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
        .spn-mockup-cta-btn:hover {
          background: rgba(255, 255, 255, 0.085);
          border-color: rgba(255, 255, 255, 0.16);
          transform: translateY(-1px);
        }
        .spn-mockup-cta-btn:active { transform: translateY(0); }
        .spn-mockup-cta-btn:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.75);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-mockup-cta-btn { transition: none; }
          .spn-mockup-cta-btn:hover { transform: none; }
        }

        @media (max-width: 768px) {
          .spn-mockup {
            padding: 72px 20px;
          }
          .spn-mockup-head {
            margin-bottom: 36px;
          }
          .spn-mockup-title {
            font-size: 24px;
          }
          .spn-mockup-sub {
            font-size: 13px;
          }
          .spn-mockup-desktop { display: none; }
          .spn-mockup-mobile  { display: block; }
          .spn-mockup-modules {
            margin-top: 36px;
            padding-top: 28px;
            grid-template-columns: 1fr;
            gap: 18px;
          }
          .spn-mockup-cta {
            margin-top: 32px;
          }
        }
      `}</style>
    </section>
  )
}
