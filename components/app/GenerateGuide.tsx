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
//
// O botão "Ir para Gerar render" (com rolagem programática e pulso no CTA)
// saiu na reforma de vidro: ele existia porque o CTA nascia abaixo da dobra de
// uma coluna com 9 grupos empilhados. Agora o CTA mora num .spn-dock colado no
// rodapé do painel e nunca sai da tela — apontar pra ele virou redundância.

export const GUIDE_START_EVENT = 'spn:guide:start'
export const GUIDE_DISMISSED_KEY = 'spn:generate-guide:dismissed'

export type GuidePhase = 'upload' | 'configure' | 'generating' | 'done'

const STEPS: { id: number; label: string }[] = [
  { id: 1, label: 'Referência' },
  { id: 2, label: 'Visualização' },
  { id: 3, label: 'Gerar' },
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
  onDismiss,
}: {
  phase: GuidePhase
  /** true = veio do fluxo Novo Space sem renders — o desfecho aponta o cartão de retorno. */
  fromSpacesNew: boolean
  onDismiss: () => void
}) {
  const active = ACTIVE_STEP[phase]

  return (
    <section className="spn-guide spn-glass" role="region" aria-label="Guia da primeira imagem">
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
          <div className="spn-guide-tip">
            <strong>Envie seu projeto.</strong> Use um print do SketchUp, render básico ou foto.
            Uma referência clara ajuda a preservar geometria, proporções e perspectiva.
            <span className="spn-guide-examples">SketchUp · render básico · foto do projeto</span>
          </div>
        )}

        {phase === 'configure' && (
          <p className="spn-guide-tip">
            <strong>Defina como quer visualizar.</strong> O cenário já vem preparado.
            Ajuste ambiente, luz ou materiais só se precisar; o projeto continua sendo a referência.
            Quando estiver pronto, use <strong>Gerar render</strong> no painel.
          </p>
        )}

        {phase === 'generating' && (
          <p className="spn-guide-tip">
            <span className="spn-guide-live" aria-hidden="true" />
            A SpaceNode trabalha sobre o seu projeto, preservando a geometria e a perspectiva.
            Sua imagem está a caminho.
          </p>
        )}

        {phase === 'done' && (
          <p className="spn-guide-tip">
            <strong>Sua primeira visualização está pronta.</strong>{' '}
            {fromSpacesNew
              ? 'Compare o antes e depois e continue seu Space com esta render.'
              : 'Compare o antes e depois. Em seguida, continue trabalhando nesta imagem.'}
          </p>
        )}
      </div>
    </section>
  )
}
