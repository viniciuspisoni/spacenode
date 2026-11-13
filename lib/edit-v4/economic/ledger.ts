import { EconomicEditError } from './contracts'
import { EXTRA_VARIABLE_RESERVE_USD, INFRA_RESERVE_USD, MAX_ATTEMPT_PROCESSING_USD, STAGE_CAPS } from './policy'
export type Stage = keyof typeof STAGE_CAPS
export interface CostEntry {
  stage: Stage; provider: string; model: string; status: 'started'|'completed'|'failed'
  knownUsd: number | null; reserveUsd: number; requestId: string | null; durationMs: number
}
export interface Measured<T> { value: T; usd: number | null; requestId: string | null }
export class EditLedger {
  readonly entries: CostEntry[] = []
  constructor(private readonly checkpoint: (entries: CostEntry[]) => Promise<void>) {}
  get accountedUsd() { return INFRA_RESERVE_USD + EXTRA_VARIABLE_RESERVE_USD + this.entries.reduce((sum,e) => sum+(e.knownUsd ?? e.reserveUsd),0) }
  async run<T>(stage: Stage, provider: string, model: string, call: () => Promise<Measured<T>>): Promise<T> {
    const cap = STAGE_CAPS[stage]
    if (this.entries.some(e=>e.stage===stage) || this.accountedUsd+cap > MAX_ATTEMPT_PROCESSING_USD+1e-12) {
      throw new EconomicEditError('cost_limit', 'A edição excederia o limite de processamento. Nenhum node foi consumido.')
    }
    const entry: CostEntry = {stage,provider,model,status:'started',knownUsd:null,reserveUsd:cap,requestId:null,durationMs:0}
    this.entries.push(entry)
    // The reservation must be durable BEFORE the paid call. Unknown failures never cost zero.
    await this.checkpoint(structuredClone(this.entries))
    const start=Date.now()
    let measured: Measured<T>
    try { measured=await call() } catch (err) {
      entry.status='failed';entry.durationMs=Date.now()-start
      await this.checkpoint(structuredClone(this.entries));throw err
    }
    entry.status='completed';entry.durationMs=Date.now()-start;entry.requestId=measured.requestId
    entry.knownUsd=typeof measured.usd==='number'&&Number.isFinite(measured.usd)&&measured.usd>=0?measured.usd:null
    await this.checkpoint(structuredClone(this.entries))
    if (entry.knownUsd===null || entry.knownUsd>cap+1e-12 || this.accountedUsd>MAX_ATTEMPT_PROCESSING_USD+1e-12) {
      throw new EconomicEditError('cost_unconfirmed', 'O custo da edição precisa ser conferido. Nenhum node foi consumido.')
    }
    return measured.value
  }
}
