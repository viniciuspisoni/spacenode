// Relatório do bench 3.0: junta saídas, leituras, vereditos, rótulos humanos
// e o ledger num markdown (data/report.md) + JSON (data/report.json).
// Puro sobre os arquivos de data/ — não chama fornecedor.

import { existsSync } from 'node:fs'
import { GENERATORS, LLMS, SAME_FAMILY, TOKENS, genById, llmById } from './config'
import { strictPass, type JudgeVerdict, type ReadContract } from './contract'
import {
  cohenKappa, costPerAccepted, deliveryUsd, llmCallUsd, marginAt, marginStudio, nodesFor75, pickWinner, wilson, type Candidate,
} from './economics'
import { blindId, type Labels } from './labels-page'
import {
  LABELS, judgePath, listCases, outKey, outMeta, readJson, readLedger, readPath, type BenchCase,
} from './store'

export interface OutputMeta { key: string; case: string; gen: string; rep: number; ok: boolean; error: string | null; geometry: number | null; ms: number; usd: number; width: number | null; height: number | null }
export interface ReadFile { reader: string; case: string; ok: boolean; error: string | null; usd: number; ms: number; contract: ReadContract | null }
export interface JudgeFile { judge: string; key: string; ok: boolean; error: string | null; usd: number; ms: number; verdict: JudgeVerdict | null; inventoryFrom: string }

