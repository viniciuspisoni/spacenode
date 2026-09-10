'use client'

import { useState } from 'react'
import ThemeSelector from '@/components/app/ThemeSelector'
import { Segmented, Sheet } from '@/components/app/glass'
import GlassGallery from '@/components/app/glass/GlassGallery'

export default function ThemeQAClient() {
  const [modalOpen, setModalOpen] = useState(false)
  const [activeChip, setActiveChip] = useState('Sala de estar')
  const [seg, setSeg] = useState<'render' | 'editar' | 'animar'>('render')

  return (
    // Sem `background` aqui: era ele que fazia esta página REPROVAR o que
    // deveria aprovar. Sobre `var(--color-bg)` chapado, `backdrop-filter` não
    // produz nada visível — um vidro quebrado passava no teste porque não
    // havia nada atrás dele para refratar. Agora o <Ambient/> do shell aparece.
    <main style={{ flex: 1, overflowY: 'auto', padding: '40px 48px 80px' }}>
      {/* z-index 1: a galeria de vidro monta o próprio papel de parede (fixed,
          z-index 0) e sem isto ele cobriria as seções acima dela. */}
      <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28, position: 'relative', zIndex: 1 }}>

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
                background: 'var(--color-scrim)', color: 'rgba(255,255,255,0.9)',
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
            <button className="spn-btn-ghost" onClick={() => setModalOpen(true)}>Abrir folha</button>
            <div className="spn-proj-menu" style={{ position: 'static', minWidth: 170 }}>
              <button className="spn-proj-menu-item">Renomear</button>
              <button className="spn-proj-menu-item">Duplicar</button>
              <button className="spn-proj-menu-item spn-proj-menu-item--danger">Excluir</button>
            </div>
          </Row>
          {/* Era um cartão opaco sobre --color-scrim, SEM backdrop-filter: a
              amostra validava o contrário do que o app faz. Agora é a <Sheet>
              de verdade — a mesma peça, o mesmo scrim, o mesmo borrão. */}
          <Sheet open={modalOpen} title="Folha de exemplo" onClose={() => setModalOpen(false)}>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: '0 0 16px' }}>
              Vidro --chrome sobre scrim, com trap de foco, ESC e trava de rolagem.
              Abaixo de 720px sobe da base; acima, é cartão flutuante centrado.
            </p>
            <button className="spn-cta" onClick={() => setModalOpen(false)}>Confirmar</button>
          </Sheet>
        </Section>

        {/* Os três padrões mais repetidos do app, isolados. */}
        <Section title="Padrões do vidro">
          <div style={{ display: 'grid', gap: 18 }}>
            <div>
              <span className="spn-field-label">Segmentado (o eixo que fica na superfície)</span>
              <Segmented
                label="Modo"
                value={seg}
                onChange={setSeg}
                items={[
                  { value: 'render', label: 'Render' },
                  { value: 'editar', label: 'Editar' },
                  { value: 'animar', label: 'Animar este render' },
                ]}
              />
            </div>
            <div>
              <span className="spn-field-label">CTA — um só por tela, sempre inverso</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="spn-cta" style={{ width: 'auto' }}>
                  Gerar render <span className="spn-cta-meta">20 nodes</span>
                </button>
                <button className="spn-cta" style={{ width: 'auto' }} disabled>Sem saldo</button>
                <button className="spn-ghost">Ação secundária</button>
              </div>
            </div>
            <div>
              <span className="spn-field-label">Erro e vazio — uma versão de cada</span>
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="spn-error">Saldo insuficiente: faltam 12 nodes para este render.</div>
                <div className="spn-empty">Nenhum render ainda. O primeiro aparece aqui.</div>
              </div>
            </div>
          </div>
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

        {/* Vidro — a galeria completa do kit, montada aqui dentro.
            A moldura tem `transform`, e é isso que segura o `position: fixed`
            da galeria (papel de parede e dock) dentro dela: um ancestral
            transformado vira o containing block dos filhos fixos. Sem a
            moldura, o dock ficaria colado no rodapé desta página inteira. */}
        <Section title="Vidro">
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5, marginBottom: 12 }}>
            Troque o papel de parede e ligue o modo sólido para conferir os dois
            fallbacks (@supports e prefers-reduced-transparency) sem mexer no SO.
          </p>
          <div className="spn-qa-glass-frame">
            <GlassGallery />
          </div>
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
    <section className="spn-glass" style={{ padding: '20px 22px', borderRadius: 'var(--r-card)' }}>
      <h2 className="spn-field-label">{title}</h2>
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
