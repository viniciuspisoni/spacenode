// Lógica pura do bench 3.0 (sem rede). Roda na suíte normal.

import { describe, expect, it } from 'vitest'
import { GENERATORS, LLMS, SAME_FAMILY, nodeUsd, ESSENCE_ANNUAL_NODE_BRL, size2k } from './config'
import { JUDGE_SCHEMA, READ_SCHEMA, contractToBriefing, judgeUser, strictPass, type JudgeVerdict, type ReadContract } from './contract'
import { cohenKappa, deliveryUsd, llmCallUsd, marginAt, marginStudio, nodesFor75, pickWinner, planCost, wilson } from './economics'
import { pickDelivered, type Attempt } from './harness'
import { blindId, buildLabelsHtml, shuffleSeeded } from './labels-page'
import { SpendCap, categorize } from './store'

describe('régua econômica', () => {
  it('Essence anual vale US$ 0,02587 por node e o teto de 75% é US$ 0,00647', () => {
    expect(nodeUsd(ESSENCE_ANNUAL_NODE_BRL)).toBeCloseTo(0.02587, 5)
    expect(nodeUsd(ESSENCE_ANNUAL_NODE_BRL) * 0.25).toBeCloseTo(0.00647, 5)
  })

  it('reproduz a tabela do estudo: Padrão NB 2.1 + Sonnet = 20 nodes, 76%', () => {
    const cost = deliveryUsd({ readUsd: 0.024, genUsd: 0.052, judgeUsd: 0.018, expectedAttempts: 1.3 })
    expect(cost).toBeCloseTo(0.124, 3)
    expect(nodesFor75(cost)).toBe(20)
    expect(marginAt(20, cost)).toBeCloseTo(0.76, 2)
    expect(marginStudio(20, cost)).toBeCloseTo(0.64, 2)
  })

  it('cache de leitura reduz só a parcela da leitura', () => {
    const base = { readUsd: 0.05, genUsd: 0.05, judgeUsd: 0.01, expectedAttempts: 1 }
    expect(deliveryUsd({ ...base, readCacheHit: 1 })).toBeCloseTo(0.06 * 1.08, 6)
  })

  it('custo de chamada LLM pela tarifa por milhão', () => {
    expect(llmCallUsd({ inPerM: 2, outPerM: 10 }, 1_000_000, 100_000)).toBeCloseTo(3, 6)
  })

  it('plano soma as três fases e recusa id desconhecido', () => {
    const p = planCost({ cases: 10, readers: ['sonnet55'], generators: ['seedream5flash'], judges: ['haiku55'], repeat: 2 })
    expect(p.byPhase.B).toBeCloseTo(10 * 2 * 0.027, 6)
    expect(p.lines.find(l => l.phase === 'C')!.calls).toBe(10) // juiz só na 1ª repetição
    expect(p.totalUsd).toBeCloseTo(p.byPhase.A + p.byPhase.B + p.byPhase.C, 9)
    expect(() => planCost({ cases: 1, readers: ['nope'], generators: [], judges: [], repeat: 1 })).toThrow()
  })
})

describe('estatística', () => {
  it('kappa de Cohen: concordância perfeita, acaso e indefinido', () => {
    expect(cohenKappa([[true, true], [false, false], [true, true], [false, false]])).toBe(1)
    expect(cohenKappa([[true, true], [true, false], [false, true], [false, false]])).toBeCloseTo(0, 9)
    expect(cohenKappa([])).toBeNull()
    expect(cohenKappa([[true, true], [true, true]])).toBe(1)
  })

  it('Wilson cobre a proporção e respeita [0,1]', () => {
    const w = wilson(8, 10)
    expect(w.p).toBe(0.8)
    expect(w.lo).toBeGreaterThan(0.4)
    expect(w.hi).toBeLessThan(1)
    expect(wilson(0, 0)).toEqual({ p: 0, lo: 0, hi: 0 })
  })

  it('vencedor: maior aceite entre os que fecham 75%; empate vai para o mais barato', () => {
    const w = pickWinner([
      { id: 'caro', tier: 'p', acceptRate: 0.82, deliveryUsd: 0.12, nodes: 20 },
      { id: 'barato', tier: 'p', acceptRate: 0.80, deliveryUsd: 0.09, nodes: 20 },
      { id: 'fora', tier: 'p', acceptRate: 0.95, deliveryUsd: 0.30, nodes: 20 }, // margem < 75%
    ])
    expect(w?.id).toBe('barato')
    expect(pickWinner([{ id: 'x', tier: 'p', acceptRate: 1, deliveryUsd: 1, nodes: 1 }])).toBeNull()
  })
})

describe('catálogo', () => {
  it('ids únicos e preços positivos', () => {
    expect(new Set(GENERATORS.map(g => g.id)).size).toBe(GENERATORS.length)
    expect(new Set(LLMS.map(l => l.id)).size).toBe(LLMS.length)
    for (const g of GENERATORS) expect(g.estUsd).toBeGreaterThan(0)
  })
  it('regra de família: Google e OpenAI não se julgam', () => {
    expect(SAME_FAMILY.google).toBe('google')
    expect(SAME_FAMILY.bytedance).toBeNull()
  })
  it('size2k mantém o aspecto e múltiplos de 16', () => {
    const s = size2k({ width: 1920, height: 1080 })!
    expect(s.width % 16).toBe(0)
    expect(Math.abs(s.width / s.height - 16 / 9)).toBeLessThan(0.02)
    expect(s.width * s.height).toBeLessThanOrEqual(4_100_000)
  })
})