const pct = (x: number | null | undefined) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`)
const usd = (x: number | null | undefined, d = 3) => (x == null ? '—' : `US$ ${x.toFixed(d)}`)
const quant = (xs: number[], q: number) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Leitor e juiz por faixa ao montar o custo do pipeline. */
export const TIER_PIPELINE: Record<string, { reader: string; judge: string }> = {
  rascunho: { reader: 'haiku55', judge: 'haiku55' },
  padrao:   { reader: 'sonnet55', judge: 'sonnet55' },
  premium:  { reader: 'opus55', judge: 'sonnet55' },
}

export function buildReport(opts: { cases?: BenchCase[]; repeat: number; generators: string[]; readers: string[]; judges: string[] }) {
  const cases = opts.cases ?? listCases()
  const labels = readJson<Labels>(LABELS)
  const ledger = readLedger()

  // ── Geração ──
  const outputs: OutputMeta[] = []
  for (const c of cases) for (const g of opts.generators) for (let r = 1; r <= opts.repeat; r++) {
    const m = readJson<OutputMeta>(outMeta(outKey(c.name, g, r)))
    if (m) outputs.push(m)
  }
  const genRows = opts.generators.map(id => {
    const spec = genById(id)!
    const rs = outputs.filter(o => o.gen === id)
    const ok = rs.filter(o => o.ok)
    const labeled = ok.filter(o => labels?.renders[blindId(o.key)])
    const accepted = labeled.filter(o => labels!.renders[blindId(o.key)].accept).length
    const w = wilson(accepted, labeled.length)
    const reasons: Record<string, number> = {}
    for (const o of labeled) for (const x of labels!.renders[blindId(o.key)].reasons) reasons[x] = (reasons[x] ?? 0) + 1
    return {
      id, label: spec.label, tier: spec.tier, n: rs.length, failed: rs.length - ok.length,
      geometry: mean(ok.map(o => o.geometry ?? 0)),
      p50: quant(ok.map(o => o.ms), 0.5), p90: quant(ok.map(o => o.ms), 0.9),
      estUsd: spec.estUsd, verified: spec.verified,
      labeled: labeled.length, accepted, acceptRate: labeled.length ? w.p : null, ciLo: w.lo, ciHi: w.hi,
      costPerAccepted: labeled.length ? costPerAccepted(spec.estUsd * labeled.length, accepted) : null,
      topReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', '),
    }
  })

  // ── Leitura ──
  const readerRows = opts.readers.map(id => {
    const files = cases.map(c => readJson<ReadFile>(readPath(c.name, id))).filter((f): f is ReadFile => !!f)
    const ok = files.filter(f => f.ok && f.contract)
    let items = 0, wrong = 0, missing = 0, reviewed = 0
    for (const f of ok) {
      const lab = labels?.reads[blindId(`${f.case}--${id}`)]
      if (!lab) continue
      reviewed++
      items += f.contract!.inventario.length
      wrong += lab.wrongIds.length
      missing += lab.missing
    }
    return {
      id, label: llmById(id)!.label, n: files.length, failed: files.length - ok.length,
      avgItems: mean(ok.map(f => f.contract!.inventario.length)),
      reviewed, precision: items ? 1 - wrong / items : null, missingPerCase: reviewed ? missing / reviewed : null,
      usdMean: mean(ok.map(f => f.usd)), p50: quant(ok.map(f => f.ms), 0.5),
    }
  })

  // ── Juiz ──
  const judgeRows = opts.judges.map(id => {
    const spec = llmById(id)!
    const pairs: Array<[boolean, boolean]> = []
    let falseAccept = 0, humanReject = 0, n = 0, failed = 0, skippedFamily = 0
    const costs: number[] = []
    for (const o of outputs.filter(x => x.ok)) {
      const gen = genById(o.gen)!
      if (SAME_FAMILY[gen.family] === spec.family) { skippedFamily++; continue }
      const j = readJson<JudgeFile>(judgePath(o.key, id))
      if (!j) continue
      n++
      if (!j.ok || !j.verdict) { failed++; continue }
      costs.push(j.usd)
      const human = labels?.renders[blindId(o.key)]
      if (!human) continue
      const contract = readJson<ReadFile>(readPath(o.case, j.inventoryFrom))?.contract
      const judgePass = contract ? strictPass(j.verdict, contract) : j.verdict.veredito === 'entregar'
      pairs.push([judgePass, human.accept])
      if (!human.accept) { humanReject++; if (judgePass) falseAccept++ }
    }
    return {
      id, label: spec.label, n, failed, skippedFamily, labeledPairs: pairs.length,
      kappa: cohenKappa(pairs), agreement: pairs.length ? pairs.filter(([a, b]) => a === b).length / pairs.length : null,
      falseAcceptRate: humanReject ? falseAccept / humanReject : null, usdMean: mean(costs),
    }
  })

  // ── Faixas: custo do pipeline, nodes para 75% e vencedor ──
  const measuredLlm = (id: string, kind: 'read' | 'judge') => {
    const xs = ledger.filter(e => e.id === id && e.kind === kind && e.ok).map(e => e.usd)
    return mean(xs)
  }
  const tiers = ['rascunho', 'padrao', 'premium'].map(tier => {
    const pipe = TIER_PIPELINE[tier]
    // Sem medida no ledger, usa a tarifa do PRÓPRIO modelo com os tokens do plano.
    const readUsd = measuredLlm(pipe.reader, 'read') ?? llmCallUsd(llmById(pipe.reader)!, TOKENS.read.input, TOKENS.read.output)
    const judgeUsd = measuredLlm(pipe.judge, 'judge') ?? llmCallUsd(llmById(pipe.judge)!, TOKENS.judge.input, TOKENS.judge.output)
    const cands: Array<Candidate & { margin20: number; studio: number }> = genRows
      .filter(g => g.tier === tier && g.acceptRate != null)
      .map(g => {
        const cost = deliveryUsd({ readUsd, genUsd: g.estUsd, judgeUsd, expectedAttempts: 1 + (1 - g.acceptRate!) })
        const nodes = nodesFor75(cost)
        return { id: g.id, tier, acceptRate: g.acceptRate!, deliveryUsd: cost, nodes, margin20: marginAt(20, cost), studio: marginStudio(nodes, cost) }
      })
    return { tier, pipe, readUsd, judgeUsd, cands, winner: pickWinner(cands) }
  })

  const spent = ledger.reduce((a, e) => a + e.usd, 0)
  return { cases: cases.length, outputs: outputs.length, labeled: labels ? Object.keys(labels.renders).length : 0, genRows, readerRows, judgeRows, tiers, spent, ledgerEntries: ledger.length }
}

export function reportMarkdown(r: ReturnType<typeof buildReport>): string {
  const L: string[] = []
  L.push('# Bench Renderizar 3.0 — relatório', '')
  L.push(`Casos: ${r.cases} · renders: ${r.outputs} · rótulos humanos: ${r.labeled} · gasto estimado no ledger: ${usd(r.spent, 2)} (${r.ledgerEntries} chamadas)`, '')
  if (!r.labeled) L.push('> Sem rótulos humanos ainda: taxas de aceite, kappa e vencedores ficam vazios. Abra data/labels.html, rotule e exporte para data/labels.json.', '')

  L.push('## Geração', '', '| Motor | Faixa | n | falhas | geometria | p50 / p90 | US$/img (est.) | aceite humano (IC 95%) | custo por aceita | motivos de reprovação |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |')
  for (const g of r.genRows) {
    L.push(`| ${g.label} | ${g.tier} | ${g.n} | ${g.failed} | ${g.geometry?.toFixed(3) ?? '—'} | ${g.p50 ? (g.p50 / 1000).toFixed(0) : '—'}s / ${g.p90 ? (g.p90 / 1000).toFixed(0) : '—'}s | ${usd(g.estUsd)}${g.verified ? '' : '*'} | ${g.acceptRate == null ? '—' : `${pct(g.acceptRate)} (${pct(g.ciLo)}–${pct(g.ciHi)}), ${g.accepted}/${g.labeled}`} | ${usd(g.costPerAccepted)} | ${g.topReasons || '—'} |`)
  }
  L.push('', '\\* preço de terceiros ou derivado de tokens; reconciliar com a fatura da fal.', '')

  L.push('## Leitura', '', '| Leitor | n | falhas | itens/caso | revisados | precisão | faltas/caso | US$ medido | p50 |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const x of r.readerRows) {
    L.push(`| ${x.label} | ${x.n} | ${x.failed} | ${x.avgItems?.toFixed(1) ?? '—'} | ${x.reviewed} | ${pct(x.precision)} | ${x.missingPerCase?.toFixed(1) ?? '—'} | ${usd(x.usdMean, 4)} | ${x.p50 ? (x.p50 / 1000).toFixed(0) + 's' : '—'} |`)
  }
  L.push('')

  L.push('## Conferência', '', 'Meta para ligar um juiz: kappa ≥ 0,6 contra o rótulo humano e falso aprovado baixo. Juiz da mesma família do motor não entra na conta.', '',
    '| Juiz | julgados | falhas | pulados (família) | pares rotulados | kappa | concordância | falso aprovado | US$ medido |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const j of r.judgeRows) {
    L.push(`| ${j.label} | ${j.n} | ${j.failed} | ${j.skippedFamily} | ${j.labeledPairs} | ${j.kappa?.toFixed(2) ?? '—'} | ${pct(j.agreement)} | ${pct(j.falseAcceptRate)} | ${usd(j.usdMean, 4)} |`)
  }
  L.push('')

  L.push('## Faixas do catálogo 3.0', '', 'Custo por entrega = (leitura + E[t] × (geração + juiz)) × 1,08, com E[t] = 1 + taxa de reprovação humana do motor. Nodes = mínimo para 75% no Essence anual.', '')
  for (const t of r.tiers) {
    L.push(`### ${t.tier} — leitor ${llmById(t.pipe.reader)!.label}, juiz ${llmById(t.pipe.judge)!.label}`, '')
    if (!t.cands.length) { L.push('Sem candidatos rotulados nesta faixa.', ''); continue }
    L.push('| Motor | aceite | custo/entrega | nodes p/ 75% | margem a 20 nodes | margem Studio no preço |', '| --- | ---: | ---: | ---: | ---: | ---: |')
    for (const c of t.cands) L.push(`| ${genById(c.id)!.label}${t.winner?.id === c.id ? ' **← vencedor**' : ''} | ${pct(c.acceptRate)} | ${usd(c.deliveryUsd)} | ${c.nodes} | ${pct(c.margin20)} | ${pct(c.studio)} |`)
    L.push('')
  }
  L.push('Regra: entre os que fecham ≥ 75%, vence a maior taxa de aceite; empate de até 3 pontos vai para o mais barato.')
  return L.join('\n')
}

export const ALL_GENERATOR_IDS = GENERATORS.map(g => g.id)
export const ALL_LLM_IDS = LLMS.map(l => l.id)
export const hasLabels = () => existsSync(LABELS)
