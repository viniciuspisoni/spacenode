// tests/fidelity/geometry-score.test.ts
//
// Valida o geometry score do modo render_only contra o checklist do
// Renderizar: posição/tamanho de janelas, parede direita, portas, bancada,
// marcenaria, mesa, sofá, câmera e pontos de fuga.
//
// Calibração de referência (fixtures sintéticas, 2026-07-31):
//   identica 1.000 · fiel_texturizada 0.948 · violações locais 0.81–0.87 ·
//   parede_direita 0.752 · camera 0.693 · pontos_de_fuga 0.564
// As asserções usam margens sobre esses valores pra não ficarem frágeis.
//
// NOTA: a tarefa citava "imagens de referência fornecidas", mas nenhuma foi
// anexada — o bloco "imagens reais" abaixo roda automaticamente sobre pares
// dropados em tests/fidelity/real/ (<caso>-original.png|jpg +
// <caso>-generated.png|jpg) quando existirem.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import sharp from 'sharp'
import {
  computeGeometryScore,
  buildEdgeMapPng,
  type GeometryScoreBreakdown,
} from '@/lib/ai/fidelity/geometry-score'
import { renderScenePng, FAITHFUL_VARIANT, VIOLATIONS } from './fixtures'

let original: Buffer
let faithful: GeometryScoreBreakdown
const violation: Record<string, GeometryScoreBreakdown> = {}

beforeAll(async () => {
  original = await renderScenePng()
  faithful = await computeGeometryScore(original, await renderScenePng(FAITHFUL_VARIANT))
  for (const [name, overrides] of Object.entries(VIOLATIONS)) {
    violation[name] = await computeGeometryScore(original, await renderScenePng(overrides))
  }
}, 120_000)

describe('geometry-score: re-render fiel passa', () => {
  it('imagem idêntica pontua ~1', async () => {
    const g = await computeGeometryScore(original, original)
    expect(g.score).toBeGreaterThanOrEqual(0.98)
    expect(g.edgeRecall).toBeGreaterThanOrEqual(0.99)
    // Score v2: ΔE de cor ~0 em imagens idênticas.
    expect(g.meanColorDelta).toBeLessThan(0.5)
    expect(g.worstCellColorDelta).toBeLessThan(0.5)
  })

  it('recolor global dispara o ΔE sem derrubar o score estrutural', async () => {
    // Mesma estrutura, cores viradas pra quente (simula parede/materiais
    // repintados): o Sobel é cego a isso — o ΔE é a régua que acusa.
    // (tint em vez de hue-rotate: a fixture é acinzentada e girar matiz de
    // cinza não muda nada.)
    const sharpMod = (await import('sharp')).default
    const recolored = await sharpMod(original).tint({ r: 210, g: 150, b: 95 }).png().toBuffer()
    const g = await computeGeometryScore(original, recolored)
    expect(g.edgeRecall).toBeGreaterThanOrEqual(0.8)
    expect(g.worstCellColorDelta).toBeGreaterThan(5)
  })

  it('re-render fiel (textura + relight + brilho, estrutura intacta) pontua alto', () => {
    expect(faithful.score).toBeGreaterThanOrEqual(0.9)
    expect(faithful.edgeRecall).toBeGreaterThanOrEqual(0.85)
  })

  it('re-render fiel fica acima do limite default do gate (0.5)', () => {
    expect(faithful.score).toBeGreaterThan(0.5)
  })
})

describe('geometry-score: violações estruturais pontuam abaixo do fiel', () => {
  it.each(Object.keys(VIOLATIONS))('%s', name => {
    expect(violation[name].score).toBeLessThan(faithful.score - 0.05)
  })
})

