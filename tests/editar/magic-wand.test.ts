// A varinha mágica.
//
// O caso que define se a ferramenta presta em render arquitetônico é o da
// SOMBRA: o mesmo piso, sob a mesa e sob a janela, tem RGB muito diferente. Uma
// varinha que compara cor crua para na linha da sombra e o usuário seleciona
// metade do piso. A daqui pesa luminância menos que croma, então atravessa a
// sombra e para no material vizinho — que é o comportamento testado abaixo.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WAND_OPTIONS,
  applySelectionOp,
  buildColorIndex,
  invertSelection,
  magicWandSelect,
  selectionCoverage,
} from '@/lib/selection/magic-wand'

const W = 60
const H = 60

type RGB = [number, number, number]
const MADEIRA: RGB = [150, 120, 90]
/** A MESMA madeira sob sombra. 72% da luz — a queda de uma sombra projetada
 *  comum em render arquitetônico. Não é escolha estética: a tolerância padrão é
 *  calibrada contra imagens reais (ver DEFAULT_WAND_OPTIONS), e uma sombra
 *  sintética mais dura do que as que existem nessas imagens transformaria este
 *  teste numa régua que a realidade não usa. */
const MADEIRA_SOMBRA: RGB = [108, 86, 65]
/** Material claramente outro — croma distante, não só luminância. */
const AZUL: RGB = [60, 90, 180]

/** Cena: metade esquerda de madeira (com uma faixa de sombra embaixo), metade
 *  direita de outro material. */
function buildScene(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cor: RGB = x < 30 ? (y >= 40 ? MADEIRA_SOMBRA : MADEIRA) : AZUL
      const o = (y * W + x) * 4
      px[o] = cor[0]
      px[o + 1] = cor[1]
      px[o + 2] = cor[2]
      px[o + 3] = 255
    }
  }
  return px
}

const at = (mask: Uint8Array, x: number, y: number) => mask[y * W + x]

describe('seleção contígua', () => {
  const index = buildColorIndex(buildScene(), W, H)

  it('atravessa a sombra do mesmo material', () => {
    const mask = magicWandSelect(index, 10, 10, DEFAULT_WAND_OPTIONS)
    expect(at(mask, 10, 10)).toBe(255) // madeira iluminada (o clique)
    expect(at(mask, 10, 50)).toBe(255) // MESMA madeira, na sombra
  })

  it('para no material vizinho', () => {
    const mask = magicWandSelect(index, 10, 10, DEFAULT_WAND_OPTIONS)
    expect(at(mask, 45, 10)).toBe(0)
    expect(at(mask, 45, 50)).toBe(0)
  })

  it('seleciona a metade da imagem que é madeira, e só ela', () => {
    const mask = magicWandSelect(index, 10, 10, DEFAULT_WAND_OPTIONS)
    expect(selectionCoverage(mask)).toBeCloseTo(0.5, 2)
  })

  it('tolerância zero pega só o que é idêntico à semente', () => {
    const mask = magicWandSelect(index, 10, 10, { ...DEFAULT_WAND_OPTIONS, tolerance: 0 })
    expect(at(mask, 10, 10)).toBe(255)
    expect(at(mask, 10, 50)).toBe(0) // a sombra já não entra
  })

  it('é o PESO da luminância que faz a sombra passar, não a tolerância', () => {
    // Com peso 1 (comparação de cor crua, que é o que uma varinha ingênua faz)
    // a mesma sombra, na mesma tolerância, fica de fora. Este teste existe para
    // que ninguém "simplifique" LUMA_WEIGHT de volta para 1.
    const cru = magicWandSelect(index, 10, 10, { ...DEFAULT_WAND_OPTIONS, lumaWeight: 1 })
    expect(at(cru, 10, 10)).toBe(255)
    expect(at(cru, 10, 50)).toBe(0)
  })

  it('tolerância no máximo pega a imagem inteira', () => {
    const mask = magicWandSelect(index, 10, 10, { ...DEFAULT_WAND_OPTIONS, tolerance: 100 })
    expect(selectionCoverage(mask)).toBe(1)
  })
})

