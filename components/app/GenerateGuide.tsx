'use client'

// Guia da primeira imagem (/app/generate) — evolução do módulo "Como usar".
// O tour do dashboard orienta o atelier; este guia acompanha o usuário DENTRO
// do processo de geração: uma régua de 3 passos que avança sozinha conforme o
// estado real da página (referência enviada → cenário ajustado → resultado).
// Sem overlay e sem bloquear nada — a página continua 100% interativa.
//
// Abertura: automática quando a conta nunca gerou uma render (prop firstRender,
// derivada da contagem server-side) e o guia não foi dispensado; manual via
// /app/generate#guia ou pelo "Como usar" da sidebar (evento GUIDE_START_EVENT,
// mesmo padrão do tour). Depois da primeira render a contagem passa a ser > 0
// e o guia deixa de se oferecer — não há coluna nova nem migration.

export const GUIDE_START_EVENT = 'spn:guide:start'
export const GUIDE_DISMISSED_KEY = 'spn:generate-guide:dismissed'

export type GuidePhase = 'upload' | 'configure' | 'generating' | 'done'

const STEPS: { id: number; label: string }[] = [
  { id: 1, label: 'Referência' },
  { id: 2, label: 'Cenário' },
  { id: 3, label: 'Resultado' },
]

// Índice do passo ativo por fase — 'generating' e 'done' vivem no passo 3.
const ACTIVE_STEP: Record<GuidePhase, number> = {
  upload: 1,
  configure: 2,
  generating: 3,
  done: 3,
}

function CheckGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function GenerateGuide({
  phase,
  fromSpacesNew,
  onLocateGenerate,
  onDismiss,
}: {
  phase: GuidePhase
  /** true = veio do fluxo Novo Space sem renders — o desfecho aponta o cartão verde de retorno. */
  fromSpacesNew: boolean
  /** Rola a coluna de controles até o botão Gerar e chama atenção pra ele. */
  onLocateGenerate: () => void
  onDismiss: () => void
}) {
  const active = ACTIVE_STEP[phase]

  return (
    <section className="spn-guide" role="region" aria-label="Guia da primeira imagem">
      <div className="spn-guide-head">
        <ol className="spn-guide-steps">
          {STEPS.map((step, i) => {
            const isDone = step.id < active || (step.id === 3 && phase === 'done')
            const isActive = step.id === active && !isDone
            return (
              <li
                key={step.id}
                className={
                  isDone ? 'spn-guide-step spn-guide-step--done'
                  : isActive ? 'spn-guide-step spn-guide-step--active'
                  : 'spn-guide-step'
                }
                aria-current={isActive ? 'step' : undefined}
              >
                {i > 0 && <span className="spn-guide-sep" aria-hidden="true" />}
                <span className="spn-guide-step-num" aria-hidden="true">
                  {isDone ? <CheckGlyph /> : String(step.id).padStart(2, '0')}
                </span>
                <span className="spn-guide-step-label">{step.label}</span>
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          className="spn-guide-close"
          aria-label="Fechar guia"
          onClick={onDismiss}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="spn-guide-body">
        {phase === 'upload' && (
          <p className="spn-guide-tip">
            Comece enviando a imagem do seu projeto — print do SketchUp, render,
            foto ou planta. É a base de tudo o que vem depois.
          </p>
        )}

        {phase === 'configure' && (
          <>
            <p className="spn-guide-tip">
              Referência no lugar. À esquerda, confira espaço e iluminação — os
              padrões já funcionam bem. O botão fica no fim do painel:
            </p>
            <button type="button" className="spn-guide-goto" onClick={onLocateGenerate}>
              Ir para Gerar render
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </button>
          </>
        )}

        {phase === 'generating' && (
          <p className="spn-guide-tip">
            <span className="spn-guide-live" aria-hidden="true" />
            Sua primeira imagem está a caminho — acompanhe aqui ao lado.
          </p>
        )}

        {phase === 'done' && (
          <p className="spn-guide-tip">
            <strong>Primeira imagem pronta.</strong>{' '}
            {fromSpacesNew
              ? 'Arraste o divisor para comparar antes e depois. Para continuar seu Space com esta render, siga pelo cartão verde abaixo da imagem.'
              : 'Arraste o divisor para comparar antes e depois. Daqui você pode baixar, gerar variações ou criar um Space a partir desta render.'}
          </p>
        )}
      </div>
    </section>
  )
}
