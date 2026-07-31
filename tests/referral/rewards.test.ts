import { describe, it, expect } from 'vitest'
import { summarizeRewards, rewardStatusLabel, type RewardRow, type RewardStatus } from '@/lib/referral/rewards'

let seq = 0
function reward(status: RewardStatus, percent = 20): RewardRow {
  seq += 1
  return {
    id: `r${seq}`,
    percent_off: percent,
    status,
    available_at: '2026-09-10T00:00:00.000Z',
    applied_invoice_id: status === 'applied' ? 'in_1' : null,
    applied_at: null,
    consumed_at: status === 'consumed' ? '2026-10-01T00:00:00.000Z' : null,
    created_at: '2026-09-03T00:00:00.000Z',
  }
}

describe('resumo do painel', () => {
  it('zera sem recompensa', () => {
    const s = summarizeRewards([])
    expect(s.availablePercent).toBe(0)
    expect(s.nextInvoicePercent).toBe(0)
    expect(s.progressCount).toBe(0)
    expect(s.progressRemaining).toBe(5)
  })

  it('separa os estados', () => {
    const s = summarizeRewards([
      reward('available'), reward('available'),
      reward('pending'),
      reward('applied'),
      reward('consumed'),
      reward('revoked'),
    ])
    expect(s.availablePercent).toBe(40)
    expect(s.pendingPercent).toBe(20)
    expect(s.appliedPercent).toBe(20)
    expect(s.consumedPercent).toBe(20)
  })

  it('recompensa revogada não conta em lugar nenhum', () => {
    const s = summarizeRewards([reward('revoked'), reward('revoked')])
    expect(s.availablePercent).toBe(0)
    expect(s.pendingPercent).toBe(0)
    expect(s.nextInvoicePercent).toBe(0)
  })

  it('cinco indicações fecham a mensalidade', () => {
    const s = summarizeRewards(Array.from({ length: 5 }, () => reward('available')))
    expect(s.availablePercent).toBe(100)
    expect(s.nextInvoicePercent).toBe(100)
    expect(s.freeMonthsBanked).toBe(1)
    expect(s.progressCount).toBe(0)
    expect(s.progressRemaining).toBe(5)
  })

  it('o excedente não entra na mesma mensalidade — fica para as seguintes', () => {
    const s = summarizeRewards(Array.from({ length: 7 }, () => reward('available')))
    expect(s.availablePercent).toBe(140)
    expect(s.nextInvoicePercent).toBe(100)   // teto por mensalidade
    expect(s.freeMonthsBanked).toBe(1)
    expect(s.progressCount).toBe(2)          // 40% rumo à próxima mensalidade grátis
    expect(s.progressRemaining).toBe(3)
  })

  it('duas mensalidades inteiras acumuladas', () => {
    const s = summarizeRewards(Array.from({ length: 10 }, () => reward('available')))
    expect(s.freeMonthsBanked).toBe(2)
    expect(s.progressCount).toBe(0)
    expect(s.nextInvoicePercent).toBe(100)
  })

  it('o progresso é uma fração entre 0 e 1', () => {
    for (let n = 0; n <= 12; n++) {
      const s = summarizeRewards(Array.from({ length: n }, () => reward('available')))
      expect(s.progressRatio).toBeGreaterThanOrEqual(0)
      expect(s.progressRatio).toBeLessThan(1.0001)
    }
  })
})

describe('rótulos de estado', () => {
  it('cobre todos os estados sem cair em undefined', () => {
    const all: RewardStatus[] = ['pending', 'available', 'applied', 'consumed', 'revoked']
    for (const status of all) {
      expect(rewardStatusLabel(status)).toBeTruthy()
    }
  })
})
