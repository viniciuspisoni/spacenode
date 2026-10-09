import { describe, expect, it } from 'vitest'
import { aggregateCosts, invoiceBrl, localDate, monthRange, normalizeJob, seedreamScenario } from '@/lib/costs/aggregate'
import type { CostEvent } from '@/lib/costs/types'

const job = (extra = {}) => normalizeJob('renders', { id: 'r1', created_at: '2026-10-09T12:00:00Z', status: 'completed', engine: 'quasar', generation_log: { provider: 'ark', request_id: 'req1' }, ...extra })
const event = (extra = {}): CostEvent => ({ id: 'e1', created_at: '2026-10-09T12:00:00Z', module: 'Renderizar', provider: 'ark', endpoint: 'seedream', request_id: 'req1', status: 'completed', estimated_usd: 0.09, real_usd: null, duration_ms: 1000, ...extra })
describe('cost accounting boundaries', () => {
  it('never converts nodes or missing costs into free usage', () => {
    const report = aggregateCosts([job({ nodes_charged: 1000 })], [])
    expect(report.totals.knownUsd).toBe(0); expect(report.totals.pricedJobs).toBe(0)
    expect(normalizeJob('image_edit_attempts', { id: 'a', provider_cost_usd: null }).usd).toBeNull()
  })
  it('includes spend after rejection or credit refund', () => {
    const rejected = normalizeJob('image_edit_attempts', { id: 'a', status: 'rejected_quality_gate', provider: 'fal', provider_cost_usd: 0.0675, cost_nodes: 0 })
    const report = aggregateCosts([rejected], [])
    expect(report.totals.knownUsd).toBe(0.0675); expect(report.totals.delivered).toBe(0); expect(report.totals.rejected).toBe(1)
  })
  it('replaces historical estimates, includes losing branches, and deduplicates event IDs', () => {
    const historical = job({ generation_log: { provider: 'ark', request_id: 'req1', orion: { cost: { estimated_usd: 0.3 } } } })
    const report = aggregateCosts([historical], [event(), event(), event({ id: 'e2', provider: 'fal', request_id: 'losing-hedge', estimated_usd: 0.135 })])
    expect(report.totals.knownUsd).toBeCloseTo(0.225); expect(report.providers.find(p => p.key === 'fal')?.knownUsd).toBeCloseTo(0.135); expect(report.totals.jobs).toBe(1)
  })
  it('uses actual cost instead of adding it to an estimate', () => {
    const report = aggregateCosts([job()], [event({ real_usd: 0.08 })])
    expect(report.totals.realUsd).toBe(0.08); expect(report.totals.estimatedUsd).toBe(0)
  })
  it('distinguishes confirmed zero from unknown costs', () => {
    const free = aggregateCosts([], [event({ request_id: null, real_usd: 0 })])
    expect(free.totals.knownUsd).toBe(0); expect(free.totals.pricedEntries).toBe(1)
    expect(aggregateCosts([], [event({ request_id: null, estimated_usd: null })]).totals.pricedEntries).toBe(0)
  })
  it('does not claim price coverage for an unpriced matched event', () => {
    const historical = job({ generation_log: { request_id: 'req1', orion: { cost: { estimated_usd: 0.3 } } } })
    const report = aggregateCosts([historical], [event({ estimated_usd: null })])
    expect(report.totals.pricedJobs).toBe(0); expect(report.totals.unknownCalls).toBe(1)
  })
  it('keeps failed calls unpriced', () => {
    const report = aggregateCosts([], [event({ status: 'failed', estimated_usd: null, request_id: null })])
    expect(report.totals.unknownCalls).toBe(1); expect(report.totals.realUsd).toBe(0)
  })
  it('compares equal output area and includes additional references', () => {
    const one = seedreamScenario(1000, 2048 ** 2, 1), three = seedreamScenario(1000, 2048 ** 2, 3)
    expect(one.fal).toBe(135); expect(one.ark).toBe(90); expect(one.percent).toBeCloseTo(1 / 3)
    expect(three.fal).toBeCloseTo(144); expect(three.ark).toBeCloseTo(96)
    expect(seedreamScenario(1000, 1536 ** 2, 1).ark).toBe(45)
  })
  it('does not apply USD exchange to BRL invoices', () => {
    const invoice = { provider: 'vercel', month: '2026-10', currency: 'BRL' as const, amount: 100, note: '' }
    expect(invoiceBrl(invoice, 5.4)).toBe(100); expect(invoiceBrl({ ...invoice, currency: 'USD' }, 5.4)).toBe(540)
  })
  it('handles São Paulo month boundaries and year rollover', () => {
    expect(localDate('2026-10-01T01:00:00Z')).toBe('2026-09-30')
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01T00:00:00-03:00', to: '2027-01-01T00:00:00-03:00' })
    expect(() => monthRange('2026-13')).toThrow()
  })
  it('returns no private prompts, URLs or user IDs', () => {
    const report = aggregateCosts([job({ prompt: 'private', input_url: 'secret-url', user_id: 'secret-user' })], [])
    expect(JSON.stringify(report)).not.toContain('private'); expect(JSON.stringify(report)).not.toContain('secret-')
  })
})
