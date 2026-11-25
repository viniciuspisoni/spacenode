// tests/fidelity/bench-v3.test.ts — bancada SpaceNode 3.0 contra as APIs REAIS.
//
// ⚠️ GASTA DINHEIRO. Só roda com BENCH_V3=1, e as fases pagas exigem um teto
// explícito em BENCH_V3_CAP_USD. Chaves vêm do .env.local (nunca na linha de
// comando): GEMINI_API_KEY, OPENAI_API_KEY, ARK_API_KEY, FAL_KEY,
// ANTHROPIC_API_KEY, XAI_API_KEY.
//
// Ordem sugerida (cada fase retoma de onde parou e não refaz o que deu certo):
//   1. node scripts/bench-v3-prepare.mjs                  copia os prints
//   2. BENCH_V3=1 BENCH_V3_PHASES=preflight,plan …        chaves, modelos e teto (grátis)
//   3. BENCH_V3=1 BENCH_V3_PHASES=read,generate,judge BENCH_V3_CAP_USD=75 …
//   4. BENCH_V3=1 BENCH_V3_PHASES=report …                relatório + planilha do arquiteto
// (… = npx vitest run tests/fidelity/bench-v3.test.ts --silent=false)
//
// Opcionais: BENCH_V3_ENGINES, BENCH_V3_READERS, BENCH_V3_JUDGES (IDs do
// catálogo, separados por vírgula), BENCH_V3_REPEAT (3), BENCH_V3_CONCURRENCY
// (4), BENCH_V3_BRIEFING_READER (gemini-2.5-flash, o leitor de produção),
// BENCH_V3_LIMIT_CASES (rodada de fumaça com poucos prints).
// Saída em tests/fidelity/bench/v3-out/ (fora do git).

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_JUDGES, DEFAULT_READERS, imageEngines, pick, visionModels } from '@/lib/bench-v3/catalog'
import { BenchRunner, plan, type BenchConfig } from '@/lib/bench-v3/runner'
import { preflight } from '@/lib/bench-v3/preflight'
import { buildReport, readHumanSheet, writeHumanSheet } from '@/lib/bench-v3/report'
import { loadEnvLocal } from '../helpers/env-local'

loadEnvLocal()

const ON = process.env.BENCH_V3 === '1'
const PHASES = (process.env.BENCH_V3_PHASES ?? 'plan').split(',').map(s => s.trim()).filter(Boolean)
const PAID = PHASES.filter((p): p is 'read' | 'generate' | 'judge' => ['read', 'generate', 'judge'].includes(p))
const BENCH_DIR = join(process.cwd(), 'tests', 'fidelity', 'bench')

function config(): BenchConfig {
  const vision = visionModels()
  const reader = process.env.BENCH_V3_BRIEFING_READER?.trim() || 'gemini-2.5-flash'
  return {
    inputDir: join(BENCH_DIR, 'inputs'),
    manifestPath: join(BENCH_DIR, 'v3-manifest.json'),
    outDir: join(BENCH_DIR, 'v3-out'),
    engines: pick(imageEngines(), process.env.BENCH_V3_ENGINES),
    readers: pick(vision, process.env.BENCH_V3_READERS, DEFAULT_READERS),
    judges: pick(vision, process.env.BENCH_V3_JUDGES, DEFAULT_JUDGES),
    repeats: Math.max(1, Math.min(5, Number(process.env.BENCH_V3_REPEAT) || 3)),
    capUsd: Number(process.env.BENCH_V3_CAP_USD) || 0.01,
    concurrency: Math.max(1, Math.min(8, Number(process.env.BENCH_V3_CONCURRENCY) || 4)),
    briefingReader: reader === 'none' ? null : reader,
    judgedRun: 1,
  }
}

describe.runIf(ON)('bancada SpaceNode 3.0 (API real — BENCH_V3=1)', () => {
  it('executa as fases pedidas', async () => {
    const cfg = config()
    const runner = new BenchRunner(cfg)
    const limit = Number(process.env.BENCH_V3_LIMIT_CASES) || 0
    if (limit > 0) runner.cases.splice(limit)
    expect(runner.cases.length, 'rode node scripts/bench-v3-prepare.mjs antes').toBeGreaterThan(0)

    if (PHASES.includes('preflight')) {
      console.table(await preflight(cfg.engines, [...new Set([...cfg.readers, ...cfg.judges])]))
    }
    if (PHASES.includes('plan') || PAID.length) {
      const p = plan(cfg, runner.cases.length)
      console.log(`[bench-v3] ${p.cases} prints · ${p.reads} leituras · ${p.generations} imagens · ${p.judgements} conferências`)
      console.log(`[bench-v3] teto estimado US$ ${p.maxUsd.total.toFixed(2)} (leitura ${p.maxUsd.read.toFixed(2)}, geração ${p.maxUsd.generate.toFixed(2)}, conferência ${p.maxUsd.judge.toFixed(2)})`)
      console.log(`[bench-v3] já gasto nesta pasta: US$ ${runner.guard.spentUsd.toFixed(2)}`)
    }
    if (PAID.length) {
      expect(Number(process.env.BENCH_V3_CAP_USD), 'defina BENCH_V3_CAP_USD para fases pagas').toBeGreaterThan(0)
      const { stoppedByBudget } = await runner.run(PAID)
      console.log(`[bench-v3] gasto acumulado US$ ${runner.guard.spentUsd.toFixed(2)} de US$ ${cfg.capUsd.toFixed(2)}${stoppedByBudget ? ' — PARADO NO TETO' : ''}`)
    }
    if (PHASES.includes('report')) {
      const sheet = writeHumanSheet(runner.store.records, cfg.outDir, cfg.judgedRun)
      const report = buildReport(runner.store.records, readHumanSheet(sheet))
      writeFileSync(join(cfg.outDir, 'report.json'), JSON.stringify(report, null, 2))
      console.log(`[bench-v3] gasto total US$ ${report.gastoTotalUsd}`)
      console.table(report.motores)
      console.table(report.leitores)
      console.table(report.juizes)
      console.log(`[bench-v3] planilha do arquiteto: ${sheet}`)
    }
  }, 12 * 60 * 60 * 1000)
})
