// Runner do bench do Renderizar 3.0 — ver docs/BENCH-RENDERIZAR-3.md.
//
// ⚠️ As fases read, generate, judge e e2e GASTAM DINHEIRO DE VERDADE. Nunca rodam
// na suíte normal: só com BENCH3=1, e cada fase paga exige BENCH3_APPROVE_USD
// (teto em dólares). O runner calcula o custo estimado da fase ANTES da primeira
// chamada e recusa se passar do teto; durante a execução, cada chamada reserva
// o custo e nada sai depois do teto.
//
//   BENCH3=1 BENCH3_PHASE=plan     npx vitest run tests/bench3/bench3.test.ts   (grátis)
//   BENCH3=1 BENCH3_PHASE=check    …   (grátis: chaves, IDs de modelo, inputs)
//   BENCH3=1 BENCH3_PHASE=read     BENCH3_APPROVE_USD=12  …   (fase A)
//   BENCH3=1 BENCH3_PHASE=generate BENCH3_APPROVE_USD=80  …   (fase B)
//   BENCH3=1 BENCH3_PHASE=labels   …   (grátis: gera data/labels.html)
//   BENCH3=1 BENCH3_PHASE=judge    BENCH3_APPROVE_USD=25  …   (fase C)
//   BENCH3=1 BENCH3_PHASE=report   …   (grátis: data/report.md)
//   BENCH3=1 BENCH3_PHASE=e2e      BENCH3_APPROVE_USD=12  …   (fase D)
//
// Retomável: o que já tem arquivo em data/ não é chamado de novo.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeGeometryScore } from '@/lib/ai/fidelity/geometry-score'
import { loadEnvLocal } from '../helpers/env-local'
import {
  DEFAULT_GENERATORS, DEFAULT_JUDGES, DEFAULT_READERS, DEFAULT_REPEAT, LLMS, SAME_FAMILY, TOKENS, genById, llmById,
} from './config'
import { JUDGE_SCHEMA, JUDGE_SYSTEM, READ_SCHEMA, READ_SYSTEM, READ_USER, judgeUser, type JudgeVerdict, type ReadContract } from './contract'
import { llmCallUsd, planCost } from './economics'
import { runHarness } from './harness'
import { benchPrompt, generate, uploadInput } from './image'
import { blindId, buildLabelsHtml, type LabelCase } from './labels-page'
import { checkModels, prepImage, visionJson } from './llm'
import { buildReport, reportMarkdown, type JudgeFile, type OutputMeta, type ReadFile } from './report'
import {
  DATA, DIRS, SpendCap, appendLedger, ensureDirs, judgePath, listCases, outKey, outMeta, outPng, readJson, readPath, writeJson,
  type BenchCase,
} from './store'

loadEnvLocal()

const ON = process.env.BENCH3 === '1'
const PHASE = (process.env.BENCH3_PHASE ?? 'plan').trim()
const list = (env: string | undefined, dflt: string[]) => (env ? env.split(',').map(s => s.trim()).filter(Boolean) : dflt)
const READERS = list(process.env.BENCH3_READERS, DEFAULT_READERS)
const GENS = list(process.env.BENCH3_GENERATORS, DEFAULT_GENERATORS)
const JUDGES = list(process.env.BENCH3_JUDGES, DEFAULT_JUDGES)
const REPEAT = Math.max(1, Math.min(5, Number(process.env.BENCH3_REPEAT) || DEFAULT_REPEAT))
const JUDGED_REPEATS = Math.max(1, Number(process.env.BENCH3_JUDGED_REPEATS) || 1)
const LABEL_REPEATS = Math.max(1, Number(process.env.BENCH3_LABEL_REPEATS) || 1)
const LIMIT = Number(process.env.BENCH3_LIMIT) || undefined
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.BENCH3_CONCURRENCY) || 4))
const BLIND_DIR = join(DATA, 'blind')
const INVENTORY_FROM = process.env.BENCH3_INVENTORY_FROM?.trim() || 'sonnet55'

