import React from 'react'

type PillType = 'green' | 'red' | 'amber' | 'check' | 'cross' | 'dash'
type Pill = { label: string; type: PillType }

const pill = (label: string, type: PillType): Pill => ({ label, type })

const rows: { criterion: string; desc: string; spn: Pill; vray: Pill; lumion: Pill; manual: Pill }[] = [
  { criterion: 'Tempo de render',       desc: 'por imagem finalizada',       spn: pill('30–60 seg',    'green'), vray: pill('2–8 horas',    'red'),   lumion: pill('10–40 min',   'amber'), manual: pill('4–12 horas',  'red')   },
  { criterion: 'Custo mensal',          desc: 'plano Pro',                   spn: pill('R$199',        'green'), vray: pill('R$1.200+',     'red'),   lumion: pill('R$600+',      'amber'), manual: pill('R$1.500+',    'red')   },
  { criterion: 'Curva de aprendizado',  desc: 'até o primeiro resultado',    spn: pill('Zero',         'green'), vray: pill('Meses',        'red'),   lumion: pill('Semanas',     'amber'), manual: pill('Semanas',     'amber') },
  { criterion: 'Funciona com SketchUp', desc: 'importação direta',           spn: pill('✓',            'check'), vray: pill('✓',            'check'), lumion: pill('✓',           'check'), manual: pill('—',          'dash')  },
  { criterion: 'Fotorrealismo',         desc: 'qualidade para apresentação', spn: pill('Alto',         'green'), vray: pill('Alto',         'green'), lumion: pill('Médio',       'amber'), manual: pill('Alto',        'green') },
  { criterion: 'Suporte em Português',  desc: 'interface e atendimento',     spn: pill('✓',            'check'), vray: pill('✗',            'cross'), lumion: pill('✗',           'cross'), manual: pill('—',          'dash')  },
  { criterion: 'Hardware necessário',   desc: 'exige GPU dedicada?',         spn: pill('Não',          'green'), vray: pill('GPU potente',  'red'),   lumion: pill('GPU médio',   'amber'), manual: pill('CPU potente', 'amber') },
  { criterion: 'Plugin obrigatório',    desc: 'instalação no SketchUp',      spn: pill('✗',            'check'), vray: pill('✓',            'cross'), lumion: pill('✓',           'cross'), manual: pill('—',          'dash')  },
]

const pillStyle = (type: PillType): React.CSSProperties => {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 500 }
  if (type === 'green')  return { ...base, background: 'rgba(48,180,108,0.12)', color: '#30b46c' }
  if (type === 'red')    return { ...base, background: 'rgba(220,50,47,0.12)', color: '#e05252' }
  if (type === 'amber')  return { ...base, background: 'rgba(200,140,0,0.14)', color: '#d4a017' }
  if (type === 'check')  return { ...base, color: '#30b46c', fontSize: 16, padding: 0, background: 'none' }
  if (type === 'cross')  return { ...base, color: '#e05252', fontSize: 16, padding: 0, background: 'none' }
  return { ...base, color: 'var(--color-text-quaternary)', fontSize: 16, padding: 0, background: 'none' }
}

const spnPillStyle = (type: PillType): React.CSSProperties => {
  const base = pillStyle(type)
  if (type === 'green') return { ...base, background: 'rgba(48,180,108,0.15)', color: '#30b46c' }
  return base
}

// Mobile card pill — slightly larger
const pillStyleM = (type: PillType): React.CSSProperties => {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500 }
  if (type === 'green')  return { ...base, background: 'rgba(48,180,108,0.14)', color: '#30b46c' }
  if (type === 'red')    return { ...base, background: 'rgba(220,50,47,0.12)', color: '#e05252' }
  if (type === 'amber')  return { ...base, background: 'rgba(200,140,0,0.14)', color: '#d4a017' }
  if (type === 'check')  return { ...base, color: '#30b46c', fontSize: 16, padding: 0, background: 'none' }
  if (type === 'cross')  return { ...base, color: '#e05252', fontSize: 16, padding: 0, background: 'none' }
  return { ...base, color: 'var(--color-text-quaternary)', fontSize: 16, padding: 0, background: 'none' }
}

