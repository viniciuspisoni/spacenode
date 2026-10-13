// lib/ai/fidelity/ink-score.ts
//
// Validação estrutural para DESENHO DE TRAÇO (planta baixa, corte, elevação).
// Existe porque `computeGeometryScore` foi MEDIDO e reprovado nesta classe de
// entrada (bench do Ampliar, 2026-09-19): numa planta de traço de 1 px, a
// análise a 384 px faz o edge recall oscilar ±7% entre fixtures e INVERTER o
// vencedor. Uma parede de 1 px simplesmente não sobrevive ao downsample — o
// gate da Planta Humanizada estava, na prática, sorteando retry (e dobrando o
// custo do provedor) sobre ruído.
//
// SERVER-ONLY: usa sharp. Importar SOMENTE de rotas/API ou módulos server.
//
// Método — por que não é só "pixel escuro":
//   O original é line art (traço preto sobre branco), mas a SAÍDA é humanizada:
//   piso de madeira escura, tapete, sombra. Limiar absoluto de cinza marcaria
//   o piso inteiro como "tinta" e o recall passaria trivialmente.
//   Então medimos ESTRUTURA FINA E ESCURA, não escuridão:
//
//   1. Cinza, SEM blur (blur a 1 px é exatamente o que apaga o traço), nas duas
//      imagens, no mesmo tamanho de análise (lado maior 1024).
//   2. Black-hat morfológico: `closing(g) − g`. O fechamento com elemento maior
//      que a espessura do traço remove as linhas escuras finas; a diferença
//      acende justamente onde havia linha — e é CEGO ao nível global, então
//      parede preta sobre piso bege e parede preta sobre piso marrom dão a
//      mesma resposta.
//   3. Máscara de linha = black-hat acima do limiar, nas duas imagens.
//   4. lineRecall  = fração das linhas do ORIGINAL presentes na saída (±2 px).
//      Adição (mobiliário, vegetação) NÃO penaliza — só remoção e deslocamento.
//   5. worstRegionRecall = o mesmo recall medido CÉLULA A CÉLULA numa grade, e
//      resumido pelo pior decil. É ele que decide, e a razão é aritmética: uma
//      divisória deslocada é pouca tinta no total (o recall global só cai de
//      1,00 pra 0,82 — medido nas fixtures), mas é TODA a tinta das células
//      onde ela estava, que vão a zero. Sem o componente espacial, "mesma
//      planta" e "planta diferente" ficam a 0,08 de distância; com ele, a
//      distância passa de 0,5.
//
// score = 0.45*lineRecall + 0.55*worstRegionRecall − penalidade de aspecto

import sharp from 'sharp'

export interface InkScoreBreakdown {
  /** Score combinado 0..1 (maior = estrutura de traço mais preservada). */
  score: number
  /** Fração das linhas do original presentes na saída (±2 px). */
  lineRecall: number
  /** Recall médio do pior decil de células da grade — pega remoção e
   *  deslocamento LOCAL, que o recall global dilui. */
  worstRegionRecall: number
  /** Fração da área de análise que é linha no original — sanidade da entrada. */
  originalInkRatio: number
  /** |aspecto_gerado − aspecto_original| / aspecto_original. */
  aspectDelta: number
  analysisWidth: number
  analysisHeight: number
}

const ANALYSIS_LONG_SIDE = 1024
const MIN_SIDE = 64
/** Raio do elemento estruturante: fecha traço de até 2r+1 px na análise. */
const MORPH_RADIUS = 3
/** Resposta mínima de black-hat (0..255) pra contar como linha. */
const INK_THRESHOLD = 16
/** Abaixo disto a imagem não tem traço suficiente pra pontuar. */
const MIN_INK_RATIO = 0.0015
/** Tolerância de alinhamento, em px da análise. O modelo não devolve a planta
 *  pixel-perfeita: 2 px a 1024 absorve o drift normal sem absolver parede
 *  movida (que anda dezenas de px). */
const ALIGN_TOLERANCE = 2
/** Grade do recall local. 16×16 numa análise de 1024 dá célula de ~64 px —
 *  fina o suficiente pra isolar uma divisória, grossa o suficiente pra não
 *  virar ruído. */
const GRID = 16
/** Tinta mínima na célula pra ela entrar na conta (interior de cômodo vazio
 *  não tem o que preservar). */
const MIN_CELL_INK = 20
/** Fração das piores células que resume o recall local. */
const WORST_FRACTION = 0.1

// ── Pixels ───────────────────────────────────────────────────────────────────

async function grayResize(buf: Buffer, width: number, height: number): Promise<Float32Array> {
  // Sem blur, de propósito: é o traço de 1 px que estamos medindo.
  // fit 'fill' força a saída ao tamanho do original; distorção de aspecto é
  // medida à parte (aspectDelta).
  const raw = await sharp(buf)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .greyscale()
    .raw()
    .toBuffer()
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = raw[i]
  return out
}

/** Max (dilatação) ou min (erosão) separável, janela 2r+1. */
function morphPass(src: Float32Array, w: number, h: number, r: number, mode: 'max' | 'min'): Float32Array {
  const pick = mode === 'max' ? Math.max : Math.min
  const tmp = new Float32Array(w * h)
  // Horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let acc = src[row + x]
      const from = Math.max(0, x - r), to = Math.min(w - 1, x + r)
      for (let k = from; k <= to; k++) acc = pick(acc, src[row + k])
      tmp[row + x] = acc
    }
  }
  // Vertical
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const from = Math.max(0, y - r), to = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      let acc = tmp[y * w + x]
      for (let k = from; k <= to; k++) acc = pick(acc, tmp[k * w + x])
      out[y * w + x] = acc
    }
  }
  return out
}

