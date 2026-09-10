// lib/selection/magic-wand.ts
//
// A varinha mágica: clique num ponto, saia com a área inteira selecionada.
// Funções puras sobre arrays tipados — sem React, sem canvas, sem rede. Roda no
// browser, custa zero e responde em milissegundos.
//
// ── A decisão que faz ela prestar em render arquitetônico ────────────────────
//
// Varinha ingênua compara cor em RGB e para na primeira sombra: o mesmo
// porcelanato sob a mesa e sob a janela tem RGB muito diferente, então o
// usuário clica no piso e seleciona metade dele. Em render isso é a regra, não
// a exceção — a cena inteira é iluminação.
//
// A saída é separar LUMINÂNCIA de CROMA e dar peso menor à luminância. Sombra
// mexe muito em Y e pouco em Cb/Cr; material diferente mexe em Cb/Cr. Com
// `LUMA_WEIGHT` em 0,35 a varinha atravessa a sombra e para no rodapé, que é
// exatamente o que se quer.
//
// Uso YCbCr e não Lab de propósito. Lab é mais fiel à percepção, mas custa três
// raízes cúbicas por pixel: numa imagem de 8 MP são 24 milhões de `cbrt` e a
// ferramenta deixa de ser instantânea. YCbCr é uma transformação linear — dez
// operações por pixel — e entrega a mesma propriedade que importa aqui, que é
// poder pesar luminância e croma separadamente.

/** Peso da luminância na distância de cor. < 1 faz a seleção atravessar sombra
 *  e reflexo do MESMO material sem vazar para um material vizinho. */
export const LUMA_WEIGHT = 0.35

/** Converte tolerância de produto (0–100) em distância máxima no espaço
 *  ponderado. O fator é calibrado para que ~20 se pareça com o "32" clássico do
 *  Photoshop em superfície chapada. */
export const TOLERANCE_SCALE = 2.2

/** Imagem pré-convertida para YCbCr. Calculada UMA vez quando a imagem carrega
 *  — não uma vez por clique. É o que permite arrastar o controle de tolerância
 *  e ver o resultado mudar sem travar. */
export interface ColorIndex {
  width: number
  height: number
  y: Int16Array
  cb: Int16Array
  cr: Int16Array
}