describe('contígua × global', () => {
  /** Duas manchas iguais SEM encostar uma na outra — o caso das ripas de madeira. */
  function buildTwoPatches(): Uint8ClampedArray {
    const px = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dentro = (x < 20 && y < 20) || (x >= 40 && y >= 40)
        const cor: RGB = dentro ? MADEIRA : AZUL
        const o = (y * W + x) * 4
        px[o] = cor[0]
        px[o + 1] = cor[1]
        px[o + 2] = cor[2]
        px[o + 3] = 255
      }
    }
    return px
  }
  const index = buildColorIndex(buildTwoPatches(), W, H)

  it('contígua pega só a mancha do clique', () => {
    const mask = magicWandSelect(index, 5, 5, { ...DEFAULT_WAND_OPTIONS, contiguous: true })
    expect(at(mask, 5, 5)).toBe(255)
    expect(at(mask, 50, 50)).toBe(0)
  })

  it('global pega as duas', () => {
    const mask = magicWandSelect(index, 5, 5, { ...DEFAULT_WAND_OPTIONS, contiguous: false })
    expect(at(mask, 5, 5)).toBe(255)
    expect(at(mask, 50, 50)).toBe(255)
  })
})

describe('robustez', () => {
  it('clique fora da imagem não estoura — é preso à borda', () => {
    const index = buildColorIndex(buildScene(), W, H)
    const mask = magicWandSelect(index, -50, 9999, DEFAULT_WAND_OPTIONS)
    expect(mask.length).toBe(W * H)
  })

  it('a média da vizinhança ignora um pixel de ruído isolado', () => {
    const px = buildScene()
    // Um pixel branco estourado bem onde o usuário vai clicar.
    const o = (10 * W + 10) * 4
    px[o] = 255
    px[o + 1] = 255
    px[o + 2] = 255
    const index = buildColorIndex(px, W, H)
    const comMedia = magicWandSelect(index, 10, 10, { ...DEFAULT_WAND_OPTIONS, sampleRadius: 2 })
    const semMedia = magicWandSelect(index, 10, 10, { ...DEFAULT_WAND_OPTIONS, sampleRadius: 0 })
    // Com média, a madeira em volta entra na seleção; sem média a semente é o
    // próprio ruído e nem o pixel vizinho se parece com ela.
    //
    // A asserção é sobre a PROPRIEDADE, não sobre um número: o ruído ainda
    // desloca um pouco a semente (é a média de 25 pixels, um deles estourado),
    // e travar uma cobertura exata aqui só criaria um teste que quebra sempre
    // que a tolerância for recalibrada contra imagens reais.
    expect(at(comMedia, 20, 20)).toBe(255)
    expect(at(semMedia, 20, 20)).toBe(0)
    expect(selectionCoverage(comMedia)).toBeGreaterThan(selectionCoverage(semMedia) * 50)
  })
})

describe('operações de conjunto', () => {
  const base = () => {
    const m = new Uint8Array(10)
    m.fill(255, 0, 5)
    return m
  }
  const patch = () => {
    const m = new Uint8Array(10)
    m.fill(255, 3, 8)
    return m
  }

  it('somar une as duas', () => {
    const out = applySelectionOp(base(), patch(), 'add')
    expect(Array.from(out)).toEqual([255, 255, 255, 255, 255, 255, 255, 255, 0, 0])
  })

  it('subtrair tira a segunda da primeira', () => {
    const out = applySelectionOp(base(), patch(), 'subtract')
    expect(Array.from(out)).toEqual([255, 255, 255, 0, 0, 0, 0, 0, 0, 0])
  })

  it('interseção mantém só o que está nas duas', () => {
    const out = applySelectionOp(base(), patch(), 'intersect')
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 255, 0, 0, 0, 0, 0])
  })

  it('substituir descarta a anterior por inteiro', () => {
    const out = applySelectionOp(base(), patch(), 'replace')
    expect(Array.from(out)).toEqual(Array.from(patch()))
  })

  it('inverter troca os dois lados', () => {
    const out = invertSelection(base())
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 255, 255, 255, 255, 255])
  })
})