describe('geometry-score: assinaturas por tipo de violação', () => {
  it('janela movida/redimensionada: divergência LOCAL (worstBlockDelta alto, recall ainda alto)', () => {
    expect(violation.janela_movida.worstBlockDelta).toBeGreaterThanOrEqual(0.25)
    expect(violation.janela_movida.edgeRecall).toBeGreaterThan(0.75)
    expect(violation.janela_redimensionada.worstBlockDelta).toBeGreaterThanOrEqual(0.5)
  })

  it('porta removida, bancada movida, marcenaria redesenhada, mesa movida e sofá redimensionado são detectados', () => {
    for (const name of ['porta_removida', 'bancada_movida', 'marcenaria_redesenhada', 'mesa_movida', 'sofa_redimensionado']) {
      expect(violation[name].score, name).toBeLessThanOrEqual(0.9)
      expect(violation[name].worstBlockDelta, name).toBeGreaterThanOrEqual(0.25)
    }
  })

  it('parede direita redesenhada derruba o recall estrutural', () => {
    expect(violation.parede_direita_redesenhada.score).toBeLessThanOrEqual(0.8)
    expect(violation.parede_direita_redesenhada.edgeRecall).toBeLessThan(0.8)
  })

  it('câmera deslocada: drift GLOBAL (recall despenca)', () => {
    expect(violation.camera_deslocada.score).toBeLessThanOrEqual(0.75)
    expect(violation.camera_deslocada.edgeRecall).toBeLessThan(0.7)
  })

  it('pontos de fuga alterados: pior classe — perspectiva não bate', () => {
    expect(violation.pontos_de_fuga_alterados.score).toBeLessThanOrEqual(0.65)
    for (const name of ['janela_movida', 'porta_removida', 'bancada_movida', 'mesa_movida']) {
      expect(violation.pontos_de_fuga_alterados.score).toBeLessThan(violation[name].score)
    }
  })
})

describe('geometry-score: aspecto e edge map', () => {
  it('mudança de razão de aspecto (recorte/reenquadramento) é penalizada', async () => {
    const cropped = await sharp(original).extract({ left: 0, top: 40, width: 512, height: 300 }).png().toBuffer()
    const g = await computeGeometryScore(original, cropped)
    expect(g.aspectDelta).toBeGreaterThan(0.02)
    expect(g.score).toBeLessThan(faithful.score - 0.15)
  })

  it('buildEdgeMapPng devolve PNG proporcional ao original', async () => {
    const edge = await buildEdgeMapPng(original)
    const meta = await sharp(edge).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(1024)
    expect(meta.height).toBe(768)
  })
})

// ── Imagens reais (opcional): tests/fidelity/real/<caso>-original.* + <caso>-generated.* ──

const REAL_DIR = join(__dirname, 'real')
const realCases: { name: string; original: string; generated: string }[] = []
if (existsSync(REAL_DIR)) {
  const files = readdirSync(REAL_DIR)
  for (const f of files) {
    const m = f.match(/^(.+)-original\.(png|jpe?g|webp)$/i)
    if (!m) continue
    const gen = files.find(g => new RegExp(`^${m[1]}-generated\\.(png|jpe?g|webp)$`, 'i').test(g))
    if (gen) realCases.push({ name: m[1], original: join(REAL_DIR, f), generated: join(REAL_DIR, gen) })
  }
}

describe.skipIf(realCases.length === 0)('geometry-score: pares reais (tests/fidelity/real)', () => {
  it.each(realCases.map(c => c.name))('%s', async name => {
    const c = realCases.find(x => x.name === name)!
    const g = await computeGeometryScore(readFileSync(c.original), readFileSync(c.generated))
    // Sem asserção de limite — pares reais servem pra calibrar o
    // RENDER_FIDELITY_MIN_SCORE; o breakdown sai no reporter.
    expect(g.score).toBeGreaterThanOrEqual(0)
    console.log(`[real:${name}] score=${g.score.toFixed(3)} recall=${g.edgeRecall.toFixed(3)} corr=${g.blockCorrelation.toFixed(3)} worst=${g.worstBlockDelta.toFixed(3)} aspect=${g.aspectDelta.toFixed(3)}`)
  }, 60_000)
})