/** Black-hat: `closing(g) − g`. Acende em estrutura ESCURA e FINA, qualquer
 *  que seja o nível de fundo. */
function blackHat(gray: Float32Array, w: number, h: number, r: number): Float32Array {
  const dilated = morphPass(gray, w, h, r, 'max')
  const closed  = morphPass(dilated, w, h, r, 'min')
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, closed[i] - gray[i])
  return out
}

/** Dilatação binária separável de raio r — é a tolerância de alinhamento. */
function dilateMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const from = Math.max(0, x - r), to = Math.min(w - 1, x + r)
      let hit = 0
      for (let k = from; k <= to; k++) if (mask[row + k]) { hit = 1; break }
      tmp[row + x] = hit
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const from = Math.max(0, y - r), to = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      let hit = 0
      for (let k = from; k <= to; k++) if (tmp[k * w + x]) { hit = 1; break }
      out[y * w + x] = hit
    }
  }
  return out
}

function threshold(field: Float32Array, t: number): Uint8Array {
  const out = new Uint8Array(field.length)
  for (let i = 0; i < field.length; i++) out[i] = field[i] >= t ? 1 : 0
  return out
}

function recallOf(target: Uint8Array, presence: Uint8Array): number {
  let total = 0, hit = 0
  for (let i = 0; i < target.length; i++) {
    if (!target[i]) continue
    total++
    if (presence[i]) hit++
  }
  return total === 0 ? 0 : hit / total
}

/** Recall por célula da grade, resumido pelo pior decil. Ignora células sem
 *  tinta suficiente no original. `null` quando nenhuma célula qualifica. */
function worstRegionRecallOf(
  target: Uint8Array, presence: Uint8Array, w: number, h: number,
): number | null {
  const cells: number[] = []
  const cw = Math.ceil(w / GRID), ch = Math.ceil(h / GRID)

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = gx * cw, x1 = Math.min(w, x0 + cw)
      const y0 = gy * ch, y1 = Math.min(h, y0 + ch)
      let total = 0, hit = 0
      for (let y = y0; y < y1; y++) {
        const row = y * w
        for (let x = x0; x < x1; x++) {
          if (!target[row + x]) continue
          total++
          if (presence[row + x]) hit++
        }
      }
      if (total >= MIN_CELL_INK) cells.push(hit / total)
    }
  }
  if (cells.length === 0) return null

  cells.sort((a, b) => a - b)
  const take = Math.max(1, Math.round(cells.length * WORST_FRACTION))
  let sum = 0
  for (let i = 0; i < take; i++) sum += cells[i]
  return sum / take
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Compara o desenho ORIGINAL (autoridade de geometria) com a saída humanizada.
 * Devolve `null` quando o original não tem traço suficiente para pontuar —
 * foto, render ou imagem em branco entram aqui e NÃO podem virar score falso.
 */
export async function computeInkScore(
  originalBuffer: Buffer,
  generatedBuffer: Buffer,
): Promise<InkScoreBreakdown | null> {
  const meta = await sharp(originalBuffer).metadata()
  const ow = meta.width ?? 0, oh = meta.height ?? 0
  if (!ow || !oh) return null

  const scale = ANALYSIS_LONG_SIDE / Math.max(ow, oh)
  const w = Math.max(MIN_SIDE, Math.round(ow * scale))
  const h = Math.max(MIN_SIDE, Math.round(oh * scale))

  const [origGray, genGray] = await Promise.all([
    grayResize(originalBuffer, w, h),
    grayResize(generatedBuffer, w, h),
  ])

  const origInk = blackHat(origGray, w, h, MORPH_RADIUS)
  const genInk  = blackHat(genGray,  w, h, MORPH_RADIUS)

  const origMask = threshold(origInk, INK_THRESHOLD)
  let inkCount = 0
  for (let i = 0; i < origMask.length; i++) inkCount += origMask[i]
  const originalInkRatio = inkCount / origMask.length
  // Sem traço no original não há o que preservar — quem chama mantém a imagem.
  if (originalInkRatio < MIN_INK_RATIO) return null

  // Mesmo limiar absoluto nas duas: é o que torna as máscaras comparáveis.
  const genPresence = dilateMask(threshold(genInk, INK_THRESHOLD), w, h, ALIGN_TOLERANCE)

  const lineRecall = recallOf(origMask, genPresence)
  // Sem célula qualificada, o local não tem o que dizer — cai no global em vez
  // de inventar um zero que reprovaria a imagem.
  const worstRegionRecall = worstRegionRecallOf(origMask, genPresence, w, h) ?? lineRecall

  const genMeta = await sharp(generatedBuffer).metadata()
  const gw = genMeta.width ?? ow, gh = genMeta.height ?? oh
  const origAspect = ow / oh
  const aspectDelta = Math.abs(gw / gh - origAspect) / origAspect
  // 10% de drift de aspecto já é reenquadramento — custa 0,15 do score.
  const aspectPenalty = Math.min(0.15, aspectDelta * 1.5)

  const score = Math.max(0, Math.min(1,
    0.45 * lineRecall + 0.55 * worstRegionRecall - aspectPenalty,
  ))

  return {
    score:             round4(score),
    lineRecall:        round4(lineRecall),
    worstRegionRecall: round4(worstRegionRecall),
    originalInkRatio:  round4(originalInkRatio),
    aspectDelta:       round4(aspectDelta),
    analysisWidth:     w,
    analysisHeight:    h,
  }
}
