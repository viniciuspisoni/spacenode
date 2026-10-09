export type RawRow = Record<string, unknown>
export interface CostJob {
  id: string; table: string; date: string; module: string; model: string; provider: string
  status: string; attempts: number; retries: number; fallback: boolean; durationMs: number | null
  nodes: number; approved: boolean; feedback: 'useful' | 'not_useful' | null
  usd: number | null; partial: boolean; requestIds: string[]
}
export interface CostEvent {
  id: string; created_at: string; module: string; provider: string; endpoint: string
  request_id: string | null; status: 'completed' | 'failed'
  estimated_usd: number | null; real_usd: number | null; duration_ms: number | null
}
export interface CostInvoice {
  provider: string; month: string; currency: 'USD' | 'BRL'; amount: number; note: string
}
export interface CostGroup {
  key: string; label: string; jobs: number; delivered: number; knownUsd: number
  pricedEntries: number; pricedJobs: number; unknownCalls: number; retries: number
  fallbacks: number; approved: number; useful: number; feedbackCount: number
  durationMs: number | null; nodes: number
}
export interface CostsDashboard {
  month: string; generatedAt: string; inventory: import('./catalog').ApiIntegration[]
  providers: CostGroup[]; modules: CostGroup[]; models: CostGroup[]
  daily: { date: string; usd: number; jobs: number }[]
  totals: CostGroup & { rejected: number; failed: number; partialJobs: number; realUsd: number; estimatedUsd: number }
  invoices: CostInvoice[]; invoicesAvailable: boolean
  sources: { table: string; rows: number; available: boolean; truncated: boolean }[]
  warnings: string[]
}
