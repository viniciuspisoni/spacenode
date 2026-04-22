import React from 'react'

type PillType = 'green' | 'red' | 'amber' | 'check' | 'cross' | 'dash'
type Pill = { label: string; type: PillType }

const pill = (label: string, type: PillType): Pill => ({ label, type })

const rows: { criterion: string; desc: string; spn: Pill; vray: Pill; lumion: Pill; manual: Pill }[] = [
  { criterion: 'Tempo de render',       desc: 'por imagem finalizada',       spn: pill('6 segundos',   'green'), vray: pill('2–8 horas',    'red'),   lumion: pill('10–40 min',   'amber'), manual: pill('4–12 horas',  'red')   },
  { criterion: 'Custo mensal',          desc: 'plano intermediário',         spn: pill('R$149',        'green'), vray: pill('R$1.200+',     'red'),   lumion: pill('R$600+',      'amber'), manual: pill('R$1.500+',    'red')   },
  { criterion: 'Curva de aprendizado',  desc: 'até o primeiro resultado',    spn: pill('Zero',         'green'), vray: pill('Meses',        'red'),   lumion: pill('Semanas',     'amber'), manual: pill('Semanas',     'amber') },
  { criterion: 'Funciona com SketchUp', desc: 'importação direta',           spn: pill('✓',            'check'), vray: pill('✓',            'check'), lumion: pill('✓',           'check'), manual: pill('—',          'dash')  },
  { criterion: 'Fotorrealismo',         desc: 'qualidade para apresentação', spn: pill('Alto',         'green'), vray: pill('Alto',         'green'), lumion: pill('Médio',       'amber'), manual: pill('Alto',        'green') },
  { criterion: 'Suporte em Português',  desc: 'interface e atendimento',     spn: pill('✓',            'check'), vray: pill('✗',            'cross'), lumion: pill('✗',           'cross'), manual: pill('—',          'dash')  },
  { criterion: 'Hardware necessário',   desc: 'exige GPU dedicada?',         spn: pill('Não',          'green'), vray: pill('GPU potente',  'red'),   lumion: pill('GPU médio',   'amber'), manual: pill('CPU potente', 'amber') },
  { criterion: 'Plugin obrigatório',    desc: 'instalação no SketchUp',      spn: pill('✗',            'check'), vray: pill('✓',            'cross'), lumion: pill('✓',           'cross'), manual: pill('—',          'dash')  },
]

const pillStyle = (type: PillType, onWhite = false): React.CSSProperties => {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 500 }
  if (type === 'green')  return { ...base, background: onWhite ? 'rgba(26,158,92,0.12)' : 'rgba(48,180,108,0.15)', color: onWhite ? '#1a9e5c' : '#30b46c' }
  if (type === 'red')    return { ...base, background: 'rgba(220,50,47,0.15)',  color: '#ff6b6b' }
  if (type === 'amber')  return { ...base, background: 'rgba(200,140,0,0.15)',  color: '#d4a017' }
  if (type === 'check')  return { ...base, color: onWhite ? '#1a9e5c' : '#30b46c', fontSize: 16, padding: 0, background: 'none' }
  if (type === 'cross')  return { ...base, color: '#ff6b6b', fontSize: 16, padding: 0, background: 'none' }
  return { ...base, color: 'rgba(255,255,255,0.25)', fontSize: 16, padding: 0, background: 'none' }
}

export function ComparisonTable() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
          Comparativo
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10, color: '#fafafa' }}>
          SpaceNode vs. método tradicional.
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '-0.005em', lineHeight: 1.6 }}>
          O mesmo resultado. Em segundos. Sem curva de aprendizado e sem custo absurdo.
        </p>
      </div>

      <div style={{ border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '20px 20px 16px', textAlign: 'left', width: 220, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.03)', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                Critério
              </th>
              <th style={{ padding: '20px 20px 16px', textAlign: 'center', background: '#fafafa', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, letterSpacing: '0.14em', color: '#1a1a1a', marginBottom: 4 }}>SPACENODE</span>
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' }}>Motor de IA</span>
              </th>
              {['V-Ray / Corona', 'Lumion / Enscape', 'Pós-produção manual'].map(h => (
                <th key={h} style={{ padding: '20px 20px 16px', textAlign: 'center', fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.03)', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                  {h.split(' / ').map((l, i, arr) => <span key={i} style={{ display: 'block' }}>{l}{i < arr.length - 1 ? ' /' : ''}</span>)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.criterion} style={{ borderBottom: ri < rows.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
                <td style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderRight: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#fafafa' }}>{row.criterion}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{row.desc}</span>
                </td>
                <td style={{ padding: '16px 20px', textAlign: 'center', background: '#fafafa', borderRight: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <span style={pillStyle(row.spn.type, true)}>{row.spn.label}</span>
                </td>
                {[row.vray, row.lumion, row.manual].map((cell, ci) => (
                  <td key={ci} style={{ padding: '16px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRight: ci < 2 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <span style={pillStyle(cell.type)}>{cell.label}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
