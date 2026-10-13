'use client'

// Guia da primeira imagem (/app/generate) — evolução do módulo "Como usar".
// O tour do dashboard orienta o atelier; este guia acompanha o usuário DENTRO
// do processo de geração: uma régua de 3 passos que avança sozinha conforme o
// estado real da página (referência enviada → cenário ajustado → resultado).
// Sem overlay e sem bloquear nada — a página continua 100% interativa.
//
// Abertura: automática quando a conta nunca gerou uma render (prop firstRender,
// derivada da contagem server-side) e o guia não foi dispensado; manual via
// /app/generate#guia (destino do tour da sidebar ou acesso direto). Depois da
// primeira render a contagem passa a ser > 0
// e o guia deixa de se oferecer — não há coluna nova nem migration.
//
// O botão "Ir para Gerar render" (com rolagem programática e pulso no CTA)
// saiu na reforma de vidro: ele existia porque o CTA nascia abaixo da dobra de
// uma coluna com 9 grupos empilhados. Agora o CTA mora num .spn-dock colado no
// rodapé do painel e nunca sai da tela — apontar pra ele virou redundância.

import { OnboardingVideo } from './OnboardingDemo'
import styles from './Onboarding.module.css'

export const GUIDE_DISMISSED_KEY = 'spn:generate-guide:dismissed'
export type GuidePhase = 'upload' | 'configure' | 'generating' | 'done'

const STEPS: { id: number; label: string }[] = [
  { id: 1, label: 'Referência' },
  { id: 2, label: 'Visualização' },
  { id: 3, label: 'Gerar' },
  { id: 4, label: 'Comparar' },
]

// Índice do passo ativo por fase — 'generating' e 'done' vivem no passo 3.
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
  onAdjust,
}: {
  phase: GuidePhase
  /** true = veio do fluxo Novo Space sem renders — o desfecho aponta o cartão de retorno. */
  fromSpacesNew: boolean
  onDismiss: () => void
  nodeCost?: number
  onUpload?: () => void
  onAdjust?: () => void
}) {
  const active = ACTIVE_STEP[phase]

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
              <OnboardingVideo />
            </div>
          </div>
        )}

        {phase === 'configure' && (
          <div className="spn-guide-tip">
            <strong>Missão 2: dê uma intenção à imagem.</strong> Você pode começar com a configuração atual.
            Para experimentar, mude apenas a luz. Confira o custo e clique em <strong>Gerar render</strong>.
            <div className={styles.tipActions}>
              {onAdjust && <button type="button" className="spn-pill" onClick={onAdjust}>Explorar a luz →</button>}
              {nodeCost !== undefined && <span>{nodeCost} Nodes nesta configuração</span>}
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
            <div className={styles.tipActions}><OnboardingVideo clip="review-result" /></div>
          </div>
        )}
      </div>
    </section>
  )
}
