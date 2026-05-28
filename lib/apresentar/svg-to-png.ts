// ── SVG → PNG (client-side) ──────────────────────────────────────────────────
//
// Converte um <svg> renderizado no DOM em um Blob PNG. Para evitar canvas
// tainted (que bloqueia toBlob), pré-carregamos as imagens externas como
// data URLs e substituímos os href no SVG antes de serializar.
//
// Uso típico:
//   const blob = await svgElementToPngBlob(svgEl, 1080, 1350)
//   const url  = URL.createObjectURL(blob)
//   // ... download

/** Baixa uma imagem como blob e converte em data URL. Cacheado em memória. */
const dataUrlCache = new Map<string, string>()

async function fetchAsDataUrl(url: string): Promise<string> {
  const cached = dataUrlCache.get(url)
  if (cached) return cached
  const res  = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`Falha ao carregar imagem (${res.status})`)
  const blob = await res.blob()
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  dataUrlCache.set(url, dataUrl)
  return dataUrl
}

/** Pré-carrega todas as imagens externas referenciadas no SVG e substitui
 *  cada href por um data: URL. Operação não-destrutiva: trabalha sobre clone. */
async function inlineImagesInSvg(svgEl: SVGSVGElement): Promise<SVGSVGElement> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  // <image> elementos
  const images = Array.from(clone.querySelectorAll('image'))
  await Promise.all(images.map(async (img) => {
    const href = img.getAttribute('href') || img.getAttribute('xlink:href')
    if (!href || href.startsWith('data:')) return
    try {
      const dataUrl = await fetchAsDataUrl(href)
      img.setAttribute('href', dataUrl)
      img.removeAttribute('xlink:href')
    } catch (e) {
      console.warn('[svg-to-png] não foi possível inlinar imagem', href, e)
    }
  }))
  return clone
}

/** Converte um SVG do DOM para Blob PNG nas dimensões exatas pedidas. */
export async function svgElementToPngBlob(
  svgEl: SVGSVGElement,
  width:  number,
  height: number,
  scale: number = 1,
): Promise<Blob> {
  const inlined = await inlineImagesInSvg(svgEl)

  // garante atributos width/height explícitos
  inlined.setAttribute('width',  String(width))
  inlined.setAttribute('height', String(height))
  inlined.setAttribute('viewBox', `0 0 ${width} ${height}`)
  if (!inlined.getAttribute('xmlns')) {
    inlined.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  const xml  = new XMLSerializer().serializeToString(inlined)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url  = URL.createObjectURL(blob)

  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload  = () => resolve(i)
      i.onerror = (e) => reject(e instanceof Event ? new Error('img load failed') : e)
      i.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(width  * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D não disponível')

    // Background branco — evita transparência involuntária no PNG
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else  reject(new Error('canvas.toBlob retornou null'))
      }, 'image/png', 1)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Triggers download from a Blob with a given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 100)
}
