// Contador de alcance do saldo (Renderizar) + nome de exibição do plano.
//
// O contador da UI é floor(saldo_total / getNodesCost(motor, qualidade)) —
// aqui a mesma conta é fixada para TODAS as combinações válidas motor ×
// qualidade com o saldo de cadastro (80 nodes). Se a tabela de custos de
// lib/engines mudar, este teste força a revisão consciente do alcance do
// trial (quantas imagens um recém-cadastrado consegue gerar).

import { describe, expect, it } from 'vitest'
import { ENGINES, ENGINE_ORDER, getNodesCost } from '@/lib/engines'
import { FREE_PLAN_LABEL, getPlanDisplayName } from '@/lib/plan-display'

const SIGNUP_NODES = 80

describe('contador de renders (floor(saldo / custo))', () => {
  // Combinações válidas hoje: vega 2k/4k, pulsar hd/2k/4k, quasar 2k
  // (o Quasar perdeu o 4K na PR #167 — Seedream 5.0 Pro só vai até 2K).
  const expected: Record<string, number> = {
    'vega:2k':   4,  // 20 nodes
    'vega:4k':   2,  // 40 nodes
    'pulsar:hd': 8,  // 10 nodes — default econômico da conta free
    'pulsar:2k': 5,  // 15 nodes
    'pulsar:4k': 3,  // 25 nodes
    'quasar:2k': 2,  // 28 nodes
  }

  it('cobre todas as combinações válidas do catálogo', () => {
    const all = ENGINE_ORDER.flatMap(eid =>
      ENGINES[eid].resolutions.map(res => `${eid}:${res}`)
    )
    expect(all.sort()).toEqual(Object.keys(expected).sort())
  })

  for (const [combo, renders] of Object.entries(expected)) {
    const [engine, res] = combo.split(':') as [keyof typeof ENGINES, 'hd' | '2k' | '4k']
    it(`${combo} → ~${renders} render(s) com ${SIGNUP_NODES} nodes`, () => {
      expect(Math.floor(SIGNUP_NODES / getNodesCost(engine, res))).toBe(renders)
    })
  }

  it('saldo insuficiente zera o contador (gate do CTA)', () => {
    expect(Math.floor(9 / getNodesCost('pulsar', 'hd'))).toBe(0)
  })
})

describe('getPlanDisplayName — fonte única do nome do plano', () => {
  it('sem assinatura ativa é sempre "Gratuito"', () => {
    expect(getPlanDisplayName('free')).toBe(FREE_PLAN_LABEL)
    expect(getPlanDisplayName(null)).toBe(FREE_PLAN_LABEL)
    expect(getPlanDisplayName(undefined)).toBe(FREE_PLAN_LABEL)
    expect(getPlanDisplayName('plano-legado-desconhecido')).toBe(FREE_PLAN_LABEL)
  })

  it('nunca devolve "Beta" (status do produto não é plano)', () => {
    for (const id of ['free', 'starter', 'pro', 'studio', 'office', null, undefined, 'x']) {
      expect(getPlanDisplayName(id as string | null | undefined)).not.toBe('Beta')
    }
  })

  it('planos pagos usam o nome do catálogo', () => {
    expect(getPlanDisplayName('starter')).toBe('Starter')
    expect(getPlanDisplayName('pro')).toBe('Pro')
    expect(getPlanDisplayName('studio')).toBe('Studio')
    expect(getPlanDisplayName('office')).toBe('Office')
  })
})
