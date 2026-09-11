// A seleção como raster: histórico comprimido, faxina e contornos.

import { describe, expect, it } from 'vitest'
import {
  contractSelection,
  expandSelection,
  fillSelectionHoles,
  hasAnySelection,
  removeSmallIslands,
  rgbaToMask,
  rleDecode,
  rleEncode,
  maskToGrayscaleRgba,
} from '@/lib/selection/mask-raster'
import { traceMaskContours } from '@/lib/selection/contours'

const W = 40
const H = 40

/** Retângulo cheio dentro de uma máscara vazia. */
function rect(x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const m = new Uint8Array(W * H)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 255
  return m
}

describe('histórico em RLE', () => {
  it('vai e volta sem perder um pixel', () => {
    const m = rect(5, 5, 20, 30)
    const back = rleDecode(rleEncode(m), m.length)
    expect(Array.from(back)).toEqual(Array.from(m))
  })

  it('vai e volta numa máscara vazia e numa cheia', () => {
    for (const m of [new Uint8Array(W * H), new Uint8Array(W * H).fill(255)]) {
      expect(Array.from(rleDecode(rleEncode(m), m.length))).toEqual(Array.from(m))
    }
  })

  it('comprime de verdade — é o que torna o undo viável', () => {
    const m = rect(5, 5, 35, 35)
    // Sem compressão seriam 1600 bytes; em corridas, poucas dezenas de números.
    expect(rleEncode(m).length).toBeLessThan(m.length / 10)
  })

  it('sobrevive a um RLE mais curto que a máscara', () => {
    const back = rleDecode(Int32Array.from([5, 5]), W * H)
    expect(back.length).toBe(W * H)
    expect(back[0]).toBe(0)
    expect(back[6]).toBe(255)
  })
})

describe('edição da seleção', () => {
  it('expandir cresce e contrair encolhe', () => {
    const m = rect(10, 10, 20, 20)
    const maior = expandSelection(Uint8Array.from(m), W, H, 2)
    const menor = contractSelection(Uint8Array.from(m), W, H, 2)
    expect(maior[12 * W + 8]).toBe(255) // 2 px à esquerda da borda original
    expect(menor[10 * W + 10]).toBe(0)  // a borda original saiu
  })

  it('expandir e contrair pelo mesmo tanto volta perto do começo', () => {
    const m = rect(10, 10, 25, 25)
    const ida = expandSelection(Uint8Array.from(m), W, H, 2)
    const volta = contractSelection(ida, W, H, 2)
    expect(Array.from(volta)).toEqual(Array.from(m))
  })

  it('tampa buraco interno — a ilha que a varinha deixa num reflexo', () => {
    const m = rect(8, 8, 30, 30)
    for (let y = 15; y < 20; y++) for (let x = 15; x < 20; x++) m[y * W + x] = 0
    const cheia = fillSelectionHoles(m, W, H)
    expect(cheia[17 * W + 17]).toBe(255)
  })

  it('remove manchas soltas menores que o piso', () => {
    const m = rect(5, 5, 25, 25)
    m[38 * W + 38] = 255 // um pontinho perdido
    const limpa = removeSmallIslands(m, W, H, 20)
    expect(limpa[38 * W + 38]).toBe(0)
    expect(limpa[10 * W + 10]).toBe(255)
  })

  it('não remove nada quando o piso é 1', () => {
    const m = rect(5, 5, 8, 8)
    m[38 * W + 38] = 255
    expect(removeSmallIslands(m, W, H, 1)[38 * W + 38]).toBe(255)
  })
})

describe('exportação da máscara', () => {
  it('vira PNG P&B e volta idêntica', () => {
    const m = rect(6, 6, 22, 22)
    const back = rgbaToMask(maskToGrayscaleRgba(m), m.length)
    expect(Array.from(back)).toEqual(Array.from(m))
  })

  it('sabe dizer se há algo selecionado', () => {
    expect(hasAnySelection(new Uint8Array(W * H))).toBe(false)
    expect(hasAnySelection(rect(1, 1, 2, 2))).toBe(true)
  })
})

describe('contornos (marching ants)', () => {
  it('um retângulo dá um caminho fechado só', () => {
    const paths = traceMaskContours(rect(10, 10, 25, 25), W, H)
    expect(paths.length).toBe(1)
    const p = paths[0]
    // Fecha: o último ponto volta ao primeiro.
    expect(p[0]).toBe(p[p.length - 2])
    expect(p[1]).toBe(p[p.length - 1])
  })

  it('o contorno acompanha a borda do retângulo', () => {
    const paths = traceMaskContours(rect(10, 10, 25, 25), W, H)
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i + 1 < paths[0].length; i += 2) {
      minX = Math.min(minX, paths[0][i])
      maxX = Math.max(maxX, paths[0][i])
    }
    // Marching squares corre entre pixels: a borda cai a meio pixel da célula.
    expect(minX).toBeCloseTo(9.5, 1)
    expect(maxX).toBeCloseTo(24.5, 1)
  })

  it('buraco interno vira caminho próprio', () => {
    const m = rect(8, 8, 32, 32)
    for (let y = 15; y < 22; y++) for (let x = 15; x < 22; x++) m[y * W + x] = 0
    expect(traceMaskContours(m, W, H).length).toBe(2)
  })

  it('duas manchas separadas dão dois caminhos', () => {
    const m = rect(3, 3, 10, 10)
    for (let y = 25; y < 35; y++) for (let x = 25; x < 35; x++) m[y * W + x] = 255
    expect(traceMaskContours(m, W, H).length).toBe(2)
  })

  it('máscara vazia não tem contorno', () => {
    expect(traceMaskContours(new Uint8Array(W * H), W, H)).toEqual([])
  })
})