export function ComparisonTable() {
  return (
    <section className="spn-cmp">

      <div className="spn-cmp-head">
        <div className="spn-cmp-eyebrow">
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Comparativo
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-cmp-title">
          SpaceNode vs. método tradicional.
        </h2>
        <p className="spn-cmp-sub">
          O mesmo resultado. Em segundos. Sem curva de aprendizado e sem custo absurdo.
        </p>
      </div>

      {/* Desktop table */}
      <div className="spn-cmp-desktop">
        <div style={{ border: '0.5px solid var(--color-border-strong)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '20px 20px 16px', textAlign: 'left', width: 220, fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                  Critério
                </th>
                <th style={{ padding: '20px 20px 16px', textAlign: 'center', background: '#1a1a1a', borderBottom: '0.5px solid rgba(255,255,255,0.08)', borderTop: '2px solid var(--color-accent-green)' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 400, letterSpacing: '-0.01em', color: '#fafafa', marginBottom: 4 }}>spacenode</span>
                  <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Motor de IA</span>
                </th>
                {['V-Ray / Corona', 'Lumion / Enscape', 'Pós-produção manual'].map(h => (
                  <th key={h} style={{ padding: '20px 20px 16px', textAlign: 'center', fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                    {h.split(' / ').map((l, i, arr) => <span key={i} style={{ display: 'block' }}>{l}{i < arr.length - 1 ? ' /' : ''}</span>)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.criterion} style={{ borderBottom: ri < rows.length - 1 ? '0.5px solid var(--color-border)' : 'none' }}>
                  <td style={{ padding: '16px 20px', background: 'var(--color-surface)', borderRight: '0.5px solid var(--color-border-strong)' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{row.criterion}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{row.desc}</span>
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'center', background: '#1a1a1a', borderRight: '0.5px solid rgba(255,255,255,0.06)' }}>
                    <span style={spnPillStyle(row.spn.type)}>{row.spn.label}</span>
                  </td>
                  {[row.vray, row.lumion, row.manual].map((cell, ci) => (
                    <td key={ci} style={{ padding: '16px 20px', textAlign: 'center', background: ci % 2 === 0 ? 'var(--color-bg-elevated)' : 'var(--color-bg)', borderRight: ci < 2 ? '0.5px solid var(--color-border)' : 'none' }}>
                      <span style={pillStyle(cell.type)}>{cell.label}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="spn-cmp-mobile">
        {rows.map(row => (
          <div key={row.criterion} className="spn-cmp-card">
            <div className="spn-cmp-card-head">
              <div className="spn-cmp-card-title">{row.criterion}</div>
              <div className="spn-cmp-card-desc">{row.desc}</div>
            </div>

            <div className="spn-cmp-card-row spn-cmp-card-row--featured">
              <div className="spn-cmp-card-label">
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#30b46c', display: 'inline-block' }} />
                <span>spacenode</span>
              </div>
              <span style={pillStyleM(row.spn.type)}>{row.spn.label}</span>
            </div>

            {[
              { name: 'V-Ray / Corona',     cell: row.vray   },
              { name: 'Lumion / Enscape',   cell: row.lumion },
              { name: 'Pós-produção manual', cell: row.manual },
            ].map(({ name, cell }) => (
              <div key={name} className="spn-cmp-card-row">
                <div className="spn-cmp-card-label spn-cmp-card-label--dim">{name}</div>
                <span style={pillStyleM(cell.type)}>{cell.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style jsx>{`
        .spn-cmp {
          padding: 96px 24px;
          max-width: 960px;
          margin: 0 auto;
        }
        .spn-cmp-head {
          text-align: center;
          margin-bottom: 56px;
        }
        .spn-cmp-eyebrow {
          font-size: 10px; font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 16px;
          display: flex; align-items: center; justify-content: center;
          gap: 10px;
        }
        .spn-cmp-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-cmp-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0;
        }
        .spn-cmp-desktop { display: block; }
        .spn-cmp-mobile  { display: none; }

        @media (max-width: 768px) {
          .spn-cmp {
            padding: 72px 20px;
          }
          .spn-cmp-head {
            margin-bottom: 36px;
          }
          .spn-cmp-title { font-size: 24px; }
          .spn-cmp-sub { font-size: 13px; }
          .spn-cmp-desktop { display: none; }
          .spn-cmp-mobile  { display: flex; flex-direction: column; gap: 14px; }

          .spn-cmp-card {
            border: 0.5px solid var(--color-border-strong);
            border-radius: 12px;
            overflow: hidden;
            background: var(--color-bg-elevated);
          }
          .spn-cmp-card-head {
            padding: 14px 16px 12px;
            border-bottom: 0.5px solid var(--color-border);
            background: var(--color-surface);
          }
          .spn-cmp-card-title {
            font-size: 13px;
            font-weight: 500;
            color: var(--color-text-primary);
            letter-spacing: -0.01em;
          }
          .spn-cmp-card-desc {
            font-size: 11px;
            color: var(--color-text-tertiary);
            margin-top: 2px;
            letter-spacing: -0.005em;
          }
          .spn-cmp-card-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 11px 16px;
            border-bottom: 0.5px solid var(--color-border);
            gap: 12px;
          }
          .spn-cmp-card-row:last-child { border-bottom: none; }
          .spn-cmp-card-row--featured {
            background: rgba(48,180,108,0.04);
            border-top: 2px solid rgba(48,180,108,0.4);
          }
          .spn-cmp-card-label {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 12px;
            font-weight: 500;
            color: var(--color-text-primary);
            letter-spacing: -0.005em;
          }
          .spn-cmp-card-label--dim {
            color: var(--color-text-tertiary);
            font-weight: 400;
          }
        }
      `}</style>
    </section>
  )
}
