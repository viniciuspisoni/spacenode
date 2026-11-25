// lib/bench-v3/runner.ts
//
// Orquestra a bancada SpaceNode 3.0 em fases independentes e retomáveis:
//
//   plan      conta chamadas e o teto de gasto (sem custo)
//   read      camada 1: cada leitor gera a ficha de cada print
//   generate  camada 2: cada motor gera N repetições + nota geométrica
//   judge     camada 3: cada juiz confere a repetição 1 de cada motor
//   report    agrega custos, notas e decisões; gera a planilha do arquiteto
//
// Tudo que foi feito com sucesso fica em results.jsonl e não é refeito. O
// custo de tentativas que falharam também fica registrado e entra no teto.
// Os adaptadores são injetáveis para os testes rodarem sem fornecedor.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import sharp from 'sharp'
import { buildFidelityPrompt, type BriefingArquitetonico, type GenerateOptions } from '@/lib/prompts'
import { SYSTEM_PROMPT as READER_SYSTEM, USER_PROMPT as READER_USER, parseBriefing } from '@/lib/fidelity-engine'
import { computeGeometryScore } from '@/lib/ai/fidelity/geometry-score'
import { BudgetGuard, BudgetExceededError } from './budget'
import { reserveUsd, type ImageEngine, type VisionModel } from './catalog'
import { generateBenchImage, resolveRoute, type ImageInput, type ImageOutcome } from './image-adapters'
import { callVision, prepareVisionImage, type VisionOutcome, type VisionRequest } from './vision-adapters'
import { JUDGE_SYSTEM, buildChecklist, decide, judgeUserPrompt, parseVerdict, type JudgeVerdict } from './judge'

export interface BenchCase { id: string; type: 'interior' | 'exterior'; file: string; checks: string[] }

export interface BenchConfig {
  inputDir: string
  manifestPath: string
  outDir: string
  engines: ImageEngine[]
  readers: VisionModel[]
  judges: VisionModel[]
  repeats: number
  capUsd: number
  concurrency: number
  /** Leitor cuja ficha alimenta o prompt da geração (isola o efeito do motor). */
  briefingReader: string | null
  /** Repetição avaliada pelos juízes e pelo arquiteto. */
  judgedRun: number
}

export interface BenchDeps {
  generate: (engine: ImageEngine, prompt: string, input: ImageInput) => Promise<ImageOutcome>
  vision: (m: VisionModel, r: VisionRequest) => Promise<VisionOutcome>
  geometry: (a: Buffer, b: Buffer) => Promise<{ score: number; edgeRecall: number; meanColorDelta: number; worstCellColorDelta: number }>
  log: (msg: string) => void
}

export const realDeps: BenchDeps = {
  generate: generateBenchImage,
  vision: callVision,
  geometry: computeGeometryScore,
  log: (m) => console.log(m),
}

export interface BenchRecordBase {
  phase: 'read' | 'generate' | 'judge'
  key: string
  ok: boolean
  case: string
  /** Leitor, motor ou juiz. */
  subject: string
  run?: number
  engine?: string
  costUsd: number
  costKnown: boolean
  latencyMs: number | null
  error?: string
  at: string
}
/** Registro gravado: campos fixos mais os dados próprios de cada fase. */
export type BenchRecord = BenchRecordBase & Record<string, unknown>
type NewRecord = Omit<BenchRecordBase, 'at'> & Record<string, unknown>
type RecordBase = Omit<BenchRecordBase, 'at' | 'ok' | 'costUsd' | 'costKnown' | 'latencyMs'>

// ── Casos ────────────────────────────────────────────────────────────────────

interface ManifestCase { id: string; type: 'interior' | 'exterior'; checks?: string[] }

export function loadCases(inputDir: string, manifestPath: string): BenchCase[] {
  if (!existsSync(inputDir)) return []
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { cases: ManifestCase[] }).cases
    : []
  return readdirSync(inputDir)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map(f => {
      const type = /^interior/i.test(f) ? 'interior' as const : 'exterior' as const
      const id = f.slice(0, -extname(f).length).replace(/^(interior|exterior)-/i, '')
      const m = manifest.find(c => c.id === id)
      return { id, type, file: join(inputDir, f), checks: m?.checks ?? [] }
    })
}

// ── Plano e orçamento ────────────────────────────────────────────────────────

export function engineReserveUsd(e: ImageEngine): number {
  return resolveRoute(e).kind === 'fal' && e.falUsd !== undefined ? e.falUsd : e.maxUsd
}

export interface BenchPlan {
  cases: number
  reads: number
  generations: number
  judgements: number
  maxUsd: { read: number; generate: number; judge: number; total: number }
}

