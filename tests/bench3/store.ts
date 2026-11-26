// Arquivos do bench 3.0. Tudo mora em tests/bench3/data/ (no .gitignore:
// prints de cliente não sobem para o git).
//
//   data/inputs/        prints de entrada; o prefixo do nome define a categoria
//   data/reads/         leitura por (caso × leitor)      → <caso>--<leitor>.json
//   data/outputs/       renders por (caso × motor × rep)  → <caso>--<motor>--<rep>.png + .json
//   data/judges/        conferência por (render × juiz)   → <render>--<juiz>.json
//   data/e2e/           ponta a ponta (fase D)
//   data/labels.json    rótulos humanos exportados da página de rotulagem
//   data/ledger.jsonl   uma linha por chamada paga (custo estimado, tokens, tempo)
//
// O runner é retomável: se o arquivo de resultado já existe, a chamada não se repete.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DATA = join(process.cwd(), 'tests', 'bench3', 'data')
export const DIRS = {
  inputs: join(DATA, 'inputs'),
  reads: join(DATA, 'reads'),
  outputs: join(DATA, 'outputs'),
  judges: join(DATA, 'judges'),
  e2e: join(DATA, 'e2e'),
}
export const LEDGER = join(DATA, 'ledger.jsonl')
export const LABELS = join(DATA, 'labels.json')

export const CATEGORIES = ['interior', 'fachada', 'espelho', 'sketchup', 'outro'] as const
export type Category = typeof CATEGORIES[number]

export interface BenchCase { name: string; file: string; category: Category; projectType: 'interior' | 'exterior' }

export function ensureDirs(): void {
  for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true })
}

export const safe = (s: string) => s.replace(/[^a-z0-9._-]+/gi, '-')

/**
 * Prefixos aceitos: interior-, fachada-/exterior-, espelho- (vidro/espelho/cortina),
 * sketchup- (sem textura). Um segundo prefixo -ext/-int fixa o projectType dos
 * casos espelho/sketchup (ex.: sketchup-ext-casa.png). Default: interior.
 */
export function categorize(fileName: string): { category: Category; projectType: 'interior' | 'exterior' } {
  const f = fileName.toLowerCase()
  const category: Category =
    f.startsWith('interior') ? 'interior'
      : f.startsWith('fachada') || f.startsWith('exterior') ? 'fachada'
        : f.startsWith('espelho') ? 'espelho'
          : f.startsWith('sketchup') ? 'sketchup' : 'outro'
  const projectType = category === 'fachada' || /^[a-z]+-ext[-_]/.test(f) ? 'exterior' : 'interior'
  return { category, projectType }
}

export function listCases(limit?: number): BenchCase[] {
  if (!existsSync(DIRS.inputs)) return []
  const all = readdirSync(DIRS.inputs)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map(f => ({ name: safe(f.replace(/\.[^.]+$/, '')), file: join(DIRS.inputs, f), ...categorize(f) }))
  return limit ? all.slice(0, limit) : all
}

export const readPath = (c: string, reader: string) => join(DIRS.reads, `${c}--${reader}.json`)
export const outKey = (c: string, gen: string, rep: number) => `${c}--${gen}--${rep}`
export const outPng = (key: string) => join(DIRS.outputs, `${key}.png`)
export const outMeta = (key: string) => join(DIRS.outputs, `${key}.json`)
export const judgePath = (key: string, judge: string) => join(DIRS.judges, `${key}--${judge}.json`)

export function readJson<T>(path: string): T | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : null
}
export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2))
}

export interface LedgerEntry {
  at: string
  phase: 'A' | 'B' | 'C' | 'D'
  kind: 'read' | 'generate' | 'judge'
  id: string
  case: string
  usd: number
  estimated: boolean
  ms: number
  ok: boolean
  error?: string | null
  inputTokens?: number
  outputTokens?: number
}

export function appendLedger(e: LedgerEntry): void {
  mkdirSync(DATA, { recursive: true })
  appendFileSync(LEDGER, JSON.stringify(e) + '\n')
}

export function readLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER)) return []
  return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as LedgerEntry)
}

/**
 * Teto de gasto da execução. Cada chamada reserva o custo estimado ANTES de sair;
 * passou do teto, a chamada não sai e o runner para com erro.
 */
export class SpendCap {
  private spent = 0
  constructor(readonly capUsd: number) {}
  reserve(usd: number, what: string): void {
    if (this.spent + usd > this.capUsd + 1e-9) {
      throw new Error(`teto de gasto atingido: US$ ${this.spent.toFixed(2)} + ${usd.toFixed(3)} (${what}) > US$ ${this.capUsd.toFixed(2)}`)
    }
    this.spent += usd
  }
  /** Ajusta a reserva para o custo medido depois da chamada. */
  settle(reserved: number, actual: number): void { this.spent += actual - reserved }
  get total(): number { return this.spent }
}
