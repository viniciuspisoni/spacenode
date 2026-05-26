// ── Icon set (matches Sidebar.tsx) ────────────────────────────────────────────

const IconDashboard = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/>
    <rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>
  </svg>
)
const IconHistory = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
  </svg>
)
const IconGenerate = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const IconEnhance = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.88 5.47L19 10l-5.12 1.53L12 17l-1.88-5.47L5 10l5.12-1.53L12 3z"/>
    <path d="M5 3l.94 2.06L8 6l-2.06.94L5 9l-.94-2.06L2 6l2.06-.94L5 3z"/>
  </svg>
)
const IconPlans = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
)

function Chips({ items, selected }: { items: string[]; selected: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {items.map(p => (
        <span key={p} style={{
          padding: '3px 9px', borderRadius: 20, fontSize: 8.5, whiteSpace: 'nowrap',
          border: `0.5px solid ${p === selected ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
          color: p === selected ? '#fafafa' : 'rgba(255,255,255,0.35)',
          background: p === selected ? 'rgba(255,255,255,0.1)' : 'transparent',
        }}>{p}</span>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 7.5, fontWeight: 600, letterSpacing: '0.14em',
      textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.28)',
      marginBottom: 5,
    }}>
      {children}
    </div>
  )
}

// ── Desktop mockup (unchanged behavior) ────────────────────────────────────────

function DesktopMockup() {
  return (
    <div style={{ perspective: 1400 }}>
      <div style={{
        background: '#111',
        border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.6)',
        transform: 'rotateX(4deg) rotateY(-1deg)',
        transformOrigin: 'center top',
      }}>

        <div style={{
          background: '#0d0d0d',
          borderBottom: '0.5px solid rgba(255,255,255,0.06)',
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
            spacenode.app/gerar
          </div>
          <div style={{ width: 48 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '56px 316px 1fr', minHeight: 530 }}>

          <div style={{
            background: '#0a0a0a',
            borderRight: '0.5px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '14px 0', gap: 2,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 14,
            }}>
              <svg width="14" height="14" viewBox="0 0 64 64" aria-label="spacenode">
                <g stroke="#fafafa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <line x1="16" y1="16" x2="16" y2="48"/>
                  <line x1="16" y1="16" x2="48" y2="48"/>
                  <line x1="48" y1="16" x2="48" y2="48"/>
                </g>
                <circle cx="16" cy="16" r="3" fill="#fafafa"/>
                <circle cx="48" cy="16" r="3" fill="#fafafa"/>
                <circle cx="16" cy="48" r="3" fill="#fafafa"/>
                <circle cx="48" cy="48" r="3" fill="#30b46c"/>
              </svg>
            </div>

            {[
              { Icon: IconDashboard, active: false },
              { Icon: IconHistory,   active: false },
              { Icon: IconGenerate,  active: true  },
              { Icon: IconEnhance,   active: false },
              { Icon: IconPlans,     active: false },
            ].map(({ Icon, active }, i) => (
              <div key={i} style={{
                width: 38, height: 38, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: active ? '#ffffff' : 'rgba(255,255,255,0.3)',
                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
              }}>
                <Icon />
              </div>
            ))}

            <div style={{ marginTop: 'auto' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 600, color: '#ffffff',
              }}>VP</div>
            </div>
          </div>

          <div style={{
            background: '#0d0d0d',
            borderRight: '0.5px solid rgba(255,255,255,0.06)',
            padding: '13px 14px',
            display: 'flex', flexDirection: 'column', gap: 12,
            overflow: 'hidden',
          }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>GERAR</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#30b46c', display: 'inline-block' }} />
                <span style={{ color: '#fafafa', fontWeight: 500 }}>4</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>Nodes</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8 }}>+ comprar</span>
              </div>
            </div>

            <div>
              <SectionLabel>Tipo de projeto</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {[
                  { label: 'Ambiente Exterior', icon: '✦', sel: true  },
                  { label: 'Ambiente Interior', icon: '▪', sel: false },
                ].map(({ label, icon, sel }) => (
                  <div key={label} style={{
                    border: `0.5px solid ${sel ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8, padding: '10px 8px',
                    background: sel ? '#fafafa' : 'rgba(255,255,255,0.03)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ fontSize: 12, color: sel ? '#0a0a0a' : 'rgba(255,255,255,0.3)' }}>{icon}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 500, color: sel ? '#0a0a0a' : 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Segmento</SectionLabel>
              <Chips
                selected="Residencial"
                items={['Residencial','Comercial','Corporativo','Hospitalidade','Institucional','Paisagismo']}
              />
            </div>

            <div>
              <SectionLabel>Espaço</SectionLabel>
              <Chips
                selected="Fachada Residencial"
                items={['Fachada Residencial','Casa Térrea','Sobrado','Casa Contemporânea','Casa em Condomínio','Edifício Residencial','Área de Piscina','Jardim Residencial']}
              />
            </div>

            <div>
              <SectionLabel>Iluminação</SectionLabel>
              <Chips
                selected="Diurno"
                items={['Diurno','Entardecer','Golden Hour','Blue Hour','Noturno Iluminado','Nublado','Chuva Leve']}
              />
            </div>

            <div>
              <SectionLabel>Entorno</SectionLabel>
              <Chips
                selected="Preservar Original"
                items={['Preservar Original','Entorno Neutro','Rua Arborizada','Condomínio','Bairro Nobre','Zona Urbana','Zona Rural','Beira-Mar','Serra','Praça Urbana']}
              />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px',
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 7,
            }}>
              <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                Materiais do projeto
              </span>
              <span style={{
                fontSize: 7.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                background: 'rgba(48,180,108,0.15)', color: '#30b46c',
                padding: '2px 7px', borderRadius: 20,
              }}>Preenchido</span>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px',
              background: 'rgba(255,255,255,0.02)',
              border: '0.5px solid rgba(255,255,255,0.06)',
              borderRadius: 7,
            }}>
              <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>Avançado</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>+</span>
            </div>

          </div>

          <div style={{ background: '#0a0a0a', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
              ANTES / DEPOIS
            </div>

            <div style={{
              border: '0.5px dashed rgba(255,255,255,0.12)',
              borderRadius: 10, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 9,
              flex: 1, background: 'rgba(255,255,255,0.02)', textAlign: 'center',
              padding: '20px 16px', minHeight: 240,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" width="16" height="16" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.02em' }}>arraste sua imagem aqui</div>
              <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.22)', marginTop: -4 }}>SketchUp · Render · 3D · JPG · PNG</div>
              <div style={{ padding: '4px 13px', border: '0.5px solid rgba(255,255,255,0.14)', borderRadius: 20, fontSize: 8.5, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)' }}>
                escolher arquivo
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 7.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 8 }}>
                RESUMO DA GERAÇÃO
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginBottom: 4, letterSpacing: '-0.01em' }}>
                Fotorrealismo Exterior · Residencial · Fachada Residencial
                <span style={{ marginLeft: 4, fontSize: 8, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>+ materiais</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Diurno', 'Alta Fidelidade · Vega · HD'].map((t, i) => (
                  <span key={i} style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.4)', letterSpacing: '-0.005em' }}>{t}</span>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}

// ── Mobile mockup — phone shell with the actual app interface ─────────────────

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
        border: '0.5px solid rgba(255,255,255,0.06)',
      }}>
        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 18px 6px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.8)',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>9:41</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="14" height="9" viewBox="0 0 14 9" fill="none">
              <rect x="0.5" y="2" width="3" height="6" rx="0.5" fill="rgba(255,255,255,0.85)"/>
              <rect x="4.5" y="0.5" width="3" height="8" rx="0.5" fill="rgba(255,255,255,0.85)"/>
              <rect x="8.5" y="2.5" width="3" height="6" rx="0.5" fill="rgba(255,255,255,0.5)"/>
              <rect x="12.5" y="4" width="3" height="5" rx="0.5" fill="rgba(255,255,255,0.3)"/>
            </svg>
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
              <rect x="0.5" y="0.5" width="13" height="9" rx="2" stroke="rgba(255,255,255,0.6)" strokeWidth="0.7" fill="none"/>
              <rect x="2" y="2" width="9" height="6" rx="0.5" fill="rgba(255,255,255,0.85)"/>
              <rect x="14" y="3.5" width="1.5" height="3" rx="0.5" fill="rgba(255,255,255,0.5)"/>
            </svg>
          </div>
        </div>

        {/* App header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 64 64" aria-label="spacenode">
              <g stroke="#fafafa" strokeWidth="2" strokeLinecap="round" fill="none">
                <line x1="16" y1="16" x2="16" y2="48"/>
                <line x1="16" y1="16" x2="48" y2="48"/>
                <line x1="48" y1="16" x2="48" y2="48"/>
              </g>
              <circle cx="16" cy="16" r="4" fill="#fafafa"/>
              <circle cx="48" cy="16" r="4" fill="#fafafa"/>
              <circle cx="16" cy="48" r="4" fill="#fafafa"/>
              <circle cx="48" cy="48" r="4" fill="#30b46c"/>
            </svg>
            <span style={{ fontSize: 13, color: '#fafafa', fontWeight: 500, letterSpacing: '-0.02em' }}>spacenode</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#30b46c' }} />
            <span style={{ fontSize: 11, color: '#fafafa', fontWeight: 500 }}>4</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>nodes</span>
          </div>
        </div>

        {/* Preview area */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            border: '0.5px dashed rgba(255,255,255,0.15)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            aspectRatio: '4 / 3',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            textAlign: 'center',
            padding: '20px 16px',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" width="18" height="18" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.75)', letterSpacing: '-0.01em' }}>
              envie sua imagem
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              SketchUp · Foto · 3D · JPG · PNG
            </div>
          </div>

          {/* Quick chips */}
          <div>
            <div style={{
              fontSize: 8, fontWeight: 600, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
              marginBottom: 8,
            }}>
              Espaço
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {[
                { label: 'Fachada', sel: true },
                { label: 'Sala', sel: false },
                { label: 'Cozinha', sel: false },
                { label: 'Banheiro', sel: false },
              ].map(c => (
                <span key={c.label} style={{
                  padding: '5px 11px',
                  borderRadius: 20,
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  border: `0.5px solid ${c.sel ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: c.sel ? '#fafafa' : 'rgba(255,255,255,0.4)',
                  background: c.sel ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div style={{
              fontSize: 8, fontWeight: 600, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
              marginBottom: 8,
            }}>
              Iluminação
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {[
                { label: 'Diurno', sel: true },
                { label: 'Golden Hour', sel: false },
                { label: 'Noturno', sel: false },
              ].map(c => (
                <span key={c.label} style={{
                  padding: '5px 11px',
                  borderRadius: 20,
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  border: `0.5px solid ${c.sel ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: c.sel ? '#fafafa' : 'rgba(255,255,255,0.4)',
                  background: c.sel ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <div style={{
            marginTop: 4,
            background: '#fafafa',
            color: '#0a0a0a',
            borderRadius: 10,
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
          }}>
            Gerar imagem
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Cost line */}
          <div style={{
            textAlign: 'center',
            fontSize: 9.5,
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '-0.005em',
          }}>
            Custo · 4 nodes · HD · 30s
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

export function ProductMockup() {
  return (
    <section className="spn-mockup">

      <div className="spn-mockup-head">
        <div className="spn-mockup-eyebrow">
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Interface
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-mockup-title">
          simples como tirar uma foto.
        </h2>
        <p className="spn-mockup-sub">
          Upload do projeto. Configure o ambiente. Render em segundos. Sem plugins, sem curva de aprendizado.
        </p>
      </div>

      <div className="spn-mockup-desktop"><DesktopMockup /></div>
      <div className="spn-mockup-mobile"><MobileMockup /></div>

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
          margin: 0;
        }
        .spn-mockup-desktop { display: block; }
        .spn-mockup-mobile { display: none; }

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
        }
      `}</style>
    </section>
  )
}
