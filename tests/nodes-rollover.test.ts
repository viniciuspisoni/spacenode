// Acúmulo de Nodes mensais (2026-09-10).
//
// A regra nova troca "usou ou perdeu" por saldo cumulativo: a renovação SOMA,
// o cancelamento abre uma janela de 90 dias e só depois disso o saldo expira.
// Estes testes travam a parte da regra que mora em TypeScript — o prazo e o
// proporcional do upgrade. O resto (soma idempotente, preservação na
// reassinatura, expiração) é plpgsql e é verificado contra um Postgres de
// verdade em supabase/tests/cumulative_plan_nodes.test.sql.

import { describe, expect, it } from 'vitest'
import {
  NODES_GRACE_DAYS,
  NODES_GRACE_COPY,
  NODES_POLICY_COPY,
  NODES_ROLLOVER_COPY,
  graceDaysLeft,
  graceDeadline,
  isInGracePeriod,
  prorationNodes,
} from '@/lib/billing/nodes'
import { PLANS, getPlanById } from '@/lib/plans'

const DAY = 24 * 60 * 60 * 1000

describe('promessa ao usuário', () => {
  it('a frase da landing/billing/FAQ é exatamente a que o produto prometeu', () => {
    expect(NODES_ROLLOVER_COPY).toBe(
      'Nodes não utilizados acumulam enquanto sua assinatura estiver ativa.'
    )
  })

  it('a validade pós-cancelamento é de 90 dias, e a copy fala o mesmo número', () => {
    expect(NODES_GRACE_DAYS).toBe(90)
    expect(NODES_GRACE_COPY).toBe(
      'Após o cancelamento, seu saldo permanece disponível por 90 dias.'
    )
  })

  it('a explicação completa é a promessa seguida da contrapartida', () => {
    expect(NODES_POLICY_COPY).toBe(`${NODES_ROLLOVER_COPY} ${NODES_GRACE_COPY}`)
    // Nenhuma tela deve prometer o acúmulo sem dizer o prazo.
    expect(NODES_POLICY_COPY).toContain('acumulam enquanto sua assinatura estiver ativa')
    expect(NODES_POLICY_COPY).toContain('90 dias')
  })
})

describe('graceDeadline — 90 dias a partir do FIM da assinatura', () => {
  const now = new Date('2026-09-10T12:00:00.000Z')

  it('conta a partir do fim da assinatura quando o Stripe informa a data', () => {
    const endedAt = new Date('2026-09-01T00:00:00.000Z')
    expect(graceDeadline(endedAt, now).toISOString()).toBe('2026-11-30T00:00:00.000Z')
  })

  it('cai para "agora" quando o evento não traz ended_at nem canceled_at', () => {
    expect(graceDeadline(null, now).toISOString()).toBe('2026-12-09T12:00:00.000Z')
  })

  it('assinatura encerrada por inadimplência não ganha validade extra', () => {
    // O período acabou 20 dias atrás: contar de "agora" daria 110 dias de saldo.
    const endedAt = new Date(now.getTime() - 20 * DAY)
    const deadline = graceDeadline(endedAt, now)
    expect(graceDaysLeft(deadline, now)).toBe(NODES_GRACE_DAYS - 20)
  })

  it('ignora data inválida em vez de gerar um prazo NaN', () => {
    expect(graceDeadline(new Date('não é data'), now).toISOString())
      .toBe('2026-12-09T12:00:00.000Z')
  })

  it('cada encerramento abre uma janela NOVA, contada do próprio encerramento', () => {
    // Cancelou, reassinou (o grant zera o prazo) e cancelou de novo 40 dias
    // depois: a segunda janela nasce inteira do segundo encerramento, não do
    // que sobrava da primeira.
    const primeiroFim = new Date('2026-09-10T00:00:00.000Z')
    const segundoFim  = new Date('2026-10-20T00:00:00.000Z')

    const primeiraJanela = graceDeadline(primeiroFim, primeiroFim)
    const segundaJanela  = graceDeadline(segundoFim, segundoFim)

    expect(graceDaysLeft(segundaJanela, segundoFim)).toBe(NODES_GRACE_DAYS)
    expect(segundaJanela.getTime()).toBeGreaterThan(primeiraJanela.getTime())
  })
})

describe('graceDaysLeft / isInGracePeriod', () => {
  const now = new Date('2026-09-10T12:00:00.000Z')

  it('sem prazo (assinatura ativa, ou reassinatura) o saldo não tem validade', () => {
    expect(isInGracePeriod(null, now)).toBe(false)
    expect(isInGracePeriod(undefined, now)).toBe(false)
    expect(graceDaysLeft(null, now)).toBe(0)
  })

  it('prazo no futuro: dentro da janela, com os dias arredondados pra cima', () => {
    const deadline = new Date(now.getTime() + 9.2 * DAY).toISOString()
    expect(isInGracePeriod(deadline, now)).toBe(true)
    expect(graceDaysLeft(deadline, now)).toBe(10)
  })

  it('prazo vencido: fora da janela e sem dias restantes (nunca negativo)', () => {
    const deadline = new Date(now.getTime() - 3 * DAY).toISOString()
    expect(isInGracePeriod(deadline, now)).toBe(false)
    expect(graceDaysLeft(deadline, now)).toBe(0)
  })
})

describe('prorationNodes — upgrade no meio do ciclo', () => {
  const pro = getPlanById('pro')!

  it('credita a mesma fração de mês que a fatura de proporcional cobrou', () => {
    // Metade de uma mensalidade do Pro paga → metade dos nodes do Pro.
    const half = (pro.monthlyPrice * 100) / 2
    expect(prorationNodes(half, pro.monthlyPrice * 100, pro.nodes)).toBe(pro.nodes / 2)
  })

  it('downgrade não credita nada (fatura sem cobrança) e não mexe no saldo', () => {
    expect(prorationNodes(0, pro.monthlyPrice * 100, pro.nodes)).toBe(0)
    expect(prorationNodes(null, pro.monthlyPrice * 100, pro.nodes)).toBe(0)
    expect(prorationNodes(undefined, pro.monthlyPrice * 100, pro.nodes)).toBe(0)
  })

  it('nunca credita mais que um mês do plano novo, por maior que seja a fatura', () => {
    const huge = pro.monthlyPrice * 100 * 12
    expect(prorationNodes(huge, pro.monthlyPrice * 100, pro.nodes)).toBe(pro.nodes)
  })

  it('preço de referência ausente ou zerado não vira divisão por zero', () => {
    expect(prorationNodes(5000, 0, pro.nodes)).toBe(0)
    expect(Number.isFinite(prorationNodes(5000, 0, pro.nodes))).toBe(true)
  })

  it('devolve inteiro para todo plano do catálogo — nodes não são fracionários', () => {
    for (const plan of PLANS) {
      const nodes = prorationNodes(plan.monthlyPrice * 100 / 3, plan.monthlyPrice * 100, plan.nodes)
      expect(Number.isInteger(nodes)).toBe(true)
      expect(nodes).toBeGreaterThan(0)
      expect(nodes).toBeLessThanOrEqual(plan.nodes)
    }
  })
})
