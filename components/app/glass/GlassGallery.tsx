'use client'

import { useEffect, useRef, useState } from 'react'
import { Ambient } from './Ambient'
import { Sheet } from './Sheet'
import { SettingGroup, SettingRow, summarize } from './SettingRow'
import { Segmented } from './Segmented'
import { PillGroup, MultiPillGroup, ChoiceGroup } from './Choice'
import { RowIcon } from './icons'

/**
 * Galeria do material de vidro.
 *
 * Existe porque a página de QA de tema não conseguia REPROVAR um vidro
 * quebrado: ela pinta tudo sobre `var(--color-bg)` chapado, e sobre cor
 * chapada `backdrop-filter` não produz nada visível. Aqui o papel de parede
 * é trocável — inclusive por um render claro, que é o pior caso de contraste
 * — e os dois fallbacks de acessibilidade podem ser forçados na mão.
 *
 * O que cada seção prova está escrito nela.
 */

const WALLS = [
  { id: 'none', label: 'Sem papel', url: null },
  { id: 'dark', label: 'Render escuro', url: '/gallery-living-after.jpg' },
  { id: 'light', label: 'Render claro', url: '/gallery-casa-before.jpg' },
  { id: 'contrast', label: 'Alto contraste', url: '/gallery-comercial-before.jpg' },
] as const

export default function GlassGallery() {
  const [wall, setWall] = useState<string>('dark')
  const [solid, setSolid] = useState(false)
  const [sheet, setSheet] = useState<string | null>(null)
  const [seg, setSeg] = useState<'render' | 'editar' | 'animar'>('render')
  const [pill, setPill] = useState('Residencial')
  const [multi, setMulti] = useState<string[]>(['Plantas'])
  const [choice, setChoice] = useState<'vega' | 'pulsar' | 'quasar'>('vega')

  return (
    <div className="spn-app" style={{ minHeight: '100vh', position: 'relative' }} data-glass-solid={solid || undefined}>
      {/* Controlado: a galeria pode viver DENTRO do /app (a seção "Vidro"
          do theme-qa), e ali já existe o <Ambient/> do shell. Pelo barramento
          de eventos, trocar o papel da amostra trocaria o da página inteira. */}
      <Ambient url={WALLS.find(w => w.id === wall)?.url ?? null} />

      {/* Os sólidos que @supports e prefers-reduced-transparency aplicam,
          forçáveis na mão — é a única forma de conferir a legibilidade da
          degradação sem trocar de navegador ou de configuração do SO. */}
      {solid ? (
        <style>{`
          [data-glass-solid] { --glass: #141416; --glass-strong: #0e0e10; --glass-raised: #2a2a2e; }
          html.light [data-glass-solid] { --glass: #ffffff; --glass-strong: #fbfbfd; --glass-raised: #ffffff; }
          [data-glass-solid] .spn-glass,
          [data-glass-solid] .spn-glass--chrome,
          [data-glass-solid] .spn-glass--raised { backdrop-filter: none; -webkit-backdrop-filter: none; }
          [data-glass-solid] .spn-ambient-img { display: none; }
        `}</style>
      ) : null}

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto', padding: '40px 24px 120px' }}>
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
            Vidro — galeria de QA
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
            Troque o papel de parede e o modo sólido. Todo texto desta página está
            sobre o papel, não sobre vidro — é o pior caso de contraste do app.
          </p>
        </header>

        <Section title="Controles do teste" note="O papel de parede é o que o vidro refrata. Sem ele, nada aqui prova coisa alguma.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div className="spn-pills" role="radiogroup" aria-label="Papel de parede">
              {WALLS.map(w => (
                <button key={w.id} type="button" role="radio" className="spn-pill"
                        aria-checked={wall === w.id} onClick={() => setWall(w.id)}>
                  {w.label}
                </button>
              ))}
            </div>
            <button type="button" className="spn-pill" role="switch" aria-checked={solid}
                    onClick={() => setSolid(v => !v)}>
              Modo sólido (fallback)
            </button>
          </div>
        </Section>

        <Section title="As três variantes de material" note="raised sobre glass é onde a aresta especular falha primeiro.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Swatch cls="spn-glass" name=".spn-glass" desc="Cartões, linhas, folhas" />
            <Swatch cls="spn-glass spn-glass--chrome" name=".spn-glass--chrome" desc="Chrome fixo: segura leitura" />
            <Swatch cls="spn-glass spn-glass--raised" name=".spn-glass--raised" desc="Controle elevado" />
          </div>
          <div className="spn-glass" style={{ borderRadius: 'var(--r-card)', padding: 16, marginTop: 12 }}>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              Vidro sobre vidro:
            </p>
            <div className="spn-glass spn-glass--raised" style={{ borderRadius: 'var(--r-inner)', padding: 12, fontSize: 12.5, color: 'var(--color-text-primary)' }}>
              raised apoiado em glass
            </div>
          </div>
        </Section>

        <Section title="Hierarquia de texto sobre o papel" note="Os quatro níveis, direto no papel de parede — sem vidro amortecendo.">
          <div style={{ display: 'grid', gap: 6 }}>
            <p style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>Primário — o título de uma tela</p>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Secundário — o corpo de uma explicação</p>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Terciário — microcópia, legendas, notas de plano</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-quaternary)' }}>Quaternário — só ornamento (chevron, separador)</p>
          </div>
        </Section>

        <Section title="Linhas que abrem folhas" note="O padrão que substitui 40 pílulas empilhadas por 4 linhas de 44px.">
          <SettingGroup>
            <SettingRow icon={<RowIcon name="scene" />} title="Cena"
                        value={summarize(['Residencial', 'Sala de Estar', 'Premium'])}
                        onOpen={() => setSheet('cena')} />
            <SettingRow icon={<RowIcon name="light" />} title="Luz"
                        value="Preservar original" onOpen={() => setSheet('luz')} />
            <SettingRow icon={<RowIcon name="materials" />} title="Materiais"
                        value="Preservar do original" onOpen={() => setSheet('mat')} />
            <SettingRow icon={<RowIcon name="output" />} title="Saída"
                        value="Vega · 2K · 20 nodes" onOpen={() => setSheet('saida')} />
          </SettingGroup>
        </Section>

        <Section title="Segmentado" note="O polegar desliza; larguras diferentes são medidas em JS.">
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
        </Section>

        <Section title="Pílulas e cartões">
          <div className="spn-glass" style={{ borderRadius: 'var(--r-card)', padding: 16, display: 'grid', gap: 18 }}>
            <div>
              <span className="spn-field-label">Escolha única</span>
              <PillGroup label="Segmento" value={pill} onChange={setPill}
                         options={['Residencial', 'Corporativo', 'Comercial', 'Gastronomia', 'Hospitalidade']} />
            </div>
            <div>
              <span className="spn-field-label">Múltipla</span>
              <MultiPillGroup label="Elementos" values={multi} onChange={setMulti}
                              options={['Plantas', 'Mobiliário', 'Pessoas', 'Veículos']} />
            </div>
            <div>
              <span className="spn-field-label">Cartões</span>
              <ChoiceGroup label="Motor" value={choice} onChange={setChoice} cols={3}
                           options={[
                             { value: 'vega', title: 'Vega', note: 'Premium' },
                             { value: 'pulsar', title: 'Pulsar', note: 'Rápido' },
                             { value: 'quasar', title: 'Quasar', note: '~2 min' },
                           ]} />
            </div>
          </div>
        </Section>

        <Section title="Vidro sobre canvas repintando" note="Mede o custo antes de o Finalizar e o Blocos 3D pagarem por ele.">
          <CanvasProbe />
        </Section>

        <Section title="Vazio e erro">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="spn-empty">Nenhum render ainda. O primeiro aparece aqui.</div>
            <div className="spn-error">Saldo insuficiente: faltam 12 nodes para este render.</div>
          </div>
        </Section>
      </div>

      {/* Dock: o CTA que nunca some no scroll. */}
      <div className="spn-dock spn-glass spn-glass--chrome"
           style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <button type="button" className="spn-cta">
            Gerar render <span className="spn-cta-meta">20 nodes</span>
          </button>
        </div>
      </div>

      <Sheet open={sheet === 'cena'} title="Cena" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Segmento</span>
          <PillGroup label="Segmento" value={pill} onChange={setPill}
                     options={['Residencial', 'Corporativo', 'Comercial', 'Gastronomia']} />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Espaço</span>
          <PillGroup label="Espaço" value={pill} onChange={setPill}
                     options={['Sala de Estar', 'Cozinha', 'Quarto', 'Banheiro', 'Home Office', 'Varanda']} />
          <p className="spn-hint">O que você não pedir aqui é preservado do jeito que está no modelo.</p>
        </div>
      </Sheet>
      <Sheet open={sheet === 'luz'} title="Luz" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Iluminação</span>
          <PillGroup label="Iluminação" value="Preservar Original" onChange={() => {}}
                     options={['Preservar Original', 'Luz Natural', 'Golden Hour', 'Noturna']} />
        </div>
      </Sheet>
      <Sheet open={sheet === 'mat'} title="Materiais" onClose={() => setSheet(null)}>
        <p className="spn-hint" style={{ marginTop: 0 }}>Em branco = preserva todos do original.</p>
      </Sheet>
      <Sheet open={sheet === 'saida'} title="Saída" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Motor</span>
          <ChoiceGroup label="Motor" value={choice} onChange={setChoice} cols={3}
                       options={[
                         { value: 'vega', title: 'Vega', note: 'Premium' },
                         { value: 'pulsar', title: 'Pulsar', note: 'Rápido' },
                         { value: 'quasar', title: 'Quasar', note: '~2 min' },
                       ]} />
        </div>
      </Sheet>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
        {title}
      </h2>
      {note ? <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>{note}</p> : <div style={{ height: 10 }} />}
      {children}
    </section>
  )
}

