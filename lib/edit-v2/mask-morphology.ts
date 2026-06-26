// lib/edit-v2/mask-morphology.ts
//
// Morfologia pura (Uint8Array, zero deps) para SURFACE COMPLETION: preencher o
// INTERIOR da superfície-alvo sem crescer o contorno externo cegamente.
//   - close (dilate→erode): bridge de faixas/seams internos sem expandir a
//     borda externa convexa;
//   - fillInteriorHoles: tampa buracos ENCLAUSURADOS (ilhas internas sem
//     seleção) via flood do fundo a partir da borda — o que não é alcançável
//     pelo fundo é buraco interno → vira branco.
// Nada disto é dilatação cega: o close é simétrico e o fill só age em buracos
// fechados. Limites arquitetônicos vêm de fora (clip à box + subtração de
// exclusões), aplicados pelo wrapper.

export function countWhite(m: Uint8Array): number {
  let c = 0
  for (let i = 0; i < m.length; i++) if (m[i] > 127) c++
  return c
}

function morphPass(src: Uint8Array, w: number, h: number, r: number, isMax: boolean): Uint8Array {
  const tmp = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let v = isMax ? 0 : 255
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      for (let k = x0; k <= x1; k++) {
        const s = src[row + k]
        v = isMax ? (s > v ? s : v) : (s < v ? s : v)
      }
      tmp[row + x] = v
    }
  }
  const out = new Uint8Array(src.length)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = isMax ? 0 : 255
      const y0 = Math.max(0, y - r)
      const y1 = Math.min(h - 1, y + r)
      for (let k = y0; k <= y1; k++) {
        const s = tmp[k * w + x]
        v = isMax ? (s > v ? s : v) : (s < v ? s : v)
      }
      out[y * w + x] = v
    }
  }
  return out
}

export const dilate = (m: Uint8Array, w: number, h: number, r: number) => morphPass(m, w, h, r, true)
export const erode = (m: Uint8Array, w: number, h: number, r: number) => morphPass(m, w, h, r, false)

/** close = dilate→erode: fecha faixas/buracos até ~2r de largura SEM crescer a
 *  borda externa (net-zero em região convexa; preenche concavidades). */
export function close(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return erode(dilate(m, w, h, r), w, h, r)
}

/** Preenche buracos INTERNOS (fundo não alcançável a partir da borda da imagem).
 *  Flood 4-conexo do fundo (<=127) começando por todos os pixels de borda;
 *  qualquer fundo não visitado é buraco fechado → branco. */
export function fillInteriorHoles(src: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h
  const reachable = new Uint8Array(n)
  const stack = new Int32Array(n)
  let sp = 0
  const pushBg = (i: number) => {
    if (src[i] <= 127 && !reachable[i]) {
      reachable[i] = 1
      stack[sp++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    pushBg(x)
    pushBg((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    pushBg(y * w)
    pushBg(y * w + (w - 1))
  }
  while (sp > 0) {
    const p = stack[--sp]
    const x = p % w
    const y = (p - x) / w
    if (x > 0) pushBg(p - 1)
    if (x < w - 1) pushBg(p + 1)
    if (y > 0) pushBg(p - w)
    if (y < h - 1) pushBg(p + w)
  }
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = src[i] > 127 || reachable[i] === 0 ? 255 : 0
  return out
}

/** Razão de buracos internos: holes / (white + holes). 0 = sólido (sem ilhas),
 *  perto de 1 = muito esburacado. Métrica objetiva de cobertura interna. */
export function interiorHoleRatio(src: Uint8Array, w: number, h: number): number {
  const filled = fillInteriorHoles(src, w, h)
  const whiteFilled = countWhite(filled)
  if (whiteFilled === 0) return 0
  const holes = whiteFilled - countWhite(src)
  return holes / whiteFilled
}
