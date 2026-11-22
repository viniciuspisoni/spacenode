'use client'

import { useEffect, useRef, useState } from 'react'
import { writeIntentCookie } from '@/lib/analytics/attribution'
import { track } from '@/lib/analytics/client'
import { startLandingCheckout } from '@/lib/billing/landing-checkout'
import { NODES_ROLLOVER_COPY } from '@/lib/billing/nodes'
import { getNodesCost } from '@/lib/engines'
import { EXTRA_NODE_PACKS } from '@/lib/extra-nodes'
import { formatBRL } from '@/lib/launch-offer'
import {
  ANNUAL_BILLING_ENABLED, ANNUAL_DISCOUNT_PERCENT, SELLABLE_PLANS,
  recommendPlan, type BillingCycle, type SellablePlanId,
} from '@/lib/plans'
import { supportWhatsAppUrl } from '@/lib/support'
import styles from './EditorialPricing.module.css'

const planDetails: Record<SellablePlanId, { audience: string; features: string[] }> = {
  essence: {
    audience: 'Para quem apresenta projetos pontualmente.',
    features: ['Ferramentas de IA para o seu projeto', 'Compra de Nodes extras', 'Suporte por e-mail'],
  },
  pro: {
    audience: 'Para quem apresenta novas imagens toda semana.',
    features: ['Tudo do Essence', 'Link de apresentação com a sua marca'],
  },
  studio: {
    audience: 'Para escritórios com vários projetos em andamento.',
    features: ['Tudo do Pro', 'Suporte prioritário'],
  },
}

const examples = [
  { label: 'HD · Pulsar', cost: getNodesCost('pulsar', 'hd') },
  { label: '2K · Vega', cost: getNodesCost('vega', '2k') },
  { label: '4K · Vega', cost: getNodesCost('vega', '4k') },
]
const hdCost = examples[0].cost
const number = new Intl.NumberFormat('pt-BR')

function VolumeCalculator() {
  const [renders, setRenders] = useState(40)
  const [quality, setQuality] = useState(examples[0])
  const required = renders * quality.cost
  const suggested = recommendPlan(required)
  const extraPack = required > suggested.nodes
    ? EXTRA_NODE_PACKS.find(pack => pack.nodes >= required - suggested.nodes)
    : undefined

  return (
    <details className={styles.calculator}>
      <summary>Quantos renders cabem no meu plano?</summary>
      <div className={styles.controls}>
        <label htmlFor="monthly-renders">
          Renders por mês <strong>{renders}</strong>
          <input id="monthly-renders" type="range" min="5" max="200" step="5" value={renders}
            onChange={event => setRenders(Number(event.target.value))} />
        </label>
        <fieldset className={styles.quality}>
          <legend>Resolução e tecnologia</legend>
          <div>{examples.map(example => (
            <button type="button" key={example.label} aria-pressed={quality === example}
              onClick={() => setQuality(example)}>{example.label}</button>
          ))}</div>
        </fieldset>
      </div>
      <p className={styles.result} aria-live="polite">
        {renders} renders × {quality.cost} Nodes = <strong>{number.format(required)} Nodes por mês.</strong>{' '}
        Seu volume cabe no <strong>{suggested.name}
          {extraPack && ` com o pacote de ${number.format(extraPack.nodes)} Nodes extras`}</strong>.
      </p>
    </details>
  )
}

