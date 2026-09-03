const AUDIENCES = [
  {
    title: 'Arquitetos autônomos',
    desc: 'Apresente estudos com velocidade de escritório grande — sem renderista, sem fila de render.',
  },
  {
    title: 'Escritórios de arquitetura',
    desc: 'Volume e consistência para equipes: mais alternativas por reunião, com a mesma identidade visual.',
  },
  {
    title: 'Designers de interiores',
    desc: 'Teste materialidade, mobiliário e atmosfera antes de executar — e aprove com o cliente na hora.',
  },
]

const TOOLS = ['SketchUp', 'Revit', 'ArchiCAD', 'Enscape', 'Lumion', 'Twinmotion']

// Comparativo reduzido com o fluxo tradicional (absorve a antiga
// ComparisonTable, de 8 critérios × 4 colunas para 4 × 3).
const COMPARE_COLS = ['spacenode', 'V-Ray / Corona', 'Lumion / Enscape']
const COMPARE_ROWS: { criterion: string; spn: string; vray: string; lumion: string }[] = [
  { criterion: 'Tempo por imagem',     spn: '30–60 seg',   vray: '2–8 horas',   lumion: '10–40 min' },
  { criterion: 'Custo mensal',         spn: 'R$199 (Pro)', vray: 'R$1.200+',    lumion: 'R$600+' },
  { criterion: 'Curva de aprendizado', spn: 'Zero',        vray: 'Meses',       lumion: 'Semanas' },
  { criterion: 'Hardware',             spn: 'Sem GPU',     vray: 'GPU potente', lumion: 'GPU intermediária' },
]

export function ForWho() {
  return (
    <section className="spn-who">
      <div className="spn-who-head">
        <div className="spn-who-eyebrow">
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
          Para quem
          <span style={{ display: 'block', width: 32, height: '0.5px', background: 'var(--color-border-strong)' }} />
        </div>
        <h2 className="spn-who-title">
          feita para quem projeta.
        </h2>
        <p className="spn-who-sub">
          Para quem precisa apresentar o projeto — não apenas gerar imagens.
        </p>
      </div>

      <div className="spn-who-grid">
        {AUDIENCES.map(a => (
          <div key={a.title} className="spn-who-card">
            <div className="spn-who-card-title">{a.title}</div>
            <p className="spn-who-card-desc">{a.desc}</p>
          </div>
        ))}
      </div>

      <div className="spn-who-compare">
        <span className="spn-who-compare-label">Comparado ao fluxo tradicional</span>
        <div className="spn-who-compare-table" role="table" aria-label="SpaceNode comparada a ferramentas tradicionais de render">
          <div className="spn-who-compare-row spn-who-compare-row--head" role="row">
            <span role="columnheader" aria-label="Critério" />
            {COMPARE_COLS.map((c, i) => (
              <span key={c} role="columnheader" className={i === 0 ? 'spn-who-compare-spn' : ''}>{c}</span>
            ))}
          </div>
          {COMPARE_ROWS.map(row => (
            <div key={row.criterion} className="spn-who-compare-row" role="row">
              <span role="rowheader" className="spn-who-compare-crit">{row.criterion}</span>
              <span role="cell" className="spn-who-compare-spn">{row.spn}</span>
              <span role="cell">{row.vray}</span>
              <span role="cell">{row.lumion}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="spn-who-tools">
        <span className="spn-who-tools-label">Funciona com o seu fluxo atual</span>
        <div className="spn-who-tools-chips">
          {TOOLS.map(t => (
            <span key={t} className="spn-who-chip">{t}</span>
          ))}
        </div>
        <span className="spn-who-tools-note">Prints e imagens base de qualquer modelador — e plugin oficial para SketchUp.</span>
      </div>

      <style jsx>{`
        .spn-who {
          padding: 96px 24px;
          max-width: 960px;
          margin: 0 auto;
        }
        .spn-who-head {
          text-align: center;
          margin-bottom: 48px;
        }
        .spn-who-eyebrow {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .spn-who-title {
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
          color: var(--color-text-primary);
        }
        .spn-who-sub {
          font-size: 14px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
          line-height: 1.6;
          margin: 0;
        }
        .spn-who-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .spn-who-card {
          padding: 26px 24px;
          border: 0.5px solid var(--color-border);
          border-radius: 14px;
          background: var(--color-bg-elevated);
        }
        .spn-who-card-title {
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: var(--color-text-primary);
          margin-bottom: 8px;
        }
        .spn-who-card-desc {
          font-size: 13px;
          color: var(--color-text-tertiary);
          line-height: 1.6;
          letter-spacing: -0.005em;
          margin: 0;
        }
        .spn-who-compare {
          margin-top: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .spn-who-compare-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
        }
        .spn-who-compare-table {
          width: 100%;
          border: 0.5px solid var(--color-border-strong);
          border-radius: 12px;
          overflow: hidden;
          background: var(--color-bg-elevated);
        }
        .spn-who-compare-row {
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr 1fr;
          border-bottom: 0.5px solid var(--color-border);
        }
        .spn-who-compare-row:last-child { border-bottom: none; }
        .spn-who-compare-row > span {
          padding: 12px 16px;
          font-size: 12.5px;
          letter-spacing: -0.005em;
          color: var(--color-text-secondary);
        }
        .spn-who-compare-row--head {
          background: var(--color-surface-subtle);
        }
        .spn-who-compare-row--head > span {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
        }
        .spn-who-compare-crit {
          font-weight: 500;
          color: var(--color-text-primary) !important;
        }
        .spn-who-compare-spn {
          color: var(--color-accent-green) !important;
          font-weight: 500;
        }

        .spn-who-tools {
          margin-top: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          text-align: center;
        }
        .spn-who-tools-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
        }
        .spn-who-tools-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }
        .spn-who-chip {
          padding: 6px 14px;
          border: 0.5px solid var(--color-border-strong);
          border-radius: 20px;
          font-size: 12px;
          letter-spacing: -0.005em;
          color: var(--color-text-secondary);
          white-space: nowrap;
        }
        .spn-who-tools-note {
          font-size: 11px;
          color: var(--color-text-tertiary);
          letter-spacing: -0.005em;
        }

        @media (max-width: 768px) {
          .spn-who {
            padding: 72px 20px;
          }
          .spn-who-head {
            margin-bottom: 32px;
          }
          .spn-who-title {
            font-size: 24px;
          }
          .spn-who-sub {
            font-size: 13px;
          }
          .spn-who-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .spn-who-card {
            padding: 20px 18px;
          }
          .spn-who-compare {
            margin-top: 28px;
            gap: 12px;
          }
          .spn-who-compare-row {
            grid-template-columns: 1.15fr 1fr 1fr 1fr;
          }
          .spn-who-compare-row > span {
            padding: 10px 8px;
            font-size: 10.5px;
          }
          .spn-who-compare-row--head > span {
            font-size: 8.5px;
            letter-spacing: 0.08em;
          }
          .spn-who-tools {
            margin-top: 28px;
          }
        }
      `}</style>
    </section>
  )
}