export function plan(cfg: BenchConfig, cases: number): BenchPlan {
  const read = cases * cfg.readers.reduce((a, m) => a + reserveUsd(m, 'reader'), 0)
  const generate = cases * cfg.repeats * cfg.engines.reduce((a, e) => a + engineReserveUsd(e), 0)
  const judge = cases * cfg.engines.length * cfg.judges.reduce((a, m) => a + reserveUsd(m, 'judge'), 0)
  return {
    cases,
    reads: cases * cfg.readers.length,
    generations: cases * cfg.repeats * cfg.engines.length,
    judgements: cases * cfg.engines.length * cfg.judges.length,
    maxUsd: { read, generate, judge, total: read + generate + judge },
  }
}

// ── Armazenamento ────────────────────────────────────────────────────────────

class Store {
  readonly records: BenchRecord[] = []
  private readonly file: string
  constructor(readonly dir: string) {
    mkdirSync(join(dir, 'images'), { recursive: true })
    mkdirSync(join(dir, 'briefings'), { recursive: true })
    this.file = join(dir, 'results.jsonl')
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, 'utf8').split('\n')) {
        if (line.trim()) this.records.push(JSON.parse(line) as BenchRecord)
      }
    }
  }
  done(key: string): boolean { return this.records.some(r => r.key === key && r.ok) }
  latestOk(key: string): BenchRecord | undefined { return [...this.records].reverse().find(r => r.key === key && r.ok) }
  spentUsd(): number { return this.records.reduce((a, r) => a + r.costUsd, 0) }
  add(r: BenchRecord): void {
    this.records.push(r)
    appendFileSync(this.file, `${JSON.stringify(r)}\n`)
  }
}

const safe = (s: string) => s.replace(/[^a-z0-9._-]+/gi, '-')
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0
  let stop: unknown = null
  const worker = async () => {
    while (i < items.length && !stop) {
      const item = items[i++]
      try { await fn(item) } catch (e) { stop = e }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker))
  if (stop) throw stop
}

async function loadInput(file: string): Promise<ImageInput> {
  const buffer = readFileSync(file)
  const meta = await sharp(buffer).metadata()
  const mime = meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg'
  return { buffer, mime, width: meta.width ?? 0, height: meta.height ?? 0 }
}

// ── Execução ─────────────────────────────────────────────────────────────────

export class BenchRunner {
  readonly store: Store
  readonly guard: BudgetGuard
  readonly cases: BenchCase[]

  constructor(readonly cfg: BenchConfig, readonly deps: BenchDeps = realDeps) {
    this.store = new Store(cfg.outDir)
    this.cases = loadCases(cfg.inputDir, cfg.manifestPath)
    this.guard = new BudgetGuard(cfg.capUsd, this.store.spentUsd())
  }

  private record(r: NewRecord): void {
    this.store.add({ ...r, at: new Date().toISOString() })
  }

  /** Reserva, executa e registra; falha também cobra (teto, se o custo for desconhecido). */
  private async paid<T extends { costUsd: number | null; latencyMs: number }>(
    reserve: number, base: RecordBase,
    call: () => Promise<T>, onOk: (out: T) => Promise<Record<string, unknown>>,
  ): Promise<T | null> {
    const res = this.guard.reserve(reserve)
    let out: T
    try {
      out = await call()
    } catch (e) {
      const usd = this.guard.settle(res, null)
      this.record({ ...base, ok: false, costUsd: usd, costKnown: false, latencyMs: null, error: errMsg(e) })
      this.deps.log(`[bench-v3] FALHA ${base.key}: ${errMsg(e)}`)
      return null
    }
    const usd = this.guard.settle(res, out.costUsd)
    let extra: Record<string, unknown>
    try {
      extra = await onOk(out)
    } catch (e) {
      this.record({ ...base, ok: false, costUsd: usd, costKnown: out.costUsd !== null, latencyMs: out.latencyMs, error: errMsg(e) })
      this.deps.log(`[bench-v3] FALHA pós-chamada ${base.key}: ${errMsg(e)}`)
      return null
    }
    this.record({ ...base, ok: true, costUsd: usd, costKnown: out.costUsd !== null, latencyMs: out.latencyMs, ...extra })
    return out
  }

  private briefingFile(caseId: string, reader: string): string {
    return join(this.cfg.outDir, 'briefings', `${safe(caseId)}--${safe(reader)}.json`)
  }

