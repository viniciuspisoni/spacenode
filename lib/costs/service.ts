import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateCosts, amount, monthRange, normalizeJob } from './aggregate'
import { apiInventory } from './catalog'
import type { CostEvent, CostInvoice, CostsDashboard, RawRow } from './types'

const SOURCES = [
  ['renders', 'id,created_at,status,engine,resolution,ambient,source_tool,video_job_id,review_status,nodes_charged,retry_count,duration_ms,fal_request_id,generation_log,upscale_meta'],
  ['edit_v3_jobs', 'id,created_at,status,provider,model,request_id,nodes_cost'],
  ['edits', 'id,created_at,engine,nodes_cost,review_status,duration_ms,retry_count,fal_request_id,generation_log'],
  ['image_edit_attempts', 'id,created_at,status,provider,endpoint,cost_nodes,provider_cost_usd,auto_retry_count,result_image_id'],
  ['blocos3d_jobs', 'id,created_at,status,provider,engine,nodes_cost'],
  ['video_jobs', 'id,created_at,status,model_id,provider_endpoint,provider_request_id,nodes_cost,render_id'],
  ['api_cost_events', 'id,created_at,module,provider,endpoint,request_id,status,estimated_usd,real_usd,duration_ms'],
  ['render_feedback', 'render_id,useful,created_at'],
] as const
const PAGE = 500, LIMIT = 20_000
export async function readCostRows(admin: SupabaseClient, table: string, select: string, from: string, to: string) {
  const rows: RawRow[] = []
  for (let offset = 0; offset < LIMIT; offset += PAGE) {
    const result = await admin.from(table).select(select).gte('created_at', from).lt('created_at', to).order('created_at', { ascending: true }).order(table === 'render_feedback' ? 'render_id' : 'id', { ascending: true }).range(offset, offset + PAGE - 1)
    if (result.error) { console.warn(`[costs] cannot read ${table}: ${result.error.code}`); return { rows: [] as RawRow[], table, available: false, truncated: false } }
    const batch = (result.data ?? []) as unknown as RawRow[]
    rows.push(...batch)
    if (batch.length < PAGE) return { rows, table, available: true, truncated: false }
  }
  return { rows, table, available: true, truncated: true }
}
export async function loadCostsDashboard(admin: SupabaseClient, month: string): Promise<CostsDashboard> {
  const { from, to } = monthRange(month)
  const reads = await Promise.all(SOURCES.map(([table, select]) => readCostRows(admin, table, select, from, to)))
  const warnings: string[] = []
  for (const r of reads) {
    if (!r.available) warnings.push(`Fonte indisponível: ${r.table}. Seus valores não estão no total monitorado.`)
    if (r.truncated) warnings.push(`${r.table}: limite de ${LIMIT.toLocaleString('pt-BR')} linhas atingido. O painel mostra um subtotal.`)
  }
  const linkedVideoRenders = new Set(reads.find(r => r.table === 'video_jobs')?.rows.map(r => r.render_id).filter(Boolean))
  const linkedEditIds = new Set(reads.find(r => r.table === 'image_edit_attempts')?.rows.map(r => r.result_image_id).filter(Boolean))
  const jobs = reads.filter(r => !['api_cost_events', 'render_feedback'].includes(r.table)).flatMap(r => r.rows.filter(row => !(r.table === 'renders' && linkedVideoRenders.has(row.id)) && !(r.table === 'edits' && linkedEditIds.has(row.id))).map(row => normalizeJob(r.table, row)))
  const feedback = new Map((reads.find(r => r.table === 'render_feedback')?.rows ?? []).map(r => [r.render_id, r.useful]))
  for (const j of jobs) if (j.table === 'renders' && feedback.has(j.id)) j.feedback = feedback.get(j.id) === true ? 'useful' : 'not_useful'
  const events = (reads.find(r => r.table === 'api_cost_events')?.rows ?? []) as unknown as CostEvent[]
  const report = aggregateCosts(jobs, events)
  if (report.totals.pricedJobs < report.totals.jobs) warnings.push('Há operações sem custo em moeda. O consumo monitorado é um subtotal; nodes não foram convertidos em despesa.')
  if (events.some(e => e.estimated_usd === null && e.real_usd === null)) warnings.push('Há chamadas registradas sem tarifa ou custo de cobrança. Falhas e timeouts podem ter sido cobrados pelo fornecedor.')
  warnings.push('Estimativas não incluem automaticamente todos os tokens, créditos promocionais, impostos, planos e tráfego. Faturas ficam separadas do consumo, sem somar duas vezes a mesma despesa.')
  const invoiceRead = await admin.from('api_cost_invoices').select('provider,month,currency,amount,note').eq('month', `${month}-01`)
  if (invoiceRead.error) warnings.push('Faturas indisponíveis. Verifique o schema de custos para salvar os lançamentos.')
  const invoices: CostInvoice[] = (invoiceRead.data ?? []).map(row => ({ ...row, month: String(row.month).slice(0, 7), amount: amount(row.amount) ?? 0 }))
  return { month, generatedAt: new Date().toISOString(), inventory: apiInventory(), ...report, invoices, invoicesAvailable: !invoiceRead.error, sources: reads.map(r => ({ table: r.table, rows: r.rows.length, available: r.available, truncated: r.truncated })), warnings }
}
