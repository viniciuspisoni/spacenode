import { normalizeProvider, PROVIDER_NAMES } from './catalog'
import { callCostUsd } from '@/lib/edit-v4/pricing'
import type { CostEvent, CostGroup, CostInvoice, CostJob, RawRow } from './types'

export const obj = (v: unknown): RawRow => v && typeof v === 'object' && !Array.isArray(v) ? v as RawRow : {}
export const amount = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const str = (v: unknown, fallback = '') => typeof v === 'string' ? v : fallback
const array = (v: unknown): RawRow[] => Array.isArray(v) ? v.map(obj) : []
const ids = (...values: unknown[]) => [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))]
export function localDate(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time - 3 * 60 * 60 * 1000).toISOString().slice(0, 10) : value.slice(0, 10)
}
export function normalizeJob(table: string, row: RawRow): CostJob {
  const log = obj(row.generation_log)
  const up = obj(row.upscale_meta)
  const attempts = array(obj(log.fidelity).attempts)
  const cost = obj(obj(log.orion).cost)
  const base: CostJob = {
    id: str(row.id), table, date: localDate(str(row.created_at)),
    module: table === 'video_jobs' ? 'Animar' : table === 'renders' ? (row.ambient === 'upscale' ? 'Ampliar' : row.ambient === 'video' || row.video_job_id ? 'Animar' : str(row.source_tool).startsWith('apresentar') ? 'Apresentar' : 'Renderizar') : table === 'blocos3d_jobs' ? 'Blocos 3D' : 'Editar',
    model: str(row.model, str(log.provider_model, str(row.provider_endpoint, str(row.endpoint, str(row.engine, 'Sem modelo'))))),
    provider: normalizeProvider(row.provider ?? log.provider ?? (row.ambient === 'upscale' ? 'fal' : null)),
    status: str(row.status, table === 'edits' ? 'completed' : 'unknown'),
    attempts: Math.max(1, attempts.length, array(up.steps).length),
    retries: Math.max(0, Number(row.retry_count ?? row.auto_retry_count) || attempts.length - 1),
    fallback: Boolean(log.fallback_used ?? up.fallback_used) || attempts.some(a => a.fallback_used === true),
    durationMs: amount(row.duration_ms ?? up.total_duration_ms),
    nodes: amount(row.nodes_charged ?? row.nodes_cost ?? row.cost_nodes ?? row.cost_credits) ?? 0,
    approved: row.review_status === 'approved', feedback: null, usd: null, partial: false,
    requestIds: ids(row.fal_request_id, row.provider_request_id, row.request_id, log.request_id, ...attempts.map(a => a.request_id), ...array(up.steps).map(s => s.requestId ?? s.request_id)),
  }
  // Rejection or a credit refund does not remove a paid provider call.
  if (table === 'image_edit_attempts') { base.usd = amount(row.provider_cost_usd); base.partial = base.retries > 0 }
  else if (amount(cost.estimated_usd) !== null) { base.usd = amount(cost.estimated_usd); base.partial = base.attempts > 1 || (Array.isArray(cost.missing) && cost.missing.length > 0) }
  return base
}
const blank = (key: string, label = key): CostGroup => ({ key, label, jobs: 0, delivered: 0, knownUsd: 0, pricedEntries: 0, pricedJobs: 0, unknownCalls: 0, retries: 0, fallbacks: 0, approved: 0, useful: 0, feedbackCount: 0, durationMs: null, nodes: 0 })
export function aggregateCosts(jobs: CostJob[], events: CostEvent[]) {
  const providers = new Map<string, CostGroup>(), modules = new Map<string, CostGroup>(), models = new Map<string, CostGroup>()
  const daily = new Map<string, { date: string; usd: number; jobs: number }>()
  const durations = new Map<CostGroup, { sum: number; count: number }>()
  const total = { ...blank('total', 'Total'), rejected: 0, failed: 0, partialJobs: 0, realUsd: 0, estimatedUsd: 0 }
  const get = (map: Map<string, CostGroup>, key: string, label = key) => { if (!map.has(key)) map.set(key, blank(key, label)); return map.get(key)! }
  const day = (date: string) => { if (!daily.has(date)) daily.set(date, { date, usd: 0, jobs: 0 }); return daily.get(date)! }
  const eventByRequest = new Map<string, CostEvent[]>(), jobByRequest = new Map<string, CostJob>()
  for (const j of jobs) for (const id of j.requestIds) jobByRequest.set(id, j)
  for (const e of events) if (e.request_id) eventByRequest.set(e.request_id, [...(eventByRequest.get(e.request_id) ?? []), e])
  for (const j of jobs) {
    const groups = [total, get(providers, j.provider, PROVIDER_NAMES[j.provider] ?? j.provider), get(modules, j.module), get(models, `${j.provider}:${j.model}`, j.model)]
    const linked = j.requestIds.flatMap(id => eventByRequest.get(id) ?? [])
    const priced = linked.length ? linked.some(e => amount(e.real_usd) !== null || amount(e.estimated_usd) !== null) : j.usd !== null
    for (const g of groups) {
      g.jobs++; g.delivered += Number(j.status === 'completed'); g.pricedJobs += Number(priced)
      g.retries += j.retries; g.fallbacks += Number(j.fallback); g.approved += Number(j.approved); g.nodes += j.nodes
      g.feedbackCount += Number(j.feedback !== null); g.useful += Number(j.feedback === 'useful')
      if (j.durationMs !== null) { const prev = durations.get(g) ?? { sum: 0, count: 0 }; durations.set(g, { sum: prev.sum + j.durationMs, count: prev.count + 1 }) }
    }
    total.rejected += Number(j.status.startsWith('rejected')); total.failed += Number(j.status === 'failed')
    total.partialJobs += Number(j.partial || linked.some(e => e.real_usd === null && e.estimated_usd === null))
    day(j.date).jobs++
    // Linked events replace old job estimates, never add to them.
    if (!linked.length && j.usd !== null) { for (const g of groups) { g.knownUsd += j.usd; g.pricedEntries++ }; day(j.date).usd += j.usd; total.estimatedUsd += j.usd }
  }
  const seen = new Set<string>()
  for (const e of events) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const provider = normalizeProvider(e.provider), owner = e.request_id ? jobByRequest.get(e.request_id) : null
    const usd = amount(e.real_usd) ?? amount(e.estimated_usd), model = owner?.model ?? e.endpoint
    const groups = [total, get(providers, provider, PROVIDER_NAMES[provider] ?? provider), get(modules, owner?.module ?? e.module), get(models, `${provider}:${model}`, model)]
    if (usd === null) { for (const g of groups) g.unknownCalls++; continue }
    for (const g of groups) { g.knownUsd += usd; g.pricedEntries++ }
    day(localDate(e.created_at)).usd += usd
    if (amount(e.real_usd) !== null) total.realUsd += usd; else total.estimatedUsd += usd
  }
  for (const [g, values] of durations) g.durationMs = values.sum / values.count
  const sorted = (map: Map<string, CostGroup>) => [...map.values()].sort((a, b) => b.knownUsd - a.knownUsd || b.jobs - a.jobs)
  return { totals: total, providers: sorted(providers), modules: sorted(modules), models: sorted(models), daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)) }
}
export function invoiceBrl(invoice: CostInvoice, fx: number) { return invoice.amount * (invoice.currency === 'USD' ? fx : 1) }
export function seedreamScenario(calls: number, pixels: number, images: number) {
  const fal = calls * callCostUsd({ provider: 'fal', outputPixels: pixels, inputImages: images })
  const ark = calls * callCostUsd({ provider: 'ark', outputPixels: pixels, inputImages: images })
  return { fal, ark, savings: fal - ark, percent: fal > 0 ? (fal - ark) / fal : 0 }
}
export function validMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 2020 && Number(value.slice(0, 4)) <= 2100 }
export function monthRange(month: string) {
  if (!validMonth(month)) throw new Error('Mês inválido')
  const [year, m] = month.split('-').map(Number), next = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 7)
  return { from: `${month}-01T00:00:00-03:00`, to: `${next}-01T00:00:00-03:00` }
}
