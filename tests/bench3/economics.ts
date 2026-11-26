// Contas puras do bench 3.0: custo de chamada, plano de gasto, margem, kappa e
// a regra de decisão. Sem rede, sem fs — testado em logic.test.ts.

import {
  ESSENCE_ANNUAL_NODE_BRL, STUDIO_ANNUAL_NODE_BRL, TARGET_MARGIN, TOKENS, WASTAGE_FACTOR,
  genById, llmById, nodeUsd, type LlmSpec,
} from './config'

// ── Custo ───────────────────────────────────────────────────────────────────

export function llmCallUsd(spec: Pick<LlmSpec, 'inPerM' | 'outPerM'>, inputTokens: number, outputTokens: number): number {
  return (inputTokens * spec.inPerM + outputTokens * spec.outPerM) / 1_000_000
}

export interface PlanInput {
  cases: number
  readers: string[]
  generators: string[]
  judges: string[]
  repeat: number
  /** Quantas repetições por (caso × motor) vão ao juiz. Default 1. */
  judgedRepeats?: number
}

export interface PlanLine { phase: 'A' | 'B' | 'C'; id: string; calls: number; unitUsd: number; usd: number; verified: boolean }

export function planCost(p: PlanInput): { lines: PlanLine[]; totalUsd: number; byPhase: Record<'A' | 'B' | 'C', number> } {
  const lines: PlanLine[] = []
  for (const id of p.readers) {
    const s = llmById(id); if (!s) throw new Error(`leitor desconhecido: ${id}`)
    const unit = llmCallUsd(s, TOKENS.read.input, TOKENS.read.output)
    lines.push({ phase: 'A', id, calls: p.cases, unitUsd: unit, usd: unit * p.cases, verified: s.verified })
  }
  for (const id of p.generators) {
    const g = genById(id); if (!g) throw new Error(`motor desconhecido: ${id}`)
    const calls = p.cases * p.repeat
    lines.push({ phase: 'B', id, calls, unitUsd: g.estUsd, usd: g.estUsd * calls, verified: g.verified })
  }
  const judged = p.cases * p.generators.length * Math.min(p.repeat, p.judgedRepeats ?? 1)
  for (const id of p.judges) {
    const s = llmById(id); if (!s) throw new Error(`juiz desconhecido: ${id}`)
    const unit = llmCallUsd(s, TOKENS.judge.input, TOKENS.judge.output)
    lines.push({ phase: 'C', id, calls: judged, unitUsd: unit, usd: unit * judged, verified: s.verified })
  }
  const byPhase = { A: 0, B: 0, C: 0 }
  for (const l of lines) byPhase[l.phase] += l.usd
  return { lines, totalUsd: byPhase.A + byPhase.B + byPhase.C, byPhase }
}

// ── Margem e preço em nodes ─────────────────────────────────────────────────

export interface PipelineCost {
  readUsd: number
  genUsd: number
  judgeUsd: number
  /** Tentativas esperadas por entrega (1 + taxa de retry). */
  expectedAttempts: number
  /** Fração de leituras servidas pelo cache por input_url. */
  readCacheHit?: number
}

export function deliveryUsd(c: PipelineCost): number {
  const read = c.readUsd * (1 - (c.readCacheHit ?? 0))
  return (read + c.expectedAttempts * (c.genUsd + c.judgeUsd)) * WASTAGE_FACTOR
}

export function nodesFor75(costUsd: number, nodeBrl = ESSENCE_ANNUAL_NODE_BRL, margin = TARGET_MARGIN): number {
  const cap = nodeUsd(nodeBrl) * (1 - margin)
  return Math.max(1, Math.ceil(costUsd / cap - 1e-9))
}

export function marginAt(nodes: number, costUsd: number, nodeBrl = ESSENCE_ANNUAL_NODE_BRL): number {
  const revenue = nodes * nodeUsd(nodeBrl)
  return revenue > 0 ? 1 - costUsd / revenue : -1
}

export const marginStudio = (nodes: number, costUsd: number) => marginAt(nodes, costUsd, STUDIO_ANNUAL_NODE_BRL)

// ── Estatística ─────────────────────────────────────────────────────────────

/** Kappa de Cohen para rótulos binários (juiz × humano). null se indefinido. */
export function cohenKappa(pairs: Array<[boolean, boolean]>): number | null {
  const n = pairs.length
  if (n === 0) return null
  let agree = 0, aYes = 0, bYes = 0
  for (const [a, b] of pairs) { if (a === b) agree++; if (a) aYes++; if (b) bYes++ }
  const po = agree / n
  const pe = (aYes / n) * (bYes / n) + (1 - aYes / n) * (1 - bYes / n)
  if (pe === 1) return po === 1 ? 1 : null
  return (po - pe) / (1 - pe)
}

/** Intervalo de Wilson 95% para uma proporção. */
export function wilson(successes: number, n: number): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: 0, lo: 0, hi: 0 }
  const z = 1.96, p = successes / n
  const den = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) }
}

// ── Regra de decisão ────────────────────────────────────────────────────────

export interface Candidate {
  id: string
  tier: string
  acceptRate: number
  /** Custo por entrega do pipeline completo (deliveryUsd). */
  deliveryUsd: number
  nodes: number
}

/**
 * Por faixa: entre os que fecham ≥75% no Essence no preço proposto, vence a
 * maior taxa de aceite humano; empate de até `tieBand` vai para o mais barato.
 */
export function pickWinner(cands: Candidate[], tieBand = 0.03): Candidate | null {
  const ok = cands.filter(c => marginAt(c.nodes, c.deliveryUsd) >= TARGET_MARGIN)
  if (ok.length === 0) return null
  const best = Math.max(...ok.map(c => c.acceptRate))
  return ok
    .filter(c => best - c.acceptRate <= tieBand + 1e-9)
    .sort((a, b) => a.deliveryUsd - b.deliveryUsd)[0]
}

/** Custo por imagem aceita: o número que importa, não o custo por chamada. */
export function costPerAccepted(totalUsd: number, accepted: number): number | null {
  return accepted > 0 ? totalUsd / accepted : null
}
