// ── Planta Humanizada · rótulos dos ambientes ────────────────────────────────
//
// Estágio 4 do harness: os nomes dos ambientes deixaram de ser pedidos ao
// modelo de imagem e passaram a ser desenhados pela aplicação, em vetor, nas
// posições que o leitor de visão devolveu (lib/apresentar/plan-reader).
//
// A troca não é cosmética. Tipografia era a ÚNICA capacidade em que o motor
// caro (nano-banana-pro, US$0,134–0,150/imagem) batia o barato (Seedream na
// faixa barata, US$0,045) — e é justamente a que não precisa ser comprada.
// Desenhando aqui:
//   - a grafia está sempre certa (nunca mais "Cozlnha" no material do cliente);
//   - a fonte é a da marca, não a que o modelo inventou naquela amostra;
//   - o rótulo liga e desliga sem gerar de novo, e custa zero;
//   - o motor passa a ser escolhido por FIDELIDADE, que é o que importa aqui.
//
// CLIENT-SAFE: só matemática de layout. Quem rasteriza é o cliente, via
// lib/apresentar/svg-to-png (mesmo caminho do Moodboard e da Prancha) — SVG no
// servidor exigiria a fonte instalada no runtime, e a Geist mora em
// public/fonts, que o rasterizador do sharp não enxerga.

import type { PlanRoom } from './config'

export interface LabelLayout {
  name: string
  /** O nome quebrado em 1 ou 2 linhas — "Área de Serviço" vira ["Área de",
   *  "Serviço"] quando o ambiente é estreito. É o que prancha de escritório
   *  faz, e é a diferença entre rotular ~60% e ~95% dos ambientes. */
  lines: string[]
  /** Centro do rótulo, em px da imagem gerada. */
  x: number
  y: number
  fontSize: number
  /** Distância entre linhas, em px. */
  lineHeight: number
}

/** Fonte base como fração da largura da imagem. */
const BASE_RATIO = 0.0165
/** Abaixo disto o rótulo fica ilegível — melhor não desenhar. */
const MIN_RATIO = 0.0085
/** Largura média do glifo em `em`, na Geist em caixa alta com tracking. */
const CHAR_WIDTH_EM = 0.66
/** Fração da largura do ambiente que o rótulo pode ocupar. */
const ROOM_FILL = 0.82
/** Fração da altura do ambiente que o rótulo pode ocupar. */
const ROOM_HEIGHT_FILL = 0.42
/** Entrelinha, em `em`. */
const LINE_HEIGHT_EM = 1.18

/** Quebra o nome no ponto que deixa as duas linhas mais parecidas — "Área de
 *  Serviço" vira ["Área de", "Serviço"], não ["Área", "de Serviço"]. Nome de
 *  uma palavra só não quebra (hifenizar nome de ambiente fica feio). */
function splitName(name: string): string[][] {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length < 2) return [[name]]

  let best: string[] | null = null
  let bestDelta = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const delta = Math.abs(a.length - b.length)
    if (delta < bestDelta) { best = [a, b]; bestDelta = delta }
  }
  return best ? [[name], best] : [[name]]
}

/**
 * Posiciona e dimensiona os rótulos sobre a imagem gerada.
 *
 * Ambiente pequeno demais para caber o nome legível sai da lista: banheiro de
 * 1,2 m com "Banheiro" atravessado por cima é pior que banheiro sem nome.
 */
export function layoutLabels(
  rooms: PlanRoom[],
  imageWidth: number,
  imageHeight: number,
): LabelLayout[] {
  if (!imageWidth || !imageHeight) return []

  const base  = imageWidth * BASE_RATIO
  const floor = imageWidth * MIN_RATIO

  return rooms.reduce<LabelLayout[]>((acc, room) => {
    const name = room.name.trim()
    if (!name) return acc

    const roomW = room.w * imageWidth
    const roomH = room.h * imageHeight

    // Testa uma linha e, se não couber bem, duas. Fica com a que rende a
    // MAIOR fonte — duas linhas ganham largura mas gastam altura, então nem
    // sempre a quebra ajuda (ambiente baixo e largo, por exemplo).
    let chosen: { lines: string[]; fontSize: number } | null = null
    for (const lines of splitName(name)) {
      const longest = Math.max(...lines.map(l => l.length))
      const byWidth  = (roomW * ROOM_FILL) / (longest * CHAR_WIDTH_EM)
      const byHeight = (roomH * ROOM_HEIGHT_FILL) / (lines.length === 1 ? 1 : lines.length * LINE_HEIGHT_EM)
      const fontSize = Math.min(base, byWidth, byHeight)
      if (!chosen || fontSize > chosen.fontSize) chosen = { lines, fontSize }
    }

    if (!chosen || chosen.fontSize < floor) return acc

    const fontSize = Math.round(chosen.fontSize * 10) / 10
    acc.push({
      name,
      lines:      chosen.lines,
      x:          room.cx * imageWidth,
      y:          room.cy * imageHeight,
      fontSize,
      lineHeight: Math.round(fontSize * LINE_HEIGHT_EM * 10) / 10,
    })
    return acc
  }, [])
}

/** Fonte embutida no PNG do download (ver svgElementToPngBlob). O SVG
 *  rasterizado é um documento isolado e não enxerga as fontes da página: sem
 *  isto o arquivo entregue ao cliente sai numa tipografia diferente da que ele
 *  viu na tela. A família tem que se chamar 'Geist' para casar com o fallback
 *  de `labelTextStyle`. */
export const LABEL_FONT_FACES = [{ family: 'Geist', url: '/fonts/geist-latin.woff2' }]

/** Estilo do texto. Halo branco em vez de plaquinha: é como planta humanizada
 *  de escritório resolve legibilidade sobre piso de madeira ou tapete, e não
 *  cria um retângulo competindo com o desenho. */
export function labelTextStyle(fontSize: number): Record<string, string | number> {
  return {
    // Duas armadilhas resolvidas nesta linha, as duas conferidas no navegador:
    //
    // 1. Sem nome de família ENTRE ASPAS. Este estilo é serializado pra dentro
    //    de um atributo quando o download assa o SVG em PNG, e aspas aninhadas
    //    truncaram o atributo inteiro — o texto saía sem contorno e sumia no
    //    piso escuro.
    // 2. `var(--font-geist)` PRECISA do fallback embutido. Na rasterização o
    //    SVG vira documento isolado e a variável não existe; sem o fallback a
    //    declaração fica inválida em tempo de cômputo e o CSS descarta a lista
    //    INTEIRA (não segue pro próximo nome), então nem a Geist embutida por
    //    @font-face seria usada.
    fontFamily:    'var(--font-geist, Geist), Geist, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize,
    fontWeight:    500,
    letterSpacing: fontSize * 0.08,
    fill:          '#1F2124',
    stroke:        'rgba(255,255,255,0.88)',
    // 0,2 em. A 0,3 o contorno engolia a letra nos rótulos pequenos (conferido
    // no preview): vira uma mancha branca com um vinco escuro no meio.
    strokeWidth:   fontSize * 0.2,
    strokeLinejoin: 'round',
    // Sem isto o contorno é desenhado POR CIMA do preenchimento e o texto some
    // dentro do próprio halo.
    paintOrder:    'stroke',
  }
}
