// lib/upscale/normalize-source.ts
//
// Prepara a imagem de origem antes de ela ir para o provider.
//
// Trata UMA coisa: **orientação EXIF**. Foto de celular vem com os pixels
// deitados mais uma tag dizendo "gire ao exibir". Quem respeita a tag é o
// visualizador — e a saída do módulo é PNG, formato que não tem tag de
// orientação. Resultado sem o tratamento: a imagem volta deitada, com a
// proporção trocada. "Preserva proporções" é contrato do módulo, então a
// rotação é aplicada aqui e a tag some junto (sharp.rotate() faz as duas
// coisas, o que também descarta o risco de rotação dupla se o provider
// resolver honrar a tag por conta própria).
//
// NÃO trata perfil de cor, e isso foi uma decisão medida, não um esquecimento.
// A primeira versão convertia perfis fora de sRGB "para não perder cor". Dois
// fatos derrubaram a ideia (18/09/2026, ver MEDICOES.md §7):
//
//   1. A detecção não funcionava. `sharp.metadata().space` descreve o layout
//      de canais (srgb/cmyk/b-w), NÃO o espaço do perfil embutido: uma imagem
//      Display P3 reporta `space: 'srgb'` do mesmo jeito. A condição
//      `meta.space !== 'srgb'` nunca era verdadeira para RGB — o ramo inteiro
//      era código morto.
//   2. Se ele tivesse funcionado, teria PIORADO. Medido pelo pipeline real: um
//      PNG marcado como Display P3 volta do Topaz com o MESMO perfil (480
//      bytes, mesma descrição). O provider preserva o ICC ponta a ponta, então
//      números e perfil viajam juntos e a cor já chega certa. Converter para
//      sRGB na entrada só recortaria o gamut de uma origem wide-gamut de
//      graça.
//
// Ou seja: para cor, o certo é não fazer nada. Se um dia o provider passar a
// descartar o ICC, é aqui que a conversão volta — e aí com detecção de
// verdade (tabela de tags do ICC), não via `meta.space`.
//
// SERVER-ONLY: usa sharp. Importar direto da rota, NUNCA via lib/upscale/index
// (que é importado pelo componente cliente).

import sharp from 'sharp'

export type NormalizeNote = null | 'orientation'

export interface NormalizedSource {
  buffer: Buffer
  mime:   string
  width:  number | null
  height: number | null
  /** O que foi corrigido; null = a origem já estava correta e passou intacta. */
  note:   NormalizeNote
}

export async function normalizeSource(buffer: Buffer, mime: string): Promise<NormalizedSource> {
  const meta = await sharp(buffer).metadata()

  // orientation 1 (ou ausente) = já está de pé. 2..8 pedem transformação.
  const needsRotate = typeof meta.orientation === 'number' && meta.orientation > 1

  if (!needsRotate) {
    return { buffer, mime, width: meta.width ?? null, height: meta.height ?? null, note: null }
  }

  // PNG na saída: re-encodar um JPEG em JPEG só para girar custaria uma
  // recompressão em cima da imagem que o usuário veio justamente melhorar.
  const out     = await sharp(buffer).rotate().png().toBuffer()
  const outMeta = await sharp(out).metadata()

  console.log('[upscale] origem normalizada: orientation')
  return { buffer: out, mime: 'image/png', width: outMeta.width ?? null, height: outMeta.height ?? null, note: 'orientation' }
}