describe('contrato', () => {
  const walk = (s: Record<string, unknown>, path = '$'): void => {
    if (s.type === 'object') {
      const props = s.properties as Record<string, Record<string, unknown>>
      expect(s.additionalProperties, path).toBe(false)
      expect([...(s.required as string[])].sort(), path).toEqual(Object.keys(props).sort())
      for (const [k, v] of Object.entries(props)) walk(v, `${path}.${k}`)
    }
    if (s.type === 'array') walk(s.items as Record<string, unknown>, `${path}[]`)
  }
  it('schemas usam só o subconjunto comum (tudo obrigatório, nada extra)', () => {
    walk(READ_SCHEMA)
    walk(JUDGE_SCHEMA)
  })

  const contract: ReadContract = {
    tipo_input: 'sketchup_texturizado', tipo_projeto: 'cozinha', ambiente: 'interior',
    camera: { altura: 'olho_humano', horizonte_y: 0.5, pontos_de_fuga: 2, fov: 'normal', descricao: 'frontal' },
    inventario: [
      { id: 1, tipo: 'bancada', descricao: 'bancada de granito preto', bbox: [0.1, 0.5, 0.9, 0.7], material: 'granito preto', evidencia: 'brilho', critico: true },
      { id: 2, tipo: 'objeto', descricao: 'vaso', bbox: [0.4, 0.3, 0.5, 0.4], material: 'cerâmica', evidencia: 'forma', critico: false },
    ],
    superficies: [{ superficie: 'piso', material: 'porcelanato', cor: 'cinza', evidencia: 'junta' }],
    luz: { fontes: ['janela'], luminarias_acesas: 'nao', periodo: 'dia' },
    ambiguidades: [],
  }
  const verdict = (over: Partial<JudgeVerdict> = {}): JudgeVerdict => ({
    itens: [{ id: 1, presente: true, mesma_posicao: true, mesmo_material: true, defeito: '' },
            { id: 2, presente: false, mesma_posicao: false, mesmo_material: false, defeito: 'sumiu' }],
    extras_indevidos: [], camera_preservada: true, geometria: 5, materiais: 5, luz: 4, fotorrealismo: 4,
    artefatos: [], veredito: 'entregar', correcao: '', ...over,
  })

  it('aprovação estrita: item não crítico pode falhar, crítico não', () => {
    expect(strictPass(verdict(), contract)).toBe(true)
    const bad = verdict()
    bad.itens[0].mesmo_material = false
    expect(strictPass(bad, contract)).toBe(false)
    expect(strictPass(verdict({ camera_preservada: false }), contract)).toBe(false)
    expect(strictPass(verdict({ veredito: 'retry_localizado' }), contract)).toBe(false)
  })

  it('checklist marca críticos e o briefing preserva só críticos', () => {
    expect(judgeUser(contract)).toContain('#1 [CRÍTICO] bancada')
    const b = contractToBriefing(contract)
    expect(b.elementos_preservar).toEqual(['bancada de granito preto'])
    expect(b.materiais_aparentes).toContain('piso: porcelanato')
  })
})

describe('harness', () => {
  const att = (over: Partial<Attempt>): Attempt => ({
    gen: 'x', correction: null, ok: true, error: null, geometry: 0.6, verdict: null, pass: false, genUsd: 0.05, judgeUsd: 0.01, ms: 1, ...over,
  })
  it('entrega a aprovada; sem aprovada, a de maior nota; ignora falhas', () => {
    expect(pickDelivered([att({ geometry: 0.9 }), att({ pass: true, geometry: 0.6 })])).toBe(1)
    expect(pickDelivered([att({ ok: false }), att({ geometry: 0.4 })])).toBe(1)
    expect(pickDelivered([att({ ok: false })])).toBeNull()
  })
})

describe('infra', () => {
  it('categoria e tipo de projeto pelo prefixo do arquivo', () => {
    expect(categorize('fachada-sobrado.png')).toEqual({ category: 'fachada', projectType: 'exterior' })
    expect(categorize('interior-cozinha.jpg')).toEqual({ category: 'interior', projectType: 'interior' })
    expect(categorize('sketchup-ext-casa.png')).toEqual({ category: 'sketchup', projectType: 'exterior' })
    expect(categorize('qualquer.png').category).toBe('outro')
  })

  it('teto de gasto barra a chamada que passaria do limite', () => {
    const cap = new SpendCap(1)
    cap.reserve(0.6, 'a')
    expect(() => cap.reserve(0.5, 'b')).toThrow(/teto/)
    cap.settle(0.6, 0.2)
    expect(() => cap.reserve(0.5, 'c')).not.toThrow()
  })

  it('embaralhamento determinístico e página escapa HTML', () => {
    const xs = [1, 2, 3, 4, 5, 6]
    expect(shuffleSeeded(xs, 'a')).toEqual(shuffleSeeded(xs, 'a'))
    expect([...shuffleSeeded(xs, 'a')].sort()).toEqual(xs)
    const key = 'c--nb21--1'
    const html = buildLabelsHtml([{ name: 'c<1>', input: 'inputs/c.png', renders: [{ key, caseName: 'c', png: `blind/${blindId(key)}.png` }], reads: [] }])
    expect(html).toContain('c&lt;1&gt;')
    expect(html).toContain(`data-key="${blindId(key)}"`)
    expect(html).not.toContain('nb21') // nem o DOM nem o arquivo revelam o motor
    expect(blindId(key)).not.toBe(blindId('c--nb21--2'))
  })
})