export function EditorialPricing() {
  const section = useRef<HTMLElement>(null)
  const [billing, setBilling] = useState<BillingCycle>(ANNUAL_BILLING_ENABLED ? 'annual' : 'monthly')
  const [pending, setPending] = useState<SellablePlanId | null>(null)
  const [failed, setFailed] = useState<SellablePlanId | null>(null)

  useEffect(() => {
    if (!section.current || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        track('plans_viewed', { surface: 'landing' })
        observer.disconnect()
      }
    }, { threshold: 0.1 })
    observer.observe(section.current)
    return () => observer.disconnect()
  }, [])

  function selectCycle(cycle: BillingCycle) {
    if (cycle === billing) return
    setBilling(cycle)
    setFailed(null)
    track('cta_clicked', { surface: 'landing', cta: 'billing_cycle', billing: cycle })
  }

  async function selectPlan(id: SellablePlanId) {
    setPending(id)
    setFailed(null)
    track('cta_clicked', { surface: 'landing', cta: 'pricing_card', plan: id, billing })
    let navigating = false
    try {
      await startLandingCheckout(id, billing, {
        fetch: window.fetch.bind(window),
        rememberIntent: writeIntentCookie,
        navigate: url => {
          window.location.assign(url)
          navigating = true
        },
      })
    } catch {
      // A resposta sem destino e uma falha de rede permitem tentar de novo.
    }
    if (navigating) return
    setPending(null)
    setFailed(id)
  }

  return (
    <section id="precos" ref={section} className={styles.section} data-cta-position="pricing" aria-labelledby="plans-title">
      <div id="planos" className={styles.inner}>
        <header className={styles.header}>
          <div>
            <h2 id="plans-title">Planos para o seu ritmo de trabalho.</h2>
            <p>Os Nodes são os créditos que você usa para gerar imagens e vídeos. Escolha o volume de que precisa por mês.</p>
          </div>
          {ANNUAL_BILLING_ENABLED && (
            <div className={styles.toggle} role="group" aria-label="Período de cobrança">
              <button type="button" aria-pressed={billing === 'monthly'} disabled={pending !== null}
                onClick={() => selectCycle('monthly')}>Mensal</button>
              <button type="button" aria-pressed={billing === 'annual'} disabled={pending !== null}
                onClick={() => selectCycle('annual')}>Anual <small>−{ANNUAL_DISCOUNT_PERCENT}%</small></button>
            </div>
          )}
        </header>

        <div className={styles.cards}>
          {SELLABLE_PLANS.map(plan => {
            const detail = planDetails[plan.id]
            const price = billing === 'annual' ? plan.annualMonthlyPrice : plan.monthlyPrice
            const renders = Math.floor(plan.nodes / hdCost)
            return (
              <article key={plan.id} className={styles.card} data-featured={plan.recommended} aria-labelledby={`plan-${plan.id}`}>
                <div className={styles.name}>
                  <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
                  {plan.recommended && <span>Recomendado</span>}
                </div>
                <p className={styles.audience}>{detail.audience}</p>
                <p className={styles.price}><span>R$</span>{formatBRL(price)}<small>/ mês</small></p>
                {billing === 'annual' && <p className={styles.annual}>R$ {formatBRL(plan.annualTotal)} cobrados ao ano</p>}
                <div className={styles.allowance}>
                  <strong>{number.format(plan.nodes)} Nodes por mês</strong>
                  <span>Até {number.format(renders)} renders HD com o Pulsar</span>
                  <small>≈ R$ {formatBRL(price / renders)} por render nesse uso</small>
                </div>
                <ul className={styles.features}>
                  {detail.features.map(feature => <li key={feature}>{feature}</li>)}
                </ul>
                <button type="button" disabled={pending !== null} className={styles.checkout}
                  onClick={() => void selectPlan(plan.id)}>
                  {pending === plan.id ? 'Abrindo…' : plan.cta}
                </button>
                {failed === plan.id && <p role="alert" className={styles.error}>Não foi possível abrir o pagamento. Tente novamente.</p>}
              </article>
            )
          })}
        </div>

        <p className={styles.note}>As estimativas consideram o saldo mensal usado apenas no Pulsar HD, a {hdCost} Nodes por render. {NODES_ROLLOVER_COPY}</p>
        <VolumeCalculator />
        <p className={styles.contact}>Precisa de mais volume?{' '}
          <a href={supportWhatsAppUrl('Olá! Preciso de mais volume de Nodes para o meu escritório.')} target="_blank" rel="noopener noreferrer">
            Fale com a SpaceNode
          </a>
        </p>
      </div>
    </section>
  )
}
