const SpaceNodeLogo = () => (
  <svg width="18" height="18" viewBox="0 0 22 22">
    <g stroke="#444" strokeWidth="0.5">
      <line x1="7.33" y1="1" x2="7.33" y2="21" />
      <line x1="14.67" y1="1" x2="14.67" y2="21" />
      <line x1="1" y1="7.33" x2="21" y2="7.33" />
      <line x1="1" y1="14.67" x2="21" y2="14.67" />
    </g>
    <g
      fontFamily="Geist,system-ui"
      fontSize="5"
      fontWeight="400"
      fill="#fafafa"
      textAnchor="middle"
      dominantBaseline="central"
    >
      <text x="3.67" y="4.17">S</text><text x="11" y="4.17">P</text><text x="18.33" y="4.17">A</text>
      <text x="3.67" y="11">C</text><text x="11" y="11">E</text><text x="18.33" y="11">N</text>
      <text x="3.67" y="17.83">O</text><text x="11" y="17.83">D</text><text x="18.33" y="17.83">E</text>
    </g>
  </svg>
)

export function ProductMockup() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{
          fontSize: 10, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Interface
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10, color: 'var(--color-text-primary)' }}>
          simples como tirar uma foto.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em', lineHeight: 1.6 }}>
          Upload do projeto. Escolha o estilo. Render em segundos.<br />
          Sem plugins, sem curva de aprendizado, sem frustração.
        </p>
      </div>

      <div style={{ perspective: 1400 }}>
        <div style={{
          background: '#111',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 2px 4px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.6)',
          transform: 'rotateX(4deg) rotateY(-1deg)',
          transformOrigin: 'center top',
          transition: 'transform 0.6s ease',
        }}>

          {/* Browser bar */}
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

          {/* App shell */}
          <div style={{ display: 'grid', gridTemplateColumns: '165px 308px 1fr', minHeight: 530 }}>

            {/* SIDEBAR */}
            <div style={{
              background: '#0d0d0d',
              borderRight: '0.5px solid rgba(255,255,255,0.06)',
              padding: '17px 12px',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 8px 22px' }}>
                <SpaceNodeLogo />
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', color: '#fafafa' }}>SPACENODE</span>
              </div>

              {[
                { label: 'dashboard', active: false },
                { label: 'gerar',     active: true  },
                { label: 'histórico', active: false },
                { label: 'planos',    active: false },
              ].map(({ label, active }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 9px', borderRadius: 7, fontSize: 11,
                  color: active ? '#fafafa' : 'rgba(255,255,255,0.35)',
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}>
                  {label}
                </div>
              ))}

              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 8px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', color: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 500, flexShrink: 0 }}>VP</div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: '#fafafa' }}>Vinicius Pisoni</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>PLANO BETA</div>
                </div>
              </div>
            </div>

            {/* CONTROLS */}
            <div style={{
              background: '#0d0d0d',
              borderRight: '0.5px solid rgba(255,255,255,0.06)',
              padding: 15, display: 'flex', flexDirection: 'column', gap: 11, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>GERAR</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#30b46c', boxShadow: '0 0 5px rgba(48,180,108,0.5)', display: 'inline-block' }} />
                  <span style={{ color: '#fafafa', fontWeight: 500, fontSize: 10 }}>47</span>
                  créditos
                </div>
              </div>

              <div>
                <div style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>MODO DE OUTPUT</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  {[
                    { label: 'Externo',  active: true  },
                    { label: 'Interno',  active: false },
                    { label: 'Planta',   active: false },
                    { label: 'Multi',    active: false },
                    { label: 'Paisagem', active: false },
                    { label: 'Prancha',  active: false },
                  ].map(({ label, active }) => (
                    <div key={label} style={{
                      border: `0.5px solid ${active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 7, padding: '9px 5px 7px', textAlign: 'center',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      background: active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)',
                      fontSize: 9, fontWeight: 500,
                      color: active ? '#fafafa' : 'rgba(255,255,255,0.3)',
                    }}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />

              {[
                { label: 'CONDIÇÃO ATMOSFÉRICA', pills: ['Diurno','Entardecer','Noturno','Nublado','Chuva'], selected: 'Diurno' },
                { label: 'BACKGROUND / PAISAGEM', pills: ['Urbano Arborizado','Bairro Planejado','Litorâneo','Bairro Nobre','Montanha'], selected: 'Urbano Arborizado' },
              ].map(({ label, pills, selected }) => (
                <div key={label}>
                  <div style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>{label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {pills.map(p => (
                      <span key={p} style={{
                        padding: '3px 9px', borderRadius: 20, fontSize: 9, whiteSpace: 'nowrap',
                        border: `0.5px solid ${p === selected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        color: p === selected ? '#fafafa' : 'rgba(255,255,255,0.3)',
                        background: p === selected ? 'rgba(255,255,255,0.1)' : 'transparent',
                      }}>{p}</span>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>GEOMETRY LOCK</span>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>preserva a geometria original</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                  <span>Livre</span>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: '30%', background: '#fafafa', borderRadius: 2 }} />
                  </div>
                  <span>Fiel</span>
                  <span style={{ fontSize: 9, fontWeight: 500, color: '#fafafa', minWidth: 26, textAlign: 'right' }}>30%</span>
                </div>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', lineHeight: 1.5, marginTop: 5 }}>Equilíbrio — IA transforma com liberdade moderada.</p>
              </div>

              <div>
                <div style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>MOTOR DE IA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  {[
                    { name: 'Nano Banana Pro', tag: 'Padrão',      sel: true  },
                    { name: 'Nano Banana',     tag: 'Rápido',      sel: false },
                    { name: 'GPT Image 2',     tag: 'OpenAI',      sel: false },
                    { name: 'Flux Krea',       tag: 'Criativo',    sel: false },
                    { name: 'Flux General',    tag: 'Experimental',sel: false },
                  ].map(({ name, tag, sel }) => (
                    <div key={name} style={{
                      border: `0.5px solid ${sel ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 6, padding: '6px 8px',
                      background: sel ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)',
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 500, color: sel ? '#fafafa' : 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{name}</div>
                      <span style={{ fontSize: 7, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', padding: '1px 4px', borderRadius: 3 }}>{tag}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                width: '100%', padding: '10px 12px',
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.35)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 8, fontSize: 10, fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 'auto',
              }}>
                <span>envie uma imagem para gerar</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>1 crédito →</span>
              </div>
            </div>

            {/* PREVIEW */}
            <div style={{ background: '#0a0a0a', padding: 15, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>ANTES / DEPOIS</div>

              <div style={{
                border: '0.5px dashed rgba(255,255,255,0.12)',
                borderRadius: 10, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                flex: 1, background: 'rgba(255,255,255,0.02)', textAlign: 'center', padding: '20px 16px', minHeight: 260,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" width="17" height="17" strokeWidth="1.3">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.02em' }}>arraste sua imagem aqui</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: -5 }}>SketchUp · Render · 3D · JPG · PNG</div>
                <div style={{ padding: '5px 14px', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 20, fontSize: 9, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)' }}>
                  escolher arquivo
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 9, padding: '11px 13px' }}>
                <div style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>PROMPT GERADO</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {['Externo','Diurno','Urbano Arborizado','Nano Banana Pro','30% Geometry'].map((chip, i) => (
                    <span key={chip} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '3px 7px', borderRadius: 5, fontSize: 9, fontWeight: 500,
                      background: i === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                      color: i === 0 ? '#fafafa' : 'rgba(255,255,255,0.5)',
                      border: i === 0 ? 'none' : '0.5px solid rgba(255,255,255,0.08)',
                    }}>{chip}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
                  <svg viewBox="0 0 24 24" fill="none" width="10" height="10" stroke="currentColor" strokeWidth="1.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ver prompt completo
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
