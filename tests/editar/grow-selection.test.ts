// Crescer a seleção até o material inteiro.
//
// O caso real (10/09): uma emenda no estofado marcada com o pincel. A IA
// conserta só o retalho marcado e o remendo não combina com o resto da peça —
// porque o resto da peça ela nunca viu. A cena de teste reproduz isso: um
// "estofado" com um defeito de cor no meio, cercado por um material diferente
// que a seleção NÃO pode invadir.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WAND_OPTIONS,
  buildColorIndex,
  growSelectionAuto,
  growSelectionToMaterial,
  selectionCoverage,
} from '@/lib/selection/magic-wand'

const W = 60
const H = 60

type RGB = [number, number, number]
/** O couro do estofado. */
const COURO: RGB = [150, 100, 70]
/** O MESMO couro na sombra — 72% da luz, como no teste da varinha. */
const COURO_SOMBRA: RGB = [108, 72, 50]
/** O defeito: a "costura" que a IA inventou. Croma bem diferente. */
const COSTURA: RGB = [70, 70, 120]
/** O carpete em volta — outro material, e a seleção tem que parar nele. */
const CARPETE: RGB = [90, 92, 95]

/** Cena: um bloco de couro de (10,10) a (39,49), com faixa de sombra embaixo e
 *  uma costura vertical no meio. Todo o resto é carpete. */
function buildScene(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let cor: RGB = CARPETE
      const noCouro = x >= 10 && x <= 39 && y >= 10 && y <= 49
      if (noCouro) cor = y >= 40 ? COURO_SOMBRA : COURO
      if (noCouro && x >= 24 && x <= 25 && y >= 14 && y <= 30) cor = COSTURA
      const o = (y * W + x) * 4
      px[o] = cor[0]
      px[o + 1] = cor[1]
      px[o + 2] = cor[2]
      px[o + 3] = 255
    }
  }
  return px
}

const index = buildColorIndex(buildScene(), W, H)
const at = (mask: Uint8Array, x: number, y: number) => mask[y * W + x]

/** A pincelada do usuário: um retângulo pequeno em cima da costura. */
function brushOverSeam(): Uint8Array {
  const m = new Uint8Array(W * H)
  for (let y = 18; y <= 26; y++) for (let x = 22; x <= 27; x++) m[y * W + x] = 255
  return m
}

describe('growSelectionToMaterial', () => {
  it('cresce da pincelada para a peça inteira', () => {
    const out = growSelectionToMaterial(index, brushOverSeam(), DEFAULT_WAND_OPTIONS)
    expect(at(out, 12, 12)).toBe(255) // canto superior esquerdo do couro
    expect(at(out, 38, 12)).toBe(255) // canto superior direito
    expect(at(out, 12, 48)).toBe(255) // couro NA SOMBRA
    expect(at(out, 38, 48)).toBe(255)
  })

  it('para no material vizinho', () => {
    const out = growSelectionToMaterial(index, brushOverSeam(), DEFAULT_WAND_OPTIONS)
    expect(at(out, 5, 30)).toBe(0)  // carpete à esquerda
    expect(at(out, 50, 30)).toBe(0) // carpete à direita
    expect(at(out, 25, 5)).toBe(0)  // carpete acima
    expect(at(out, 25, 55)).toBe(0) // carpete abaixo
  })

  it('nunca perde o que já estava marcado', () => {
    const brush = brushOverSeam()
    const out = growSelectionToMaterial(index, brush, DEFAULT_WAND_OPTIONS)
    for (let i = 0; i < brush.length; i++) {
      if (brush[i] > 127) expect(out[i]).toBe(255)
    }
    // O defeito não bate com a cor do couro são, mas continua selecionado —
    // é justamente ele que precisa ser reescrito.
    expect(at(out, 24, 20)).toBe(255)
  })

  it('cresce muito além da marcação original', () => {
    const brush = brushOverSeam()
    const out = growSelectionToMaterial(index, brush, DEFAULT_WAND_OPTIONS)
    expect(selectionCoverage(out)).toBeGreaterThan(selectionCoverage(brush) * 10)
  })

  it('devolve vazio quando não há nada marcado', () => {
    const out = growSelectionToMaterial(index, new Uint8Array(W * H), DEFAULT_WAND_OPTIONS)
    expect(selectionCoverage(out)).toBe(0)
  })

  it('sem contiguidade pega o material solto pela cena', () => {
    // Duas manchas de couro separadas: fora do modo contíguo as duas entram.
    const px = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < W * H; i++) {
      const x = i % W
      const perto = x < 10 || x > 49
      const cor = perto ? COURO : CARPETE
      px[i * 4] = cor[0]; px[i * 4 + 1] = cor[1]; px[i * 4 + 2] = cor[2]; px[i * 4 + 3] = 255
    }
    const idx = buildColorIndex(px, W, H)
    const brush = new Uint8Array(W * H)
    for (let y = 20; y < 24; y++) for (let x = 2; x < 6; x++) brush[y * W + x] = 255
    const out = growSelectionToMaterial(idx, brush, { ...DEFAULT_WAND_OPTIONS, contiguous: false })
    expect(at(out, 55, 40)).toBe(255) // a mancha do outro lado
  })
})

describe('growSelectionAuto', () => {
  it('recua a tolerância quando ela faz a seleção escapar', () => {
    // Teto absurdo: qualquer coisa bate, e o preenchimento tomaria a cena.
    const { mask, tolerance } = growSelectionAuto(index, brushOverSeam(), {
      ...DEFAULT_WAND_OPTIONS,
      tolerance: 90,
    })
    expect(tolerance).toBeLessThan(90)
    expect(selectionCoverage(mask)).toBeLessThan(0.85)
  })

  it('não mexe numa tolerância que já se comporta', () => {
    const { tolerance } = growSelectionAuto(index, brushOverSeam(), DEFAULT_WAND_OPTIONS)
    expect(tolerance).toBe(DEFAULT_WAND_OPTIONS.tolerance)
  })
})
