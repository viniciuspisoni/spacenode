'use client'

// Guia opcional, ligado ao estado real de Renderizar. Atalhos só abrem os
// controles existentes; a sugestão exige revisão antes de aplicar. A lista de
// comparação não grava feedback de utilidade.

import { OnboardingVideo } from './OnboardingDemo'
import { ONBOARDING_GOALS, type OnboardingGoal } from '@/lib/onboarding'
import styles from './Onboarding.module.css'

export const GUIDE_DISMISSED_KEY = 'spn:generate-guide:dismissed'
export type GuidePhase = 'upload' | 'configure' | 'generating' | 'done'
export type GuidePanel = 'cena' | 'luz' | 'materiais' | 'saida'
export type GuideConfiguration = Record<GuidePanel, string>

const STEPS: { id: number; label: string }[] = [
  { id: 1, label: 'Referência' },
  { id: 2, label: 'Visualização' },
  { id: 3, label: 'Gerar' },
  { id: 4, label: 'Comparar' },
]

// Índice do passo ativo por fase.
const ACTIVE_STEP: Record<GuidePhase, number> = {
  upload: 1,
  configure: 2,
  generating: 3,
  done: 4,
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
  nodeCost,
  onUpload,
  onExample,
  exampleLoading = false,
  exampleReference = false,
  goal,
  onGoal,
  onOpenPanel,
  configuration,
  reviewKey,
  onRecommend,
}: {
  phase: GuidePhase
  /** true = veio do fluxo Novo Space sem renders — o desfecho aponta o cartão de retorno. */
  fromSpacesNew: boolean
  onDismiss: () => void
  nodeCost?: number
  onUpload?: () => void
  onExample?: () => void
  exampleLoading?: boolean
  exampleReference?: boolean
  goal?: OnboardingGoal | null
  onGoal?: (goal: OnboardingGoal) => void
  onOpenPanel?: (panel: GuidePanel) => void
  configuration?: GuideConfiguration
  reviewKey?: string | null
  onRecommend?: () => void
}) {
  const active = ACTIVE_STEP[phase]
  const intention = goal ? ONBOARDING_GOALS[goal] : null

  return (
    <section className="spn-guide spn-glass" role="region" aria-label="Guia da primeira imagem">
      <div className="spn-guide-head">
        <ol className="spn-guide-steps">
          {STEPS.map((step, i) => {
            const isDone = step.id < active
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
            <strong>Missão 1: escolha uma imagem sua.</strong> Envie uma vista do modelo ou foto do projeto.
            Prefira um enquadramento limpo, sem menus sobre o espaço.
            <div className={styles.tipActions}>
              {onUpload && <button type="button" className="spn-pill" onClick={onUpload}>Escolher imagem →</button>}
              {onExample && <button type="button" className="spn-pill" disabled={exampleLoading} onClick={onExample}>{exampleLoading ? 'Carregando exemplo…' : 'Explorar com um exemplo'}</button>}
              <OnboardingVideo />
            </div>
            {onExample && <p className={styles.caption}>O exemplo serve para conhecer os ajustes sem gastar Nodes. Para gerar, use uma imagem sua.</p>}
          </div>
        )}

        {phase === 'configure' && (
          <div className="spn-guide-tip">
            <strong>Missão 2: o que você quer fazer com esta imagem?</strong> Escolha um objetivo para receber uma orientação. É opcional.
            {exampleReference && <p className={styles.exampleNotice}>Você está explorando com um exemplo. {onUpload && <button type="button" className={styles.mutedButton} onClick={onUpload}>Usar minha imagem →</button>}</p>}
            {onGoal && <div className={styles.tipActions} role="group" aria-label="Objetivo da imagem">
              {(Object.keys(ONBOARDING_GOALS) as OnboardingGoal[]).map(id => <button
                type="button" className="spn-pill" key={id} aria-pressed={goal === id}
                onClick={() => onGoal(id)}
              >{ONBOARDING_GOALS[id].label}</button>)}
            </div>}
            {intention && <div className={styles.goalHelp} role="status">
              <p>{intention.instruction}</p>
              {onOpenPanel && <button type="button" className="spn-pill" onClick={() => onOpenPanel(intention.panel)}>{intention.action} →</button>}
            </div>}
            {onRecommend && <div className={styles.tipActions}><button type="button" className="spn-pill" onClick={onRecommend}>Preparar minha primeira imagem →</button><span className={styles.caption}>Revise uma configuração recomendada antes de aplicar.</span></div>}
            {configuration && <details className={styles.guideDetails}>
              <summary>Conferir configuração e custo</summary>
              <div className={styles.configSummary}>
                {([
                  ['cena', 'Cena'], ['luz', 'Luz'], ['materiais', 'Materiais'], ['saida', 'Qualidade e custo'],
                ] as const).map(([panel, label]) => <button type="button" key={panel} onClick={() => onOpenPanel?.(panel)}>
                  <span>{label}</span><strong>{configuration[panel]}</strong><span aria-hidden="true">↗</span>
                </button>)}
              </div>
              <p className={styles.caption}>{exampleReference ? 'Os Nodes só serão usados ao gerar com sua própria imagem.' : 'Nada foi gerado ainda. Os Nodes são usados quando você clica em Gerar render.'}</p>
            </details>}
            <div className={styles.tipActions}>
              {nodeCost !== undefined && <span>{nodeCost} Nodes por geração</span>}
              <OnboardingVideo />
            </div>
          </div>
        )}

        {phase === 'generating' && (
          <p className="spn-guide-tip">
            <span className="spn-guide-live" aria-hidden="true" />
            <strong>Sua visualização está sendo criada.</strong> Ao comparar, olhe primeiro
            as proporções e aberturas; depois, os materiais e a luz.
          </p>
        )}

        {phase === 'done' && (
          <div className="spn-guide-tip">
            <strong>Missão 3: veja se o resultado serve ao projeto.</strong>{' '}
            {fromSpacesNew
              ? 'Compare o antes e depois e continue seu Space com esta render.'
              : 'Arraste o comparador, confira os detalhes e responda “Este render serviu para o seu projeto?” no painel. Depois, baixe ou continue na mesma imagem.'}
            {intention && <p className={styles.goalHelp}>Seu objetivo: {intention.label.toLowerCase()}. {intention.review}</p>}
            <details key={reviewKey} className={styles.guideDetails}>
              <summary>O que conferir no antes e depois</summary>
              <ul className={styles.checklist}>
                {['Comparei proporções, aberturas e enquadramento', 'Conferi materiais e iluminação', 'Avaliei se a imagem ajuda na tarefa que escolhi'].map(item => <li key={item}><label><input type="checkbox" />{item}</label></li>)}
              </ul>
              <p className={styles.caption}>Esta lista é um apoio. A avaliação do resultado fica na pergunta do painel.</p>
            </details>
            <div className={styles.tipActions}><OnboardingVideo clip="review-result" /></div>
          </div>
        )}
      </div>
    </section>
  )
}