/** Constrói o índice de cor a partir do RGBA cru de um canvas. */
export function buildColorIndex(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ColorIndex {
  const n = width * height
  const y = new Int16Array(n)
  const cb = new Int16Array(n)
  const cr = new Int16Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = pixels[p]
    const g = pixels[p + 1]
    const b = pixels[p + 2]
    y[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0
    cb[i] = (-0.168736 * r - 0.331264 * g + 0.5 * b + 128) | 0
    cr[i] = (0.5 * r - 0.418688 * g - 0.081312 * b + 128) | 0
  }
  return { width, height, y, cb, cr }
}

export interface WandOptions {
  /** 0–100. Quanto a cor pode variar e ainda entrar na seleção. */
  tolerance: number
  /** true = só a mancha conectada ao clique. false = todo pixel parecido da
   *  imagem (resolve "todas as ripas de madeira" num clique só). */
  contiguous: boolean
  /** Raio, em px, da média usada para ler a cor do ponto clicado. 0 lê um pixel
   *  só e um único pixel de ruído define a seleção inteira. */
  sampleRadius: number
  /** Peso da luminância. Existe como parâmetro para poder ser CALIBRADO contra
   *  imagens reais (scripts/edit-v4-wand-calibrate.mts); a UI não o expõe —
   *  quem usa mexe na tolerância, que é o controle que faz sentido para quem
   *  está selecionando. Ausente = LUMA_WEIGHT. */
  lumaWeight?: number
}

/** Padrões calibrados contra imagens REAIS do acervo, não no chute
 *  (scripts/edit-v4-wand-calibrate.mts, 2026-09-10).
 *
 *  A medição revelou um PENHASCO: em toda imagem existe uma tolerância a partir
 *  da qual o preenchimento acha um caminho pelos degradês e escapa para a cena
 *  inteira. Abaixo dela a cobertura fica em 10–25% e sementes de materiais
 *  diferentes devolvem áreas diferentes; um degrau acima, tudo vira 70–90% e a
 *  ferramenta deixa de significar coisa alguma. O penhasco fica entre 11 e 14
 *  numa sala fotorrealista e entre 14 e 18 num exterior.
 *
 *  Por isso 11: é o maior valor que fica abaixo do penhasco nas duas. Sub-selecionar
 *  tem conserto barato — Shift e mais um clique; a seleção que engoliu a cena
 *  inteira faz o usuário desconfiar da ferramenta. Quem quiser mais tem o
 *  controle de tolerância na folha "Seleção". */
export const DEFAULT_WAND_OPTIONS: WandOptions = {
  tolerance: 11,
  contiguous: true,
  sampleRadius: 2,
}

/** Cor média numa vizinhança quadrada — a semente da comparação. */
function sampleSeed(
  index: ColorIndex,
  x: number,
  y: number,
  radius: number,
): { y: number; cb: number; cr: number } {
  const { width, height } = index
  const x0 = Math.max(0, x - radius)
  const x1 = Math.min(width - 1, x + radius)
  const y0 = Math.max(0, y - radius)
  const y1 = Math.min(height - 1, y + radius)
  let sy = 0
  let scb = 0
  let scr = 0
  let count = 0
  for (let yy = y0; yy <= y1; yy++) {
    const row = yy * width
    for (let xx = x0; xx <= x1; xx++) {
      const i = row + xx
      sy += index.y[i]
      scb += index.cb[i]
      scr += index.cr[i]
      count++
    }
  }
  return { y: sy / count, cb: scb / count, cr: scr / count }
}

/**
 * Seleciona a área a partir de um clique. Devolve uma máscara 0/255 do tamanho
 * da imagem (255 = selecionado).
 *
 * Contígua usa flood fill por SPANS (linha inteira de uma vez) com pilha em
 * `Int32Array`: sem recursão, sem `Array.push`, O(N). Em 8 MP roda na casa dos
 * 60–120 ms, que é o orçamento de um clique.
 */
export function magicWandSelect(
  index: ColorIndex,
  seedX: number,
  seedY: number,
  opts: WandOptions,
): Uint8Array {
  const { width, height } = index
  const out = new Uint8Array(width * height)
  const x = Math.max(0, Math.min(width - 1, Math.round(seedX)))
  const y = Math.max(0, Math.min(height - 1, Math.round(seedY)))
  if (width <= 0 || height <= 0) return out

  const seed = sampleSeed(index, x, y, Math.max(0, opts.sampleRadius))
  const maxDist = Math.max(0, opts.tolerance) * TOLERANCE_SCALE
  const maxDistSq = maxDist * maxDist
  const wl = opts.lumaWeight ?? LUMA_WEIGHT

  const matches = (i: number): boolean => {
    const dy = index.y[i] - seed.y
    const dcb = index.cb[i] - seed.cb
    const dcr = index.cr[i] - seed.cr
    return wl * dy * dy + dcb * dcb + dcr * dcr <= maxDistSq
  }

  if (!opts.contiguous) {
    for (let i = 0; i < out.length; i++) if (matches(i)) out[i] = 255
    return out
  }

  // O pixel clicado pode não bater com a própria semente: é o caso de clicar em
  // cima de um speck de ruído, um highlight estourado ou um pixel de borda. A
  // média da vizinhança acerta a cor do material, mas o ponto de partida do
  // preenchimento continua sendo aquele pixel esquisito — e o resultado seria
  // uma seleção vazia justo quando a média fez o trabalho certo. Nesse caso,
  // começa do pixel mais próximo, DENTRO do raio de amostragem, que bate com a
  // semente.
  let startX = x
  let startY = y
  if (!matches(y * width + x)) {
    const r = Math.max(1, opts.sampleRadius)
    let best = -1
    let bestDist = Infinity
    for (let yy = Math.max(0, y - r); yy <= Math.min(height - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(width - 1, x + r); xx++) {
        const i = yy * width + xx
        if (!matches(i)) continue
        const d = (xx - x) * (xx - x) + (yy - y) * (yy - y)
        if (d < bestDist) { bestDist = d; best = i }
      }
    }
    if (best < 0) return out // nada na vizinhança serve: seleção vazia mesmo
    startX = best % width
    startY = (best - startX) / width
  }

  // Flood fill por spans. A pilha guarda pares (x, y) — o x de onde a próxima
  // linha deve ser explorada.
  //
  // Ela CRESCE sob demanda em vez de reservar duas entradas por pixel: como o
  // empilhamento é por span e não por pixel, a profundidade real fica na ordem
  // das dezenas de milhares mesmo em máscara complicada. Reservar o pior caso
  // custaria 64 MB por clique numa imagem de 8 MP — alocados, zerados e jogados
  // fora a cada uso da ferramenta.
  let stack = new Int32Array(Math.max(4096, Math.min(width * height * 2, 1 << 16)))
  let sp = 0
  const push = (px: number, py: number) => {
    if (py < 0 || py >= height) return
    if (sp + 2 > stack.length) {
      const bigger = new Int32Array(stack.length * 2)
      bigger.set(stack)
      stack = bigger
    }
    stack[sp++] = px
    stack[sp++] = py
  }
  push(startX, startY)

  while (sp > 0) {
    const py = stack[--sp]
    const px = stack[--sp]
    const row = py * width
    if (out[row + px] === 255 || !matches(row + px)) continue

    // Estende para os dois lados até a cor sair da tolerância.
    let left = px
    while (left > 0 && out[row + left - 1] !== 255 && matches(row + left - 1)) left--
    let right = px
    while (right < width - 1 && out[row + right + 1] !== 255 && matches(row + right + 1)) right++
    for (let i = left; i <= right; i++) out[row + i] = 255

    // Nas linhas de cima e de baixo, empilha um ponto por SPAN novo — não um
    // por pixel. É isto que mantém a pilha pequena e o algoritmo linear.
    for (const ny of [py - 1, py + 1]) {
      if (ny < 0 || ny >= height) continue
      const nrow = ny * width
      let inSpan = false
      for (let i = left; i <= right; i++) {
        const hit = out[nrow + i] !== 255 && matches(nrow + i)
        if (hit && !inSpan) {
          push(i, ny)
          inSpan = true
        } else if (!hit) {
          inSpan = false
        }
      }
    }
  }
  return out
}

// ── Operações de conjunto ────────────────────────────────────────────────────
//
// São o que transforma a varinha de "um clique, uma tentativa" em ferramenta de
// verdade: Shift soma, Alt subtrai, e uma seleção difícil vira três cliques
// fáceis em vez de um impossível.

export type SelectionOp = 'replace' | 'add' | 'subtract' | 'intersect'

/** Aplica `patch` sobre `base` no lugar (muta `base` e o devolve). */
export function applySelectionOp(
  base: Uint8Array,
  patch: Uint8Array,
  op: SelectionOp,
): Uint8Array {
  const n = Math.min(base.length, patch.length)
  switch (op) {
    case 'replace':
      base.fill(0)
      for (let i = 0; i < n; i++) base[i] = patch[i]
      return base
    case 'add':
      for (let i = 0; i < n; i++) if (patch[i] > 127) base[i] = 255
      return base
    case 'subtract':
      for (let i = 0; i < n; i++) if (patch[i] > 127) base[i] = 0
      return base
    case 'intersect':
      for (let i = 0; i < n; i++) if (patch[i] <= 127) base[i] = 0
      return base
  }
}

/** Inverte a seleção. */
export function invertSelection(mask: Uint8Array): Uint8Array {
  for (let i = 0; i < mask.length; i++) mask[i] = mask[i] > 127 ? 0 : 255
  return mask
}

/** Acima disto uma seleção deixou de ser "esta superfície" e virou "a cena".
 *  Generoso de propósito: um céu de exterior pode passar de 40% legitimamente. */
/** Passo de redução do auto-ajuste e quantas vezes ele tenta. */
const AUTO_STEPS = 6
const AUTO_FACTOR = 0.65
/** Abaixo desta cobertura o auto-ajuste não encosta na seleção.
 *
 *  Calibrado contra a medição real, não escolhido: nas imagens do acervo as
 *  seleções LEGÍTIMAS ficam entre 10% e 31% (piso, parede, céu, laje) e os
 *  vazamentos entre 51% e 80%. Um piso em 25% cortava no meio da faixa boa — um
 *  céu de 25,3%, que é seleção correta, era encolhido sem precisar. Em 45% os
 *  dois grupos ficam de lados opostos com folga. */
const AUTO_MIN_COVERAGE = 0.45
/** Queda que denuncia o penhasco: baixar um degrau de tolerância derrubar a
 *  cobertura à METADE ou menos só acontece quando o preenchimento estava
 *  escapando por uma ponte estreita entre dois materiais. */
const AUTO_CLIFF_DROP = 0.5
/** Rede de segurança para o caso degenerado (selecionou tudo). */
const AUTO_HARD_CEILING = 0.85

/**
 * Seleção com tolerância AUTO-AJUSTADA — é o que roda no clique.
 *
 * A calibração contra imagens reais mostrou que cada imagem tem um PENHASCO: a
 * partir de certa tolerância o preenchimento acha caminho pelos degradês e
 * escapa para a cena inteira. O que ela NÃO mostrou — e só a tela mostrou — é
 * que a altura desse penhasco muda por imagem E por ponto clicado. Não existe
 * constante certa; existe "a maior tolerância que ainda não caiu do penhasco
 * NESTE clique".
 *
 * Procurar por COBERTURA ABSOLUTA não serve: 50% pode ser vazamento numa sala
 * e um céu legítimo num exterior. O que distingue os dois é a DERIVADA — se
 * baixar um degrau de tolerância derruba a cobertura à metade, a seleção estava
 * presa por uma ponte estreita e não por ser grande de verdade.
 *
 * O valor pedido é o TETO. Quando o usuário mexe no controle, o chamador usa
 * magicWandSelect direto: ali a intenção é explícita e a ferramenta não discorda.
 */
export function magicWandAuto(
  index: ColorIndex,
  seedX: number,
  seedY: number,
  opts: WandOptions,
): { mask: Uint8Array; tolerance: number } {
  let tolerance = Math.max(0, opts.tolerance)
  let mask = magicWandSelect(index, seedX, seedY, { ...opts, tolerance })
  let cov = selectionCoverage(mask)

  for (let i = 0; i < AUTO_STEPS && tolerance > 1; i++) {
    if (cov <= AUTO_MIN_COVERAGE) break
    const next = Math.max(1, Math.round(tolerance * AUTO_FACTOR))
    if (next === tolerance) break
    const nextMask = magicWandSelect(index, seedX, seedY, { ...opts, tolerance: next })
    const nextCov = selectionCoverage(nextMask)
    const caiuDoPenhasco = nextCov <= cov * AUTO_CLIFF_DROP
    if (!caiuDoPenhasco && cov <= AUTO_HARD_CEILING) break
    tolerance = next
    mask = nextMask
    cov = nextCov
  }
  return { mask, tolerance }
}

/** Fração selecionada (0–1) — alimenta o aviso de "seleção cobre a imagem toda". */
export function selectionCoverage(mask: Uint8Array): number {
  if (mask.length === 0) return 0
  let white = 0
  for (let i = 0; i < mask.length; i++) if (mask[i] > 127) white++
  return white / mask.length
}
