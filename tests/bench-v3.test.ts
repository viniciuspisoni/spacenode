// Bancada 3.0 sem fornecedor: trava de gasto, plano, retomada, juiz e relatório.
// Tudo mockado — nenhum teste aqui chama API.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { BudgetExceededError, BudgetGuard } from '@/lib/bench-v3/budget'
import { DEFAULT_JUDGES, DEFAULT_READERS, imageEngines, long2048, pick, visionModels, type ImageEngine } from '@/lib/bench-v3/catalog'
import { BenchRunner, plan, type BenchConfig, type BenchDeps } from '@/lib/bench-v3/runner'
import { buildChecklist, decide, parseVerdict } from '@/lib/bench-v3/judge'
import { buildReport, parseCsv, readHumanSheet, writeHumanSheet } from '@/lib/bench-v3/report'
import { openAiResponseText } from '@/lib/bench-v3/vision-adapters'

describe('BudgetGuard', () => {
  it('recusa a chamada que passaria do teto, contando reservas abertas', () => {
    const g = new BudgetGuard(1, 0.5)
    const r = g.reserve(0.3)
    expect(() => g.reserve(0.3)).toThrow(BudgetExceededError)
    expect(g.settle(r, 0.1)).toBe(0.1)
    expect(g.spentUsd).toBeCloseTo(0.6)
    expect(() => g.reserve(0.4)).not.toThrow()
  })
  it('custo desconhecido cobra o teto da reserva, nunca zero', () => {
    const g = new BudgetGuard(1)
    const r = g.reserve(0.07)
    expect(g.settle(r, null)).toBe(0.07)
    expect(() => g.settle(r, 0)).toThrow()
  })
})

describe('catálogo', () => {
  it('lado maior 2048 no aspecto da entrada, múltiplo de 16', () => {
    expect(long2048(1600, 708)).toEqual({ width: 2048, height: 912 })
    expect(long2048(708, 1600)).toEqual({ width: 912, height: 2048 })
  })
  it('Seedream cobra pela área entregue', () => {
    const [pro, s55] = imageEngines()
    expect(pro.costForPixels!(2368 * 1776, 1)).toBe(0.09)
    expect(pro.costForPixels!(2048 * 1152, 1)).toBe(0.045)
    expect(s55.costForPixels!(2048 * 1024, 1)).toBeCloseTo(0.028)
  })
  it('lista de IDs desconhecida falha antes de gastar', () => {
    expect(() => pick(visionModels(), 'claude-opus-5.5,gpt-99')).toThrow(/gpt-99/)
  })
  it('plano completo de 25 prints: contagens e teto', () => {
    const prevArk = process.env.ARK_API_KEY
    process.env.ARK_API_KEY = 'x'
    const cfg = { engines: imageEngines(), readers: pick(visionModels(), undefined, DEFAULT_READERS), judges: pick(visionModels(), undefined, DEFAULT_JUDGES), repeats: 3 } as BenchConfig
    const p = plan(cfg, 25)
    if (prevArk === undefined) delete process.env.ARK_API_KEY
    else process.env.ARK_API_KEY = prevArk
    expect(p).toMatchObject({ reads: 175, generations: 450, judgements: 750 })
    expect(p.maxUsd.generate).toBeCloseTo(25 * 3 * (0.09 + 0.043 + 0.027 + 0.055 + 0.07 + 0.07))
    expect(p.maxUsd.total).toBeLessThan(75)
  })
})

