// lib/selection/contours.ts
//
// Extrai o contorno da seleção como polilinhas fechadas — o que permite os
// "marching ants" (o tracejado animado que todo editor de imagem tem).
//
// Por que não desenhar só a borda pixel a pixel: um traço feito de milhares de
// segmentos soltos de 1 px não anima. Tracejado depende de COMPRIMENTO ao longo
// de um caminho contínuo (`lineDashOffset` corre sobre o path), então é preciso
// encadear os segmentos em caminhos de verdade.
//
// Algoritmo: MARCHING SQUARES. Para cada célula 2×2 da máscara, o padrão dos
// quatro cantos decide quais arestas o contorno cruza. Os pontos caem sempre no
// meio das arestas da grade — coordenadas múltiplas de 0,5 — então os extremos
// de segmentos vizinhos são EXATAMENTE iguais e o encadeamento é feito por
// igualdade inteira, sem tolerância de ponto flutuante e sem costura frouxa.
//
// Bônus de graça: buracos internos saem como caminhos próprios, sem tratamento
// especial. Uma seleção de piso com um tapete recortado no meio ganha o
// tracejado por fora E em volta do tapete.

/** Um caminho fechado, em coordenadas de PIXEL da imagem: [x0,y0,x1,y1,...]. */
export type ContourPath = Float32Array

/** Teto de segurança: máscara muito picotada (ruído) pode gerar dezenas de
 *  milhares de caminhos minúsculos, que não ajudam ninguém a ver a seleção e
 *  travariam o desenho. */
const MAX_PATHS = 4000
const MIN_PATH_POINTS = 4

/**
 * Devolve os contornos da máscara.
 *
 * Custo: uma passada por célula, O(w×h). Deve ser chamado quando a seleção
 * ASSENTA (fim do gesto), nunca a cada frame — a animação do tracejado é só
 * `lineDashOffset` sobre os caminhos já prontos.
 */
export function traceMaskContours(
  mask: Uint8Array,
  width: number,
  height: number,
): ContourPath[] {
  if (width < 2 || height < 2) return []

  // Segmentos em coordenadas DOBRADAS (inteiras): x2 = x * 2.
  const xs1: number[] = []
  const ys1: number[] = []
  const xs2: number[] = []
  const ys2: number[] = []
  const on = (x: number, y: number) => (mask[y * width + x] > 127 ? 1 : 0)

  const push = (ax: number, ay: number, bx: number, by: number) => {
    xs1.push(ax); ys1.push(ay); xs2.push(bx); ys2.push(by)
  }

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const tl = on(x, y)
      const tr = on(x + 1, y)
      const br = on(x + 1, y + 1)
      const bl = on(x, y + 1)
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl
      if (code === 0 || code === 15) continue

      // Pontos médios das arestas, em coordenadas dobradas.
      const x2 = x * 2
      const y2 = y * 2
      const T = [x2 + 1, y2]
      const R = [x2 + 2, y2 + 1]
      const B = [x2 + 1, y2 + 2]
      const L = [x2, y2 + 1]

      switch (code) {
        case 1: case 14: push(L[0], L[1], B[0], B[1]); break
        case 2: case 13: push(B[0], B[1], R[0], R[1]); break
        case 3: case 12: push(L[0], L[1], R[0], R[1]); break
        case 4: case 11: push(T[0], T[1], R[0], R[1]); break
        case 6: case 9:  push(T[0], T[1], B[0], B[1]); break
        case 7: case 8:  push(L[0], L[1], T[0], T[1]); break
        // Casos ambíguos (diagonais opostas): resolvidos pela convenção de
        // separar os cantos, que é a que preserva buracos finos.
        case 5:
          push(L[0], L[1], T[0], T[1])
          push(B[0], B[1], R[0], R[1])
          break
        case 10:
          push(T[0], T[1], R[0], R[1])
          push(L[0], L[1], B[0], B[1])
          break
      }
    }
  }

  const count = xs1.length
  if (count === 0) return []

  // Índice de ponto → segmentos que nele começam ou terminam.
  const stride = width * 2 + 3
  const key = (x: number, y: number) => y * stride + x
  const byPoint = new Map<number, number[]>()
  const add = (k: number, seg: number) => {
    const list = byPoint.get(k)
    if (list) list.push(seg)
    else byPoint.set(k, [seg])
  }
  for (let s = 0; s < count; s++) {
    add(key(xs1[s], ys1[s]), s)
    add(key(xs2[s], ys2[s]), s)
  }

  const used = new Uint8Array(count)
  const paths: ContourPath[] = []

  for (let s = 0; s < count && paths.length < MAX_PATHS; s++) {
    if (used[s]) continue
    used[s] = 1
    const pts: number[] = [xs1[s], ys1[s], xs2[s], ys2[s]]
    let curX = xs2[s]
    let curY = ys2[s]

    // Anda de segmento em segmento até fechar o laço ou não haver continuação.
    for (;;) {
      const list = byPoint.get(key(curX, curY))
      if (!list) break
      let next = -1
      for (const cand of list) {
        if (!used[cand]) { next = cand; break }
      }
      if (next < 0) break
      used[next] = 1
      // O próximo ponto é a outra ponta do segmento encontrado.
      const sameStart = xs1[next] === curX && ys1[next] === curY
      curX = sameStart ? xs2[next] : xs1[next]
      curY = sameStart ? ys2[next] : ys1[next]
      pts.push(curX, curY)
      if (curX === xs1[s] && curY === ys1[s]) break // fechou
    }

    if (pts.length / 2 < MIN_PATH_POINTS) continue
    // Volta para coordenadas de pixel (desfaz a duplicação).
    const path = new Float32Array(pts.length)
    for (let i = 0; i < pts.length; i++) path[i] = pts[i] / 2
    paths.push(path)
  }

  return paths
}

/** Monta um `Path2D` com todos os contornos, já convertidos para coordenadas de
 *  TELA pela função de projeção do canvas. */
export function contoursToPath2D(
  paths: ContourPath[],
  toScreen: (x: number, y: number) => { x: number; y: number },
): Path2D {
  const p = new Path2D()
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i += 2) {
      const q = toScreen(path[i], path[i + 1])
      if (i === 0) p.moveTo(q.x, q.y)
      else p.lineTo(q.x, q.y)
    }
    p.closePath()
  }
  return p
}
