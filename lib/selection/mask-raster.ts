// lib/selection/mask-raster.ts
//
// A seleção do Editar V4 é um RASTER: um `Uint8Array` de 0/255 na resolução
// natural da imagem. Essa é a mudança estrutural em relação ao V3, que guardava
// uma lista de traços vetoriais.
//
// Por que isso importa: varinha mágica, operações booleanas, expandir/contrair,
// inverter e marching ants são todas operações sobre CONJUNTO DE PIXELS. Com
// traços vetoriais, nenhuma delas encaixa — não dá para subtrair o resultado de
// uma varinha de um traço de pincel, nem para expandir um polígono em 3 px sem
// reimplementar offsetting de polígono. Com raster, todas são a mesma coisa.
//
// Este módulo é puro (sem DOM, sem React) para poder ser testado. A parte que
// depende de canvas — rasterizar um traço ou um polígono — mora no componente,
// porque ali o rasterizador do próprio browser faz o trabalho melhor e mais
// rápido do que qualquer scanline escrita à mão.

import { close, dilate, erode, fillInteriorHoles } from '@/lib/edit-v2/mask-morphology'

// ── Histórico (undo/redo) ───────────────────────────────────────────────────
//
// Guardar snapshots crus custaria caro: uma imagem de 12 MP dá 12 MB por
// estado, e oito estados de histórico viram ~100 MB de RAM. Máscara binária,
// porém, é quase toda formada por corridas longas do mesmo valor — RLE a
// comprime na casa de 100:1 sem perda nenhuma.

/** Comprime a máscara em corridas alternadas começando por ZERO.
 *  `[3, 5, 2]` = 3 pixels vazios, 5 selecionados, 2 vazios. */
export function rleEncode(mask: Uint8Array): Int32Array {
  const runs: number[] = []
  let current = 0
  let run = 0
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] > 127 ? 255 : 0
    if (v === current) {
      run++
    } else {
      runs.push(run)
      current = v
      run = 1
    }
  }
  runs.push(run)
  return Int32Array.from(runs)
}

/** Reconstrói a máscara a partir do RLE. `length` é o tamanho esperado. */
export function rleDecode(runs: Int32Array, length: number): Uint8Array {
  const mask = new Uint8Array(length)
  let i = 0
  let value = 0
  for (let r = 0; r < runs.length && i < length; r++) {
    const end = Math.min(length, i + runs[r])
    if (value === 255) mask.fill(255, i, end)
    i = end
    value = value === 0 ? 255 : 0
  }
  return mask
}

// ── Edição da seleção ────────────────────────────────────────────────────────

/** Cresce a seleção em `px` pixels. Útil quando a borda ficou apertada e sobra
 *  um fiapo do material antigo em volta da edição. */
export function expandSelection(
  mask: Uint8Array,
  width: number,
  height: number,
  px: number,
): Uint8Array {
  return px <= 0 ? mask : dilate(mask, width, height, Math.round(px))
}

/** Encolhe a seleção em `px` pixels — o contrário: a seleção invadiu o vizinho. */
export function contractSelection(
  mask: Uint8Array,
  width: number,
  height: number,
  px: number,
): Uint8Array {
  return px <= 0 ? mask : erode(mask, width, height, Math.round(px))
}

/** Suaviza: fecha frestas e come as pontas finas que o pincel deixa, sem mexer
 *  no volume da seleção (close é dilate→erode, net-zero em região convexa). */
export function smoothSelection(
  mask: Uint8Array,
  width: number,
  height: number,
  px = 2,
): Uint8Array {
  return px <= 0 ? mask : close(mask, width, height, Math.round(px))
}

/** Tampa buracos fechados dentro da seleção. A varinha os cria o tempo todo:
 *  um reflexo claro no meio do piso fica de fora da tolerância e vira ilha. */
export function fillSelectionHoles(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  return fillInteriorHoles(mask, width, height)
}

/**
 * Remove manchas soltas menores que `minPixels`. É a outra metade da faxina da
 * varinha: em textura ruidosa ela salpica dezenas de pontinhos longe do clique,
 * e cada um deles vira uma micro-edição indesejada.
 *
 * Rotulagem por flood fill 4-conexo, iterativa (pilha em `Int32Array`) — chamada
 * recursiva estoura a pilha do JS numa mancha de milhões de pixels.
 */
export function removeSmallIslands(
  mask: Uint8Array,
  width: number,
  height: number,
  minPixels: number,
): Uint8Array {
  if (minPixels <= 1) return mask
  const n = width * height
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const component = new Int32Array(n)
  const out = new Uint8Array(n)

  for (let start = 0; start < n; start++) {
    if (seen[start] || mask[start] <= 127) continue
    let sp = 0
    let size = 0
    stack[sp++] = start
    seen[start] = 1
    while (sp > 0) {
      const p = stack[--sp]
      component[size++] = p
      const x = p % width
      const y = (p - x) / width
      if (x > 0 && !seen[p - 1] && mask[p - 1] > 127) { seen[p - 1] = 1; stack[sp++] = p - 1 }
      if (x < width - 1 && !seen[p + 1] && mask[p + 1] > 127) { seen[p + 1] = 1; stack[sp++] = p + 1 }
      if (y > 0 && !seen[p - width] && mask[p - width] > 127) { seen[p - width] = 1; stack[sp++] = p - width }
      if (y < height - 1 && !seen[p + width] && mask[p + width] > 127) { seen[p + width] = 1; stack[sp++] = p + width }
    }
    if (size >= minPixels) {
      for (let i = 0; i < size; i++) out[component[i]] = 255
    }
  }
  return out
}

// ── Apresentação ─────────────────────────────────────────────────────────────

/** Constrói o RGBA do véu que pinta a seleção na tela. */
export function maskToOverlayRgba(
  mask: Uint8Array,
  rgb: { r: number; g: number; b: number },
  alpha: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length * 4)
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)))
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= 127) continue
    const o = i * 4
    out[o] = rgb.r
    out[o + 1] = rgb.g
    out[o + 2] = rgb.b
    out[o + 3] = a
  }
  return out
}

/** Converte a seleção no PNG P&B que a API espera (branco = editar). */
export function maskToGrayscaleRgba(mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length * 4)
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] > 127 ? 255 : 0
    const o = i * 4
    out[o] = v
    out[o + 1] = v
    out[o + 2] = v
    out[o + 3] = 255
  }
  return out
}

/** Lê de volta um PNG de máscara (para reaproveitar a seleção entre edições). */
export function rgbaToMask(pixels: Uint8ClampedArray, length: number): Uint8Array {
  const mask = new Uint8Array(length)
  for (let i = 0; i < length; i++) mask[i] = pixels[i * 4] > 127 ? 255 : 0
  return mask
}

/** Existe alguma coisa selecionada? */
export function hasAnySelection(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) if (mask[i] > 127) return true
  return false
}