describe('juiz em checklist', () => {
  const items = buildChecklist(null, ['contagem de banquetas'])
  it('item sem resposta vira incerto, nunca ok', () => {
    const v = parseVerdict('```json\n{"items":[{"id":"c1","status":"ok","evidencia":"igual"}],"realismo":4,"decisao":"entregar"}\n```', items)
    expect(v.items[0].status).toBe('ok')
    expect(v.items.slice(1).every(i => i.status === 'incerto')).toBe(true)
    expect(decide(v)).toBe('entregar_com_aviso')
  })
  it('qualquer falha refaz; tudo ok entrega', () => {
    const all = (s: string) => JSON.stringify({ items: items.map(i => ({ id: i.id, status: s })), realismo: 5, decisao: 'entregar' })
    expect(decide(parseVerdict(all('ok'), items))).toBe('entregar')
    expect(decide(parseVerdict(`texto antes ${all('falha')} depois`, items))).toBe('refazer')
  })
  it('usa as aberturas e os materiais da ficha', () => {
    const c = buildChecklist({ aberturas: 'duas janelas', material_inventory: [{ surface: 'piso', appearance: 'cinza', pattern: '', certainty: 'visible' }] } as never, [])
    expect(c.map(i => i.text).join(' ')).toMatch(/duas janelas[\s\S]*piso: cinza/)
  })
})

describe('Responses API', () => {
  it('lê output_text ou os blocos de saída', () => {
    expect(openAiResponseText({ output_text: 'a' })).toBe('a')
    expect(openAiResponseText({ output: [{ content: [{ type: 'output_text', text: 'b' }, { type: 'reasoning' }] }] })).toBe('b')
  })
})

// ── Runner com fornecedores falsos ──────────────────────────────────────────

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'bench-v3-'))
  const inputDir = join(dir, 'inputs')
  mkdirSync(inputDir)
  const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#888' } }).png().toBuffer()
  writeFileSync(join(inputDir, 'interior-a.png'), png)
  writeFileSync(join(inputDir, 'exterior-b.png'), png)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ cases: [{ id: 'a', type: 'interior', checks: ['painel ripado'] }] }))
  return { dir, inputDir, png }
}

const engine = (id: string, maxUsd: number): ImageEngine =>
  ({ id, label: id, provider: 'openai', model: id, promptProfile: 'orion', size: 'long2048', maxUsd, timeoutMs: 1000 })

function fakeDeps(png: Buffer, calls: string[], opts: { failEngine?: string } = {}): BenchDeps {
  const verdict = (n: number) => JSON.stringify({ items: Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, status: 'ok' })), realismo: 4, decisao: 'entregar' })
  return {
    generate: async (e) => {
      calls.push(`gen:${e.id}`)
      if (e.id === opts.failEngine) throw new Error('HTTP 500')
      return { buffer: png, width: 64, height: 32, costUsd: 0.01, costSource: 'tokens', provider: 'fake', providerModel: e.model, requestId: null, latencyMs: 5, requestedSize: '64x32' }
    },
    vision: async (m, r) => {
      calls.push(`vision:${m.id}:${r.images.length}`)
      const text = r.images.length === 1
        ? JSON.stringify({ tipo_projeto: 'sala', geometria_principal: 'g', volumes: 'v', pavimentos: 1, aberturas: 'uma porta', materiais_aparentes: 'm', camera: 'c', entorno: 'e', elementos_preservar: [], elementos_melhorar: [] })
        : verdict(r.user.split('\n').filter(l => l.startsWith('- c')).length)
      return { text, inputTokens: 100, outputTokens: 50, costUsd: 0.001, latencyMs: 3, refused: false, providerModel: m.model }
    },
    geometry: async () => ({ score: 0.8, edgeRecall: 0.9, meanColorDelta: 2, worstCellColorDelta: 5 }),
    log: () => {},
  }
}

function cfgFor(dir: string, inputDir: string, capUsd: number): BenchConfig {
  const vm = visionModels()
  return {
    inputDir, manifestPath: join(dir, 'manifest.json'), outDir: join(dir, 'out'),
    engines: [engine('e1', 0.05), engine('e2', 0.05)],
    readers: pick(vm, 'claude-haiku-5.5'), judges: pick(vm, 'claude-haiku-5.5,claude-sonnet-5.5'),
    repeats: 2, capUsd, concurrency: 2, briefingReader: 'claude-haiku-5.5', judgedRun: 1,
  }
}

