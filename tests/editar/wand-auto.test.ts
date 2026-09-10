// Auto-ajuste da tolerância da varinha.
//
// O caso que motivou esta função apareceu só na tela: numa sala real, clicar no
// piso com tolerância 11 selecionava metade da cena, porque a parede terracota e
// a madeira do piso se encontram numa faixa de tons intermediários que serve de
// PONTE para o preenchimento atravessar. A mesma tolerância, na mesma imagem,
// era correta para outros pontos.
//
// A régua não pode ser cobertura absoluta — 50% é vazamento numa sala e um céu
// legítimo num exterior. O que separa os dois é a DERIVADA: se baixar um degrau
// de tolerância derruba a cobertura à metade, a seleção estava presa por uma
// ponte estreita. Estes testes trancam esse comportamento nos dois sentidos.

import { describe, expect, it } from 'vitest'
import {
  buildColorIndex,
  magicWandAuto,
  magicWandSelect,
  selectionCoverage,
} from '@/lib/selection/magic-wand'

const W = 80
const H = 40

type RGB = [number, number, number]

function paint(pick: (x: number, y: number) => RGB): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pick(x, y)
      const o = (y * W + x) * 4
      px[o] = r
      px[o + 1] = g
      px[o + 2] = b
      px[o + 3] = 255
    }
  }
  return px
}

const MADEIRA: RGB = [150, 120, 90]
const TERRACOTA: RGB = [186, 110, 84]

/** Dois materiais ligados por uma rampa de tons intermediários — a "ponte". */
function cenaComPonte(): Uint8ClampedArray {
  const RAMP0 = 36
  const RAMP1 = 44
  return paint((x) => {
    if (x < RAMP0) return MADEIRA
    if (x > RAMP1) return TERRACOTA
    const t = (x - RAMP0) / (RAMP1 - RAMP0)
    return [
      Math.round(MADEIRA[0] + (TERRACOTA[0] - MADEIRA[0]) * t),
      Math.round(MADEIRA[1] + (TERRACOTA[1] - MADEIRA[1]) * t),
      Math.round(MADEIRA[2] + (TERRACOTA[2] - MADEIRA[2]) * t),
    ]
  })
}

/** Uma região grande e uniforme, separada por borda DURA de outra bem diferente. */
function cenaComBordaDura(): Uint8ClampedArray {
  const AZUL: RGB = [60, 90, 180]
  return paint((x) => (x < 56 ? MADEIRA : AZUL))
}

const opts = { tolerance: 26, contiguous: true, sampleRadius: 2 }

describe('a ponte entre materiais', () => {
  const index = buildColorIndex(cenaComPonte(), W, H)

  it('a tolerância pedida atravessa a ponte e engole a cena', () => {
    const mask = magicWandSelect(index, 8, 20, opts)
    expect(selectionCoverage(mask)).toBeGreaterThan(0.8)
  })

  it('o auto-ajuste percebe e baixa a tolerância', () => {
    const { tolerance } = magicWandAuto(index, 8, 20, opts)
    expect(tolerance).toBeLessThan(opts.tolerance)
  })

  it('e o resultado passa a ser o material clicado, não a cena', () => {
    const { mask } = magicWandAuto(index, 8, 20, opts)
    const cov = selectionCoverage(mask)
    expect(cov).toBeGreaterThan(0.2)
    expect(cov).toBeLessThan(0.6)
  })
})

describe('região grande e legítima', () => {
  const index = buildColorIndex(cenaComBordaDura(), W, H)

  it('não é encolhida só por ser grande — não há penhasco para achar', () => {
    const { tolerance, mask } = magicWandAuto(index, 8, 20, opts)
    expect(tolerance).toBe(opts.tolerance)
    // 56/80 = 70% da imagem, e continua selecionada inteira.
    expect(selectionCoverage(mask)).toBeCloseTo(0.7, 1)
  })
})

describe('seleção pequena', () => {
  it('fica intocada — cair pela metade ali é normal', () => {
    const index = buildColorIndex(cenaComBordaDura(), W, H)
    const pequena = { ...opts, tolerance: 2 }
    const { tolerance } = magicWandAuto(index, 8, 20, pequena)
    expect(tolerance).toBe(2)
  })
})

describe('seleção do tamanho de um céu', () => {
  /** Uma faixa que ocupa ~30% da imagem, separada por borda dura do resto —
   *  o formato de um céu de exterior ou de um piso visto em perspectiva. */
  function cenaComFaixa(): Uint8ClampedArray {
    const CEU: RGB = [120, 150, 200]
    const CHAO: RGB = [80, 110, 60]
    return paint((_x, y) => (y < 12 ? CEU : CHAO))
  }

  it('não é encolhida — 30% é seleção legítima, não vazamento', () => {
    // A regressão que isto tranca: o piso do auto-ajuste estava em 25%, no meio
    // da faixa em que as seleções CORRETAS vivem (10–31% nas imagens do
    // acervo). Um céu de 25,3% — seleção certa — era encolhido sem precisar.
    const index = buildColorIndex(cenaComFaixa(), W, H)
    const { tolerance, mask } = magicWandAuto(index, 40, 5, opts)
    expect(tolerance).toBe(opts.tolerance)
    expect(selectionCoverage(mask)).toBeCloseTo(0.3, 1)
  })
})