function Swatch({ cls, name, desc }: { cls: string; name: string; desc: string }) {
  return (
    <div className={cls} style={{ borderRadius: 'var(--r-card)', padding: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 560, color: 'var(--color-text-primary)' }}>{name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 3 }}>{desc}</div>
    </div>
  )
}

/** Canvas repintando a 60fps com um painel de vidro por cima. */
function CanvasProbe() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    let raf = 0
    let t = 0
    const draw = () => {
      t += 0.02
      const { width: w, height: h } = cv
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < 5; i++) {
        ctx.beginPath()
        ctx.arc(w / 2 + Math.cos(t + i) * w * 0.3, h / 2 + Math.sin(t * 1.3 + i) * h * 0.35, 40, 0, Math.PI * 2)
        ctx.fillStyle = `hsl(${(i * 60 + t * 40) % 360} 60% 55% / 0.5)`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div style={{ position: 'relative', height: 180, borderRadius: 'var(--r-card)', overflow: 'hidden', background: 'var(--color-preview-bg)' }}>
      <canvas ref={ref} width={800} height={180} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="spn-glass" style={{ position: 'absolute', right: 14, top: 14, bottom: 14, width: 200, borderRadius: 'var(--r-inner)', padding: 12, fontSize: 12, color: 'var(--color-text-primary)' }}>
        Painel de vidro sobre canvas em rAF
      </div>
    </div>
  )
}