describe('BenchRunner', () => {
  it('roda as três camadas, grava tudo e não refaz o que já deu certo', async () => {
    const { dir, inputDir, png } = await fixture()
    const calls: string[] = []
    const r1 = new BenchRunner(cfgFor(dir, inputDir, 10), fakeDeps(png, calls))
    expect(await r1.run(['read', 'generate', 'judge'])).toEqual({ stoppedByBudget: false })
    // 2 prints × (1 leitura + 2 motores × 2 repetições + 2 motores × 2 juízes)
    expect(calls.filter(c => c.startsWith('vision') && c.endsWith(':1'))).toHaveLength(2)
    expect(calls.filter(c => c.startsWith('gen'))).toHaveLength(8)
    expect(calls.filter(c => c.endsWith(':2'))).toHaveLength(8)
    const judged = r1.store.records.find(r => r.phase === 'judge' && r.case === 'a')!
    expect(JSON.stringify(judged.items)).toMatch(/uma porta.*painel ripado/)
    expect(judged.ruleDecision).toBe('entregar')

    const again: string[] = []
    const r2 = new BenchRunner(cfgFor(dir, inputDir, 10), fakeDeps(png, again))
    await r2.run(['read', 'generate', 'judge'])
    expect(again).toEqual([])
    expect(r2.guard.spentUsd).toBeCloseTo(r1.guard.spentUsd)
  })

  it('para no teto e mantém o que já foi feito', async () => {
    const { dir, inputDir, png } = await fixture()
    const calls: string[] = []
    const runner = new BenchRunner({ ...cfgFor(dir, inputDir, 0.08), readers: [] }, fakeDeps(png, calls))
    const res = await runner.run(['generate'])
    expect(res.stoppedByBudget).toBe(true)
    expect(runner.guard.spentUsd).toBeLessThanOrEqual(0.08)
    expect(runner.store.records.filter(r => r.ok).length).toBeGreaterThan(0)
    expect(runner.store.records.length).toBeLessThan(8)
  })

  it('falha do fornecedor fica registrada e cobra o teto da reserva', async () => {
    const { dir, inputDir, png } = await fixture()
    const runner = new BenchRunner({ ...cfgFor(dir, inputDir, 10), readers: [], briefingReader: null }, fakeDeps(png, [], { failEngine: 'e2' }))
    await runner.run(['generate'])
    const failed = runner.store.records.filter(r => !r.ok)
    expect(failed).toHaveLength(4)
    expect(failed.every(r => r.costUsd === 0.05 && r.costKnown === false && /HTTP 500/.test(String(r.error)))).toBe(true)
  })

  it('relatório: custo por imagem aprovada e concordância do juiz com o arquiteto', async () => {
    const { dir, inputDir, png } = await fixture()
    const runner = new BenchRunner(cfgFor(dir, inputDir, 10), fakeDeps(png, []))
    await runner.run(['read', 'generate', 'judge'])
    const sheet = writeHumanSheet(runner.store.records, join(dir, 'out'), 1)
    const rows = parseCsv(readFileSync(sheet, 'utf8'))
    expect(rows).toHaveLength(5)
    const col = rows[0].indexOf('aprovado_s_n')
    rows.slice(1).forEach((r, i) => { r[col] = i === 0 ? 'n' : 's' })
    writeFileSync(sheet, rows.map(r => r.join(',')).join('\n'))
    // Não sobrescreve a planilha preenchida.
    writeHumanSheet(runner.store.records, join(dir, 'out'), 1)
    const report = buildReport(runner.store.records, readHumanSheet(sheet))
    const e1 = report.motores.find(m => m.motor === 'e1')!
    expect(e1.aprovacaoHumana).toBe(0.5)
    expect(e1.custoPorAprovadaUsd).toBeCloseTo(0.02)
    const haiku = report.juizes.find(j => j.juiz === 'claude-haiku-5.5')!
    expect(haiku.falsosAprovados).toBe(1)
    expect(haiku.concordanciaHumana).toBe(0.75)
  })
})