  private readBriefing(caseId: string, reader: string | null): BriefingArquitetonico | null {
    if (!reader) return null
    const f = this.briefingFile(caseId, reader)
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) as BriefingArquitetonico : null
  }

  async read(): Promise<void> {
    const jobs = this.cases.flatMap(c => this.cfg.readers.map(m => ({ c, m, key: `read|${c.id}|${m.id}` })))
      .filter(j => !this.store.done(j.key))
    this.deps.log(`[bench-v3] leitura: ${jobs.length} chamadas pendentes`)
    await pool(jobs, this.cfg.concurrency, async ({ c, m, key }) => {
      const img = await prepareVisionImage(readFileSync(c.file))
      await this.paid(reserveUsd(m, 'reader'), { phase: 'read', key, case: c.id, subject: m.id },
        () => this.deps.vision(m, { system: READER_SYSTEM, user: READER_USER, images: [img], maxOutputTokens: 8_000, effort: 'medium' }),
        async (out) => {
          if (out.refused) throw new Error('recusa do modelo')
          const briefing = parseBriefing(out.text)
          writeFileSync(this.briefingFile(c.id, m.id), JSON.stringify(briefing, null, 2))
          return { inputTokens: out.inputTokens, outputTokens: out.outputTokens, providerModel: out.providerModel }
        })
    })
  }

  async generate(): Promise<void> {
    const jobs = this.cases.flatMap(c => this.cfg.engines.flatMap(e =>
      Array.from({ length: this.cfg.repeats }, (_, i) => ({ c, e, run: i + 1, key: `gen|${c.id}|${e.id}|${i + 1}` }))))
      .filter(j => !this.store.done(j.key))
    this.deps.log(`[bench-v3] geração: ${jobs.length} imagens pendentes`)
    await pool(jobs, this.cfg.concurrency, async ({ c, e, run, key }) => {
      const input = await loadInput(c.file)
      const briefing = this.readBriefing(c.id, this.cfg.briefingReader)
      const options: GenerateOptions = {
        projectType: c.type, segment: 'Residencial', environment: '',
        lighting: 'Preservar Original', background: 'Preservar Original', sceneElements: [],
        geometryLock: 85, fidelityMode: 'strict', fidelityLevel: 'maximum',
      }
      const prompt = buildFidelityPrompt(options, 'maximum', briefing ?? undefined, { engine: e.promptProfile })
      const imageFile = join(this.cfg.outDir, 'images', `${safe(c.id)}--${safe(e.id)}--${run}.png`)
      await this.paid(engineReserveUsd(e), { phase: 'generate', key, case: c.id, subject: e.id, engine: e.id, run },
        () => this.deps.generate(e, prompt, input),
        async (out) => {
          writeFileSync(imageFile, out.buffer)
          const g = await this.deps.geometry(input.buffer, out.buffer)
          this.deps.log(`[bench-v3] ${c.id} ${e.id} #${run}: nota=${g.score.toFixed(3)} US$${(out.costUsd ?? engineReserveUsd(e)).toFixed(3)} ${Math.round(out.latencyMs / 1000)}s`)
          return {
            imageFile, provider: out.provider, providerModel: out.providerModel, costSource: out.costSource,
            requestedSize: out.requestedSize, deliveredSize: out.width && out.height ? `${out.width}x${out.height}` : null,
            briefingReader: briefing ? this.cfg.briefingReader : null,
            geometry: { score: g.score, edgeRecall: g.edgeRecall, meanColorDelta: g.meanColorDelta, worstCellColorDelta: g.worstCellColorDelta },
          }
        })
    })
  }

  async judge(): Promise<void> {
    const run = this.cfg.judgedRun
    const jobs = this.cases.flatMap(c => this.cfg.engines.flatMap(e => this.cfg.judges.map(m => ({
      c, e, m, key: `judge|${c.id}|${e.id}|${run}|${m.id}`, gen: this.store.latestOk(`gen|${c.id}|${e.id}|${run}`),
    })))).filter(j => j.gen && !this.store.done(j.key))
    this.deps.log(`[bench-v3] conferência: ${jobs.length} avaliações pendentes`)
    await pool(jobs, this.cfg.concurrency, async ({ c, e, m, key, gen }) => {
      const briefing = this.readBriefing(c.id, this.cfg.briefingReader)
      const items = buildChecklist(briefing, c.checks)
      const images = [await prepareVisionImage(readFileSync(c.file)), await prepareVisionImage(readFileSync(String(gen!.imageFile)))]
      await this.paid(reserveUsd(m, 'judge'), { phase: 'judge', key, case: c.id, subject: m.id, engine: e.id, run },
        () => this.deps.vision(m, { system: JUDGE_SYSTEM, user: judgeUserPrompt(items), images, maxOutputTokens: 6_000, effort: 'low' }),
        async (out) => {
          if (out.refused) throw new Error('recusa do modelo')
          const verdict: JudgeVerdict = parseVerdict(out.text, items)
          return { inputTokens: out.inputTokens, outputTokens: out.outputTokens, items, verdict, ruleDecision: decide(verdict) }
        })
    })
  }

  /** Executa as fases pedidas na ordem; para no teto sem perder o que foi feito. */
  async run(phases: ('read' | 'generate' | 'judge')[]): Promise<{ stoppedByBudget: boolean }> {
    try {
      for (const p of phases) await this[p]()
      return { stoppedByBudget: false }
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        this.deps.log(`[bench-v3] PARADO: ${e.message}`)
        return { stoppedByBudget: true }
      }
      throw e
    }
  }
}
