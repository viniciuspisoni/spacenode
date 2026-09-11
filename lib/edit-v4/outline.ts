// lib/edit-v4/outline.ts
//
// Desenha o CONTORNO da seleção sobre a imagem que vai ao modelo.
//
// Por que isto existe. O Seedream localiza a edição por `<bbox>`, que é uma
// CAIXA. Para uma parede retangular a caixa é a própria forma e basta; para um
// sofá em diagonal, uma luminária pendente ou um trecho de piso entre móveis, a
// caixa envolvente cobre metade da cena e o modelo não tem como adivinhar o que
// dentro dela é alvo. O contorno desenhado — recurso oficial do Seedream Pro,
// "marcações desenhadas" — entrega a forma exata.
//
// O contorno é ANOTAÇÃO, não conteúdo: o prompt tem uma cláusula própria
// mandando não renderizá-lo (ver OUTLINE_CLAUSE em prompt.ts). Se ainda assim
// vazar como traço no resultado, `EDIT_V4_OUTLINE=0` desliga tudo isto e o motor
// volta a se guiar só pela caixa.

import { dilate, erode } from '@/lib/edit-v2/mask-morphology'

/** Magenta puro: cor que não existe em render arquitetônico (nem em madeira,
 *  concreto, vegetação ou céu), então o modelo não a confunde com material da
 *  cena e nós conseguimos detectar vazamento no resultado. */
export const OUTLINE_RGB = { r: 255, g: 0, b: 255 } as const

/** Espessura do traço em fração do menor lado, com piso de 1 px. Fino de
 *  propósito: o traço come pixels da borda da seleção, que é justamente onde a
 *  precisão importa. */
const STROKE_RATIO = 0.003
const MAX_STROKE_PX = 6

export function strokeRadius(width: number, height: number): number {
  const r = Math.round(Math.min(width, height) * STROKE_RATIO)
  return Math.max(1, Math.min(MAX_STROKE_PX, r))
}

/**
 * Devolve a imagem com o contorno da máscara desenhado por cima.
 *
 * `imageBuffer` e `maskBuffer` precisam ter as MESMAS dimensões (no pipeline os
 * dois são o crop). Devolve PNG. Se a máscara não tiver borda (vazia ou
 * cobrindo tudo), devolve a imagem original intocada — desenhar nada é melhor
 * que desenhar uma moldura na imagem inteira.
 */
export async function drawSelectionOutline(
  imageBuffer: Buffer,
  maskBuffer: Buffer,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const meta = await sharp(imageBuffer).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width <= 0 || height <= 0) return imageBuffer

  const mask = await sharp(maskBuffer)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer()
  const m = new Uint8Array(mask.buffer, mask.byteOffset, width * height)

  // Anel de borda = dilatada − erodida. Centrado na borda real, então metade do
  // traço cai fora da seleção e metade dentro — nenhum dos lados perde mais que
  // a metade da espessura.
  const r = strokeRadius(width, height)
  const outer = dilate(m, width, height, r)
  const inner = erode(m, width, height, r)

  const rgba = Buffer.alloc(width * height * 4)
  let ringPixels = 0
  for (let i = 0; i < width * height; i++) {
    const onRing = outer[i] > 127 && inner[i] <= 127
    if (!onRing) continue
    ringPixels++
    const o = i * 4
    rgba[o] = OUTLINE_RGB.r
    rgba[o + 1] = OUTLINE_RGB.g
    rgba[o + 2] = OUTLINE_RGB.b
    rgba[o + 3] = 255
  }
  if (ringPixels === 0) return imageBuffer

  const overlay = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()
  return sharp(imageBuffer)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer()
}

/**
 * Fração de pixels do resultado que ficaram com cara de magenta do contorno.
 *
 * É o detector de vazamento: se o modelo desenhou a linha no lugar de entender
 * a anotação, isto acusa. Roda numa amostra reduzida (o número é uma proporção,
 * não precisa de resolução cheia) e alimenta o gate do pipeline.
 */
export async function outlineLeakRatio(resultBuffer: Buffer): Promise<number> {
  const sharp = (await import('sharp')).default
  const SIZE = 512
  const { data, info } = await sharp(resultBuffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const total = info.width * info.height
  if (total === 0) return 0
  let hits = 0
  for (let i = 0; i + 2 < data.length; i += 3) {
    const rr = data[i]
    const gg = data[i + 1]
    const bb = data[i + 2]
    // Magenta saturado: vermelho e azul altos, verde muito abaixo dos dois.
    if (rr > 170 && bb > 170 && gg < 90 && Math.abs(rr - bb) < 70) hits++
  }
  return hits / total
}