for (const id of READERS) if (!llmById(id)) throw new Error(`BENCH3_READERS: leitor desconhecido "${id}"`)
for (const id of JUDGES) if (!llmById(id)) throw new Error(`BENCH3_JUDGES: juiz desconhecido "${id}"`)
for (const id of GENS) if (!genById(id)) throw new Error(`BENCH3_GENERATORS: motor desconhecido "${id}"`)

async function pool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failure: unknown = null
  const worker = async () => {
    while (next < items.length && !failure) {
      const item = items[next++]
      try { await fn(item) } catch (err) { failure = err }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
  if (failure) throw failure
}

function approvedCap(phaseEstimateUsd: number): SpendCap {
  const cap = Number(process.env.BENCH3_APPROVE_USD)
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new Error(`fase paga sem BENCH3_APPROVE_USD. Estimativa desta fase: US$ ${phaseEstimateUsd.toFixed(2)}`)
  }
  if (phaseEstimateUsd > cap) {
    throw new Error(`estimativa US$ ${phaseEstimateUsd.toFixed(2)} acima do teto aprovado US$ ${cap.toFixed(2)} — nada foi chamado`)
  }
  console.log(`[bench3] teto aprovado: US$ ${cap.toFixed(2)} · estimativa da fase: US$ ${phaseEstimateUsd.toFixed(2)}`)
  return new SpendCap(cap)
}

const mimeOf = (file: string) => (/\.png$/i.test(file) ? 'image/png' : 'image/jpeg')

async function srcSize(buf: Buffer) {
  const sharp = (await import('sharp')).default
  const m = await sharp(buf).metadata()
  return m.width && m.height ? { width: m.width, height: m.height } : null
}

// ── Fases ───────────────────────────────────────────────────────────────────

function printPlan(cases: number) {
  const p = planCost({ cases, readers: READERS, generators: GENS, judges: JUDGES, repeat: REPEAT, judgedRepeats: JUDGED_REPEATS })
  console.log(`\n[bench3] plano para ${cases} casos, ${REPEAT} repetições por motor, juiz em ${JUDGED_REPEATS} repetição(ões):`)
  for (const l of p.lines) {
    console.log(`  ${l.phase}  ${l.id.padEnd(16)} ${String(l.calls).padStart(5)} chamadas × US$ ${l.unitUsd.toFixed(4)} = US$ ${l.usd.toFixed(2)}${l.verified ? '' : '  (preço não oficial)'}`)
  }
  console.log(`  Fase A (leitura)  US$ ${p.byPhase.A.toFixed(2)}`)
  console.log(`  Fase B (geração)  US$ ${p.byPhase.B.toFixed(2)}`)
  console.log(`  Fase C (juiz)     US$ ${p.byPhase.C.toFixed(2)}`)
  console.log(`  TOTAL A+B+C       US$ ${p.totalUsd.toFixed(2)}  (fase D à parte, ~US$ 10)\n`)
  return p
}

