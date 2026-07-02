'use client'

import { useState } from 'react'
import ThemeSelector from '@/components/app/ThemeSelector'

export default function ThemeQAClient() {
  const [modalOpen, setModalOpen] = useState(false)
  const [activeChip, setActiveChip] = useState('Sala de estar')

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="spn-page-title">Theme QA</h1>
            <p className="spn-page-sub">
              Amostras dos elementos principais nos dois temas. Página interna — não aparece na navegação.
            </p>
          </div>
          <ThemeSelector variant="full" />
        </header>

        {/* Botões */}
        <Section title="Botões">
          <Row>
            <button className="spn-btn-primary">Ação principal</button>
            <button className="spn-btn-ghost">Ação secundária</button>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px',
              background: 'var(--color-accent-green)', color: 'var(--color-on-accent)',
              borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
            }}>
              CTA verde (raro)
            </button>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              background: 'var(--color-error-bg)', color: 'var(--color-error)',
              border: '0.5px solid var(--color-error-border)',
              borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
              Destrutivo
            </button>
            <button disabled style={{
              display: 'inline-flex', alignItems: 'center', padding: '10px 18px',
              background: 'var(--color-surface)', color: 'var(--color-text-quaternary)',
              border: '0.5px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'not-allowed',
            }}>
              Desabilitado
            </button>
          </Row>
        </Section>

        {/* Inputs */}
        <Section title="Inputs">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <input placeholder="Buscar projeto…" className="spn-proj-search" style={{ maxWidth: 'none', paddingLeft: 12 }} />
            <input
              placeholder="Input com token de input"
              style={{
                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                border: '0.5px solid var(--color-input-border)', background: 'var(--color-input)',
                color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: 13, outline: 'none',
              }}
            />
            <select className="spn-proj-sort">
              <option>Mais recentes</option>
              <option>Mais antigos</option>
            </select>
          </div>
          <textarea
            placeholder="Descreva o ambiente…"
            rows={3}
            style={{
              marginTop: 12, width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              border: '0.5px solid var(--color-input-border)', background: 'var(--color-input)',
              color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: 13, outline: 'none', resize: 'vertical',
            }}
          />
        </Section>

        {/* Chips */}
        <Section title="Chips / seleção">
          <Row>
            {['Sala de estar', 'Cozinha', 'Quarto', 'Fachada'].map((label) => {
              const active = activeChip === label
              return (
                <button
                  key={label}
                  onClick={() => setActiveChip(label)}
                  style={{
                    padding: '7px 14px', borderRadius: 'var(--radius-full)', fontSize: 12.5, fontWeight: 500,
                    fontFamily: 'inherit', cursor: 'pointer',
                    background: active ? 'var(--color-chip-active)' : 'var(--color-chip)',
                    color: active ? 'var(--color-chip-active-foreground)' : 'var(--color-text-secondary)',
                    border: `0.5px solid ${active ? 'transparent' : 'var(--color-border)'}`,
                    transition: 'background var(--duration-fast) ease, color var(--duration-fast) ease',
                  }}
                >
                  {label}
                </button>
              )
            })}
            <span className="spn-badge spn-badge--green">Concluído</span>
            <span className="spn-badge spn-badge--neutral">Rascunho</span>
            <span className="spn-badge spn-badge--error">Falhou</span>
          </Row>
        </Section>

        {/* Cards */}
        <Section title="Cards">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div style={{
              background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border)',
              borderRadius: 14, padding: 18,
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Card padrão</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
                Fundo elevado, borda hairline, texto secundário legível.
              </div>
            </div>
            <div style={{
              background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
              borderRadius: 14, padding: 18,
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Card surface</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
                Superfície translúcida sobre o fundo da página.
              </div>
            </div>
            <div style={{
              background: 'var(--color-accent-green-bg)', border: '0.5px solid var(--color-accent-green-border)',
              borderRadius: 14, padding: 18,
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-accent-green)' }}>Card de sucesso</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                Verde apenas funcional — sucesso, estado ativo, CTA.
              </div>
            </div>
          </div>
        </Section>

        {/* Upload + preview */}
        <Section title="Upload e preview">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <div className="spn-upload-zone" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 140, borderRadius: 14, border: '1px dashed var(--color-border-strong)',
              background: 'var(--color-upload-area)', color: 'var(--color-text-tertiary)', fontSize: 12.5, cursor: 'pointer',
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 13V4M6.5 7.5 10 4l3.5 3.5M4 13v2a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Arraste uma imagem ou clique
            </div>
            <div style={{
              minHeight: 140, borderRadius: 14, background: 'var(--color-preview-bg)',
              border: '0.5px solid var(--color-border)', position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-quaternary)', fontSize: 12,
            }}>
              Preview (fundo neutro)
              <span style={{
                position: 'absolute', top: 10, left: 10, fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase', padding: '3px 7px', borderRadius: 7,
                background: 'var(--color-scrim)', color: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(6px)',
              }}>
                Overlay
              </span>
            </div>
          </div>
        </Section>

        {/* Tabela / lista */}
        <Section title="Tabela / lista">
          <div style={{ border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            {[
              { name: 'Residência Alameda', status: 'Concluído', date: 'hoje' },
              { name: 'Loft Centro', status: 'Processando', date: 'ontem' },
              { name: 'Fachada Comercial', status: 'Rascunho', date: '2 dias' },
            ].map((row, i) => (
              <div key={row.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                padding: '12px 16px', background: 'var(--color-bg-elevated)',
                borderTop: i > 0 ? '0.5px solid var(--color-border)' : 'none',
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{row.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.status}</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{row.date}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Skeleton + empty state */}
        <Section title="Skeleton e empty state">
          <Row>
            <div className="spn-skeleton" style={{ width: 160, height: 90, borderRadius: 12 }} />
            <div className="spn-skeleton" style={{ width: 160, height: 90, borderRadius: 12 }} />
            <div style={{
              flex: 1, minWidth: 220, minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '0.5px dashed var(--color-border-strong)', borderRadius: 12,
              color: 'var(--color-text-tertiary)', fontSize: 12.5,
            }}>
              Nenhum item ainda — comece criando um projeto.
            </div>
          </Row>
        </Section>

        {/* Modal + dropdown */}
        <Section title="Modal e dropdown">
          <Row>
            <button className="spn-btn-ghost" onClick={() => setModalOpen(true)}>Abrir modal</button>
            <div className="spn-proj-menu" style={{ position: 'static', minWidth: 170 }}>
              <button className="spn-proj-menu-item">Renomear</button>
              <button className="spn-proj-menu-item">Duplicar</button>
              <button className="spn-proj-menu-item spn-proj-menu-item--danger">Excluir</button>
            </div>
          </Row>
          {modalOpen && (
            <div
              onClick={() => setModalOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100, background: 'var(--color-scrim-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%', maxWidth: 400, background: 'var(--color-bg-elevated)',
                  border: '0.5px solid var(--color-border-strong)', borderRadius: 16,
                  padding: 24, boxShadow: 'var(--shadow-xl)',
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                  Modal de exemplo
                </h3>
                <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.6, marginTop: 8 }}>
                  Painel elevado sobre scrim. Deve ter contraste suficiente nos dois temas.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                  <button className="spn-btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
                  <button className="spn-btn-primary" onClick={() => setModalOpen(false)}>Confirmar</button>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Toast */}
        <Section title="Toasts">
          <Row>
            <div style={toastStyle}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-accent-green)', flexShrink: 0 }} />
              Render concluído com sucesso.
            </div>
            <div style={{ ...toastStyle, borderColor: 'var(--color-error-border)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-error)', flexShrink: 0 }} />
              Não foi possível processar a imagem.
            </div>
          </Row>
        </Section>

        {/* Escala de texto */}
        <Section title="Hierarquia de texto">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Texto primário — títulos e valores</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Texto secundário — labels e navegação</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Texto terciário — descrições e metadados</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-quaternary)' }}>Texto quaternário — placeholders e desabilitados</span>
          </div>
        </Section>

      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: '20px 22px',
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 14,
    }}>
      <h2 style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', marginBottom: 16,
      }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
}

const toastStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9,
  padding: '11px 16px', borderRadius: 12,
  background: 'var(--color-bg-elevated)',
  border: '0.5px solid var(--color-border-strong)',
  boxShadow: 'var(--shadow-md)',
  fontSize: 12.5, color: 'var(--color-text-primary)',
}
