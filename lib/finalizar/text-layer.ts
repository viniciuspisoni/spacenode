// lib/finalizar/text-layer.ts
//
// Camada de TEXTO. Ela existe para o que o arquiteto faz no fim: assinar a
// prancha, nomear o ambiente, marcar "estudo preliminar" antes de mandar ao
// cliente.
//
// A decisão que faz isso valer a pena: o texto vive no documento como
// PARÂMETRO, não como imagem. O raster é recomputado quando a camada é
// desenhada — o mesmo padrão da varinha e da máscara de céu. Se fosse imagem,
// mudar uma vírgula obrigaria a apagar e refazer a camada, e "camada de texto"
// que não deixa reescrever o texto é só um PNG com passos a mais.
//
// O raster entra pelo caminho de elementos que já existe: transformação,
// opacidade, modo de mescla, máscara de pincel e exportação vêm de graça,
// sem uma linha nova no renderer.

/** Fontes: pilhas de sistema, nada baixado da rede. Uma camada de texto que
 *  depende de um webfont renderiza errado no primeiro frame e certo no
 *  segundo, e some no export se a fonte não carregou. */
export const TEXT_FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'sans', label: 'Sem serifa', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { id: 'serif', label: 'Serifada', stack: 'Georgia, "Times New Roman", Times, serif' },
  { id: 'mono', label: 'Monoespaçada', stack: '"SF Mono", "Cascadia Mono", Consolas, "Courier New", monospace' },
]

export type TextAlign = 'left' | 'center' | 'right'

export interface TextSpec {
  content: string
  /** id de TEXT_FONTS. */
  font: string
  /** 400 = normal, 700 = negrito. */
  weight: number
  /** Altura da caixa de texto em fração da ALTURA da imagem base — assim o
   *  corpo acompanha a imagem em vez de virar formiga num render 4K. */
  size: number
  color: string
  align: TextAlign
  /** Entrelinha como múltiplo do corpo. */
  lineHeight: number
  /** Espaçamento entre letras, em fração do corpo. Negativo aperta. */
  tracking: number
}

export function defaultTextSpec(): TextSpec {
  return {
    content: 'Texto',
    font: 'sans',
    weight: 400,
    size: 0.06,
    color: '#ffffff',
    align: 'left',
    lineHeight: 1.25,
    tracking: 0,
  }
}

function stackOf(fontId: string): string {
  return (TEXT_FONTS.find((f) => f.id === fontId) ?? TEXT_FONTS[0]).stack
}

/** Corpo em px do raster. Fixo e generoso: o elemento é escalado pela
 *  transformação, então o que importa aqui é ter resolução sobrando para não
 *  serrilhar quando a pessoa amplia a camada. */
const RASTER_FONT_PX = 128
/** Folga em volta, em múltiplos do corpo — cabe descida de letra, acento e o
 *  tracking negativo sem cortar. */
const PAD = 0.35

/**
 * Rasteriza o texto num canvas transparente e devolve um data URL PNG.
 *
 * Só roda no browser (usa canvas 2D). Devolve null se não houver o que
 * desenhar — texto vazio não deve virar uma camada invisível que ocupa espaço
 * na lista e confunde quem procura o elemento que sumiu.
 */
export function renderTextToDataUrl(spec: TextSpec): { url: string; width: number; height: number } | null {
  const linhas = spec.content.replace(/\r/g, '').split('\n')
  if (linhas.every((l) => l.trim() === '')) return null

  const probe = document.createElement('canvas')
  const pctx = probe.getContext('2d')
  if (!pctx) return null

  const font = `${spec.weight} ${RASTER_FONT_PX}px ${stackOf(spec.font)}`
  pctx.font = font
  const tracking = spec.tracking * RASTER_FONT_PX

  // Medir com tracking: o canvas não soma letterSpacing na medida em todos os
  // motores, então a largura é medida caractere a caractere quando há tracking.
  const larguraDaLinha = (linha: string): number => {
    if (Math.abs(tracking) < 0.01) return pctx.measureText(linha).width
    let w = 0
    for (const ch of linha) w += pctx.measureText(ch).width + tracking
    return Math.max(0, w - tracking)
  }

  const larguras = linhas.map(larguraDaLinha)
  const maxW = Math.max(1, ...larguras)
  const passo = RASTER_FONT_PX * spec.lineHeight
  const pad = RASTER_FONT_PX * PAD
  const W = Math.ceil(maxW + pad * 2)
  const H = Math.ceil(passo * linhas.length + pad * 2)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = font
  ctx.fillStyle = spec.color
  ctx.textBaseline = 'alphabetic'

  linhas.forEach((linha, i) => {
    const y = pad + passo * i + RASTER_FONT_PX * 0.82
    const w = larguras[i]
    const x = spec.align === 'left' ? pad
      : spec.align === 'center' ? pad + (maxW - w) / 2
      : pad + (maxW - w)
    if (Math.abs(tracking) < 0.01) {
      ctx.fillText(linha, x, y)
      return
    }
    let cx = x
    for (const ch of linha) {
      ctx.fillText(ch, cx, y)
      cx += ctx.measureText(ch).width + tracking
    }
  })

  return { url: canvas.toDataURL('image/png'), width: W, height: H }
}

/** Saneia um TextSpec vindo do documento salvo. null quando não é camada de texto. */
export function sanitizeTextSpec(raw: unknown): TextSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Partial<TextSpec>
  if (typeof t.content !== 'string') return null
  const n = (v: unknown, fb: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fb
  return {
    content: t.content.slice(0, 2000),
    font: TEXT_FONTS.some((f) => f.id === t.font) ? (t.font as string) : 'sans',
    weight: t.weight === 700 ? 700 : 400,
    size: n(t.size, 0.06, 0.005, 1),
    color: typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : '#ffffff',
    align: t.align === 'center' || t.align === 'right' ? t.align : 'left',
    lineHeight: n(t.lineHeight, 1.25, 0.7, 3),
    tracking: n(t.tracking, 0, -0.3, 1),
  }
}

/**
 * Reconstrói o raster das camadas de texto de um documento.
 *
 * Precisa rodar sempre que um documento chega de fora (carga de projeto, colar
 * tratamento, restaurar versão): o `url` das camadas de texto NÃO é salvo, e
 * sem esta passada elas existiriam na lista sem nada na tela. Devolve o mesmo
 * objeto quando não há texto a reconstruir, para não invalidar memo à toa.
 */
export function hydrateTextLayers<T extends { elements: { text: TextSpec | null; url: string }[] }>(doc: T): T {
  if (typeof document === 'undefined') return doc
  let mudou = false
  const elements = doc.elements.map((el) => {
    if (!el.text || el.url.startsWith('data:')) return el
    const r = renderTextToDataUrl(el.text)
    if (!r) return el
    mudou = true
    return { ...el, url: r.url }
  })
  return mudou ? { ...doc, elements } : doc
}