async function phaseCheck(cases: BenchCase[]) {
  const need = new Set<string>()
  for (const id of [...READERS, ...JUDGES]) {
    const p = llmById(id)!.provider
    need.add(p === 'anthropic' ? 'ANTHROPIC_API_KEY' : p === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY')
  }
  need.add('FAL_KEY')
  for (const k of need) console.log(`  ${process.env[k] ? 'ok ' : 'FALTA'}  ${k}`)
  const ids = [...new Set([...READERS, ...JUDGES])].map(id => llmById(id)!)
  for (const r of await checkModels(ids)) console.log(`  ${r.ok ? 'ok ' : 'ERRO'}  ${r.id.padEnd(14)} ${r.model.padEnd(26)} ${r.note}`)
  const byCat: Record<string, number> = {}
  for (const c of cases) byCat[c.category] = (byCat[c.category] ?? 0) + 1
  console.log(`  inputs: ${cases.length} em ${relative(process.cwd(), DIRS.inputs)} →`, byCat)
  printPlan(cases.length)
}

async function phaseRead(cases: BenchCase[]) {
  const todo = cases.flatMap(c => READERS.map(r => ({ c, r }))).filter(({ c, r }) => !readJson(readPath(c.name, r)))
  const est = todo.reduce((a, { r }) => a + llmCallUsd(llmById(r)!, TOKENS.read.input, TOKENS.read.output), 0)
  const cap = approvedCap(est)
  await pool(todo, async ({ c, r }) => {
    const spec = llmById(r)!
    const reserve = llmCallUsd(spec, TOKENS.read.input, TOKENS.read.output) * 1.5
    cap.reserve(reserve, `leitura ${r}`)
    const img = await prepImage(readFileSync(c.file))
    const res = await visionJson<ReadContract>({ spec, system: READ_SYSTEM, user: READ_USER, images: [img], schema: READ_SCHEMA, schemaName: 'read_contract' })
    cap.settle(reserve, res.usd)
    const file: ReadFile = { reader: r, case: c.name, ok: res.ok, error: res.error, usd: res.usd, ms: res.ms, contract: res.data }
    writeJson(readPath(c.name, r), { ...file, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens })
    appendLedger({ at: new Date().toISOString(), phase: 'A', kind: 'read', id: r, case: c.name, usd: res.usd, estimated: false, ms: res.ms, ok: res.ok, error: res.error, inputTokens: res.inputTokens, outputTokens: res.outputTokens })
    console.log(`[A] ${c.name} · ${r}: ${res.ok ? `${res.data!.inventario.length} itens` : `ERRO ${res.error}`} · US$ ${res.usd.toFixed(4)} · ${(res.ms / 1000).toFixed(0)}s`)
  })
  console.log(`[A] gasto da execução: US$ ${cap.total.toFixed(2)}`)
}

async function phaseGenerate(cases: BenchCase[]) {
  const todo = cases.flatMap(c => GENS.flatMap(g => Array.from({ length: REPEAT }, (_, i) => ({ c, g, rep: i + 1 }))))
    .filter(({ c, g, rep }) => !readJson(outMeta(outKey(c.name, g, rep))))
  const est = todo.reduce((a, { g }) => a + genById(g)!.estUsd, 0)
  const cap = approvedCap(est)
  await pool(todo, async ({ c, g, rep }) => {
    const spec = genById(g)!
    cap.reserve(spec.estUsd, `geração ${g}`)
    const input = readFileSync(c.file)
    const url = await uploadInput(c.name, input, mimeOf(c.file))
    const res = await generate(spec, url, benchPrompt(spec, c.projectType), await srcSize(input))
    const key = outKey(c.name, g, rep)
    let geometry: number | null = null
    if (res.ok && res.png) {
      writeFileSync(outPng(key), res.png)
      geometry = (await computeGeometryScore(input, res.png)).score
    }
    const meta: OutputMeta = { key, case: c.name, gen: g, rep, ok: res.ok, error: res.error, geometry, ms: res.ms, usd: spec.estUsd, width: res.width, height: res.height }
    writeJson(outMeta(key), { ...meta, requestId: res.requestId, endpoint: spec.falEndpoint })
    appendLedger({ at: new Date().toISOString(), phase: 'B', kind: 'generate', id: g, case: c.name, usd: spec.estUsd, estimated: true, ms: res.ms, ok: res.ok, error: res.error })
    console.log(`[B] ${key}: ${res.ok ? `geometria ${geometry!.toFixed(3)} · ${res.width}×${res.height}` : `ERRO ${res.error}`} · ${(res.ms / 1000).toFixed(0)}s`)
  })
  console.log(`[B] gasto estimado da execução: US$ ${cap.total.toFixed(2)}`)
}

async function phaseJudge(cases: BenchCase[]) {
  const todo: Array<{ c: BenchCase; meta: OutputMeta; j: string; contract: ReadContract }> = []
  let missingInventory = 0
  for (const c of cases) {
    const read = readJson<ReadFile>(readPath(c.name, INVENTORY_FROM))
    if (!read?.contract) { missingInventory++; continue }
    for (const g of GENS) for (let rep = 1; rep <= Math.min(REPEAT, JUDGED_REPEATS); rep++) {
      const meta = readJson<OutputMeta>(outMeta(outKey(c.name, g, rep)))
      if (!meta?.ok) continue
      for (const j of JUDGES) {
        if (SAME_FAMILY[genById(g)!.family] === llmById(j)!.family) continue
        if (readJson(judgePath(meta.key, j))) continue
        todo.push({ c, meta, j, contract: read.contract })
      }
    }
  }
  if (missingInventory) console.warn(`[C] ${missingInventory} caso(s) sem leitura de ${INVENTORY_FROM} — rode a fase A antes; esses ficam de fora`)
  const est = todo.reduce((a, { j }) => a + llmCallUsd(llmById(j)!, TOKENS.judge.input, TOKENS.judge.output), 0)
  const cap = approvedCap(est)
  await pool(todo, async ({ c, meta, j, contract }) => {
    const spec = llmById(j)!
    const reserve = llmCallUsd(spec, TOKENS.judge.input, TOKENS.judge.output) * 1.5
    cap.reserve(reserve, `juiz ${j}`)
    const images = [await prepImage(readFileSync(c.file)), await prepImage(readFileSync(outPng(meta.key)))]
    const res = await visionJson<JudgeVerdict>({ spec, system: JUDGE_SYSTEM, user: judgeUser(contract), images, schema: JUDGE_SCHEMA, schemaName: 'judge_verdict' })
    cap.settle(reserve, res.usd)
    const file: JudgeFile = { judge: j, key: meta.key, ok: res.ok, error: res.error, usd: res.usd, ms: res.ms, verdict: res.data, inventoryFrom: INVENTORY_FROM }
    writeJson(judgePath(meta.key, j), { ...file, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens })
    appendLedger({ at: new Date().toISOString(), phase: 'C', kind: 'judge', id: j, case: c.name, usd: res.usd, estimated: false, ms: res.ms, ok: res.ok, error: res.error, inputTokens: res.inputTokens, outputTokens: res.outputTokens })
    console.log(`[C] ${meta.key} · ${j}: ${res.ok ? res.data!.veredito : `ERRO ${res.error}`} · US$ ${res.usd.toFixed(4)}`)
  })
  console.log(`[C] gasto da execução: US$ ${cap.total.toFixed(2)}`)
}

function phaseLabels(cases: BenchCase[]) {
  mkdirSync(BLIND_DIR, { recursive: true })
  const rel = (p: string) => relative(DATA, p).replace(/\\/g, '/')
  const page: LabelCase[] = cases.map(c => ({
    name: c.name,
    input: rel(c.file),
    renders: GENS.flatMap(g => Array.from({ length: Math.min(REPEAT, LABEL_REPEATS) }, (_, i) => outKey(c.name, g, i + 1)))
      .filter(k => readJson<OutputMeta>(outMeta(k))?.ok)
      .map(k => {
        // Cópia com nome cego: o arquivo original carrega o id do motor.
        const blind = join(BLIND_DIR, `${blindId(k)}.png`)
        if (!existsSync(blind)) copyFileSync(outPng(k), blind)
        return { key: k, caseName: c.name, png: rel(blind) }
      }),
    reads: READERS.flatMap(r => {
      const f = readJson<ReadFile>(readPath(c.name, r))
      return f?.contract ? [{ key: `${c.name}--${r}`, caseName: c.name, items: f.contract.inventario }] : []
    }),
  }))
  const out = join(DATA, 'labels.html')
  writeFileSync(out, buildLabelsHtml(page))
  const n = page.reduce((a, c) => a + c.renders.length, 0)
  console.log(`[labels] ${n} renders e ${page.reduce((a, c) => a + c.reads.length, 0)} leituras em ${out}`)
  console.log('[labels] abra no navegador, rotule e use "Exportar labels.json"; salve o arquivo em tests/bench3/data/labels.json')
}

function phaseReport(cases: BenchCase[]) {
  const r = buildReport({ cases, repeat: REPEAT, generators: GENS, readers: READERS, judges: JUDGES })
  writeJson(join(DATA, 'report.json'), r)
  writeFileSync(join(DATA, 'report.md'), reportMarkdown(r))
  console.log(reportMarkdown(r))
}

async function phaseE2E() {
  const dir = process.env.BENCH3_E2E_INPUTS?.trim() || join(DATA, 'inputs-e2e')
  const { readdirSync } = await import('node:fs')
  if (!existsSync(dir)) throw new Error(`sem pasta de inputs da fase D: ${dir} (use prints que NÃO estão em inputs/)`)
  const files = readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, LIMIT ?? 20)
  const reader = llmById(process.env.BENCH3_E2E_READER?.trim() || 'sonnet55')!
  const judge = llmById(process.env.BENCH3_E2E_JUDGE?.trim() || 'sonnet55')!
  const primary = genById(process.env.BENCH3_E2E_GEN?.trim() || 'nb21')!
  const fallback = genById(process.env.BENCH3_E2E_FALLBACK?.trim() || 'seedream55')!
  if (!reader || !judge || !primary || !fallback) throw new Error('BENCH3_E2E_*: id desconhecido')
  const maxAttempts = Math.max(1, Math.min(3, Number(process.env.BENCH3_E2E_MAX_ATTEMPTS) || 2))
  const minGeometry = Number(process.env.BENCH3_E2E_MIN_GEOMETRY) || 0.5
  const perCase = 0.08 + maxAttempts * (Math.max(primary.estUsd, fallback.estUsd) + 0.06)
  const cap = approvedCap(perCase * files.length)
  const tag = `${primary.id}+${fallback.id}--${reader.id}--${judge.id}`
  const outDir = join(DIRS.e2e, tag)
  mkdirSync(outDir, { recursive: true })
  const { categorize } = await import('./store')
  const rows: unknown[] = []
  for (const f of files) {
    const name = basename(f).replace(/\.[^.]+$/, '')
    if (readJson(join(outDir, `${name}.json`))) continue
    const input = readFileSync(join(dir, f))
    const res = await runHarness(name, input, mimeOf(f), categorize(f).projectType, {
      reader, primary, fallback, judge, minGeometry, maxAttempts, reserve: (u, w) => cap.reserve(u, w),
    })
    res.pngs.forEach((p, i) => { if (p) writeFileSync(join(outDir, `${name}--try${i + 1}.png`), p) })
    const row = { case: name, delivered: res.delivered, attempts: res.attempts, readUsd: res.readUsd, totalUsd: res.totalUsd, read: res.read }
    writeJson(join(outDir, `${name}.json`), row)
    rows.push(row)
    appendLedger({ at: new Date().toISOString(), phase: 'D', kind: 'generate', id: tag, case: name, usd: res.totalUsd, estimated: true, ms: res.attempts.reduce((a, t) => a + t.ms, 0), ok: res.delivered !== null })
    console.log(`[D] ${name}: ${res.attempts.length} tentativa(s), ${res.attempts.some(a => a.pass) ? 'aprovado' : 'entregue sem aprovação'} · US$ ${res.totalUsd.toFixed(3)}`)
  }
  console.log(`[D] ${rows.length} casos · gasto estimado US$ ${cap.total.toFixed(2)} · saídas em ${outDir}`)
}

describe.runIf(ON)(`bench Renderizar 3.0 — fase ${PHASE}`, () => {
  it(PHASE, async () => {
    ensureDirs()
    const cases = listCases(LIMIT)
    console.log(`[bench3] fase ${PHASE} · ${cases.length} casos · leitores ${READERS.join(',')} · motores ${GENS.join(',')} · juízes ${JUDGES.join(',')} · LLMs no catálogo: ${LLMS.length}`)
    switch (PHASE) {
      case 'plan': printPlan(cases.length || 60); break
      case 'check': await phaseCheck(cases); break
      case 'read': expect(cases.length, 'sem inputs').toBeGreaterThan(0); await phaseRead(cases); break
      case 'generate': expect(cases.length, 'sem inputs').toBeGreaterThan(0); await phaseGenerate(cases); break
      case 'judge': await phaseJudge(cases); break
      case 'labels': phaseLabels(cases); break
      case 'report': phaseReport(cases); break
      case 'e2e': await phaseE2E(); break
      default: throw new Error(`BENCH3_PHASE desconhecida: ${PHASE}`)
    }
  }, 6 * 60 * 60 * 1000)
})
