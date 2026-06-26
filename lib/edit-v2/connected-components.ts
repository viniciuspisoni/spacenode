// lib/edit-v2/connected-components.ts
//
// Rotulagem de componentes conexos (8-conexo) + retenção dos componentes que
// TOCAM a região âncora. É o núcleo da política "superfície inteira conectada
// à região": a máscara semântica do evf-sam pode conter a superfície-alvo E
// material parecido em outra parte da imagem (parede oposta) — mantemos só o(s)
// componente(s) ligados ao que o usuário circulou.
//
// Puro (Uint8Array, zero dependências) → testável isolado, sem rede/custo.

export interface KeepRegionResult {
  /** 255 nos componentes mantidos, 0 no resto. */
  out: Uint8Array
  /** Total de componentes brancos em `cand`. */
  componentCount: number
  /** Quantos componentes tocaram a região. */
  keptCount: number
  /** Pixels brancos no resultado. */
  keptPixels: number
}

/**
 * @param cand  máscara candidata binária (>127 = on), tamanho w*h
 * @param reg   região âncora binária (>127 = on), mesmo tamanho
 */
export function keepRegionComponents(
  cand: Uint8Array,
  reg: Uint8Array,
  w: number,
  h: number,
): KeepRegionResult {
  const n = w * h
  const label = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n) // cada pixel entra na pilha no máx. 1x
  const touches: boolean[] = []
  let componentCount = 0

  for (let start = 0; start < n; start++) {
    if (cand[start] <= 127 || label[start] !== -1) continue
    const id = componentCount++
    touches[id] = false
    let sp = 0
    stack[sp++] = start
    label[start] = id
    while (sp > 0) {
      const p = stack[--sp]
      if (reg[p] > 127) touches[id] = true
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (cand[q] > 127 && label[q] === -1) {
            label[q] = id
            stack[sp++] = q
          }
        }
      }
    }
  }

  const out = new Uint8Array(n)
  let keptCount = 0
  let keptPixels = 0
  for (let i = 0; i < touches.length; i++) if (touches[i]) keptCount++
  for (let p = 0; p < n; p++) {
    const l = label[p]
    if (l >= 0 && touches[l]) {
      out[p] = 255
      keptPixels++
    }
  }
  return { out, componentCount, keptCount, keptPixels }
}
