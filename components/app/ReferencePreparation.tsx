'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Sheet } from './glass'
import { FULL_REFERENCE, cropExportAllowed, normalizeReferenceCrop, referenceCropPixels, smallReference, type ImageSize, type ReferenceCrop } from '@/lib/onboarding/first-image'
import styles from './FirstImage.module.css'

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'
export default function ReferencePreparation({ file, previewUrl, size, onClose, onApply }: {
  file: File; previewUrl: string; size: ImageSize; onClose: () => void; onApply: (file: File) => void
}) {
  const [crop, setCrop] = useState<ReferenceCrop>(FULL_REFERENCE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const alive = useRef(true)
  const drag = useRef<{ handle: Handle; x: number; y: number; width: number; height: number; crop: ReferenceCrop } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const pixels = referenceCropPixels(crop, size)
  const changed = crop.left > 0 || crop.top > 0 || crop.right < 1 || crop.bottom < 1
  function move(handle: Handle, from: ReferenceCrop, dx: number, dy: number): ReferenceCrop {
    if (handle === 'move') {
      const x = Math.max(-from.left, Math.min(1 - from.right, dx))
      const y = Math.max(-from.top, Math.min(1 - from.bottom, dy))
      return { left: from.left + x, right: from.right + x, top: from.top + y, bottom: from.bottom + y }
    }
    const minW = Math.min(1, 64 / size.width), minH = Math.min(1, 64 / size.height)
    return normalizeReferenceCrop({
      left: handle.includes('w') ? Math.min(from.right - minW, from.left + dx) : from.left,
      right: handle.includes('e') ? from.right + dx : from.right,
      top: handle.includes('n') ? Math.min(from.bottom - minH, from.top + dy) : from.top,
      bottom: handle.includes('s') ? from.bottom + dy : from.bottom,
    }, size)
  }
  function start(e: PointerEvent<HTMLElement>, handle: Handle) {
    if (busy || e.button !== 0) return
    const bounds = stage.current?.getBoundingClientRect()
    if (!bounds) return
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { handle, x: e.clientX, y: e.clientY, width: bounds.width, height: bounds.height, crop }
  }
  function pointerMove(e: PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d) return
    setCrop(move(d.handle, d.crop, (e.clientX - d.x) / d.width, (e.clientY - d.y) / d.height))
  }
  function keyboard(e: KeyboardEvent, handle: Handle) {
    if (busy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault(); e.stopPropagation()
    const step = e.shiftKey ? .05 : .01
    setCrop(prev => move(handle, prev, e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0))
  }
  async function apply() {
    if (busy || !changed) return
    setBusy(true); setError('')
    try {
      if (!cropExportAllowed(pixels)) throw new Error('Este recorte é muito grande para preparar aqui. Exporte uma vista menor no seu programa e envie novamente.')
      const canvas = document.createElement('canvas')
      canvas.width = pixels.width; canvas.height = pixels.height
      const ctx = canvas.getContext('2d')
      if (!ctx || !image.current?.complete || !image.current.naturalWidth) throw new Error('A imagem ainda não carregou. Tente novamente.')
      ctx.drawImage(image.current, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, pixels.width, pixels.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob?.size) throw new Error('Não foi possível preparar o recorte. Sua referência anterior foi mantida.')
      if (blob.size > 15 * 1024 * 1024) throw new Error('O recorte ficou maior que 15 MB. Faça um recorte menor ou envie uma imagem mais leve.')
      if (alive.current) onApply(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-recorte.png`, { type: 'image/png' }))
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : 'Não foi possível preparar. Sua referência anterior foi mantida.')
    } finally { if (alive.current) setBusy(false) }
  }
  return <Sheet open title="Preparar a referência" onClose={onClose} doneLabel="Manter imagem">
    <div className={styles.body}>
      <p>Deixe o projeto em destaque. Recorte menus, barras e bordas do print, sem cortar partes importantes do espaço.</p>
      <p className={styles.caption}>Arraste os cantos para recortar e o centro para mover. No teclado, use as setas; Shift ajusta mais rápido.</p>
      <div ref={stage} className={styles.cropStage} style={{ width: `min(100%, ${Math.round(380 * size.width / size.height)}px)`, aspectRatio: `${size.width} / ${size.height}` }}>
        {/* The local source is drawn at native resolution only after explicit confirmation. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={image} src={previewUrl} alt="Referência para recortar" draggable={false} />
        <div className={styles.cropArea} role="group" aria-label="Área do recorte" tabIndex={0}
          style={{ left: `${crop.left * 100}%`, top: `${crop.top * 100}%`, width: `${(crop.right - crop.left) * 100}%`, height: `${(crop.bottom - crop.top) * 100}%` }}
          onPointerDown={e => start(e, 'move')} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }} onKeyDown={e => keyboard(e, 'move')}>
          {(['nw', 'ne', 'sw', 'se'] as const).map((handle, i) => <button key={handle} type="button" disabled={busy} aria-label={['Canto superior esquerdo', 'Canto superior direito', 'Canto inferior esquerdo', 'Canto inferior direito'][i]}
            style={{ [handle.includes('n') ? 'top' : 'bottom']: 0, [handle.includes('w') ? 'left' : 'right']: 0, cursor: handle === 'ne' || handle === 'sw' ? 'nesw-resize' : 'nwse-resize' }}
            onPointerDown={e => start(e, handle)} onKeyDown={e => keyboard(e, handle)}>{['↘', '↙', '↗', '↖'][i]}</button>)}
        </div>
      </div>
      <p aria-live="polite">Original: {size.width} × {size.height} px · Recorte: {pixels.width} × {pixels.height} px</p>
      {smallReference(pixels) && <div className={styles.warning}>Esta referência tem poucos pixels. Se puder, exporte uma vista maior do projeto. Você pode continuar com esta imagem; ampliar depois não recupera os detalhes.</div>}
      <details><summary>Ajustar recorte pelos controles</summary><div className={styles.precise}>
        {(['left', 'top', 'right', 'bottom'] as const).map((edge, i) => {
          const reverse = edge === 'right' || edge === 'bottom'
          const value = Math.round((reverse ? 1 - crop[edge] : crop[edge]) * 100)
          return <label key={edge}>{['Retirar à esquerda', 'Retirar acima', 'Retirar à direita', 'Retirar abaixo'][i]}: {value}%<input type="range" min={0} max={99} step={1} value={value} disabled={busy} onChange={e => setCrop(prev => normalizeReferenceCrop({ ...prev, [edge]: reverse ? 1 - Number(e.target.value) / 100 : Number(e.target.value) / 100 }, size))} /></label>
        })}
      </div></details>
      <div className={styles.actions}><button type="button" className="spn-pill" disabled={busy || !changed} onClick={() => setCrop(FULL_REFERENCE)}>Mostrar imagem inteira</button></div>
      <details className={styles.examples}><summary>Ver um exemplo de enquadramento</summary><div className={styles.exampleGrid}>
        <figure><div className={styles.examplePrint}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo-sketch.jpg" alt="Exemplo ilustrativo com bordas de um print" />
        </div><figcaption>Print com bordas ao redor do projeto.</figcaption></figure>
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo-sketch.jpg" alt="O mesmo exemplo com o projeto em destaque" /><figcaption>Projeto em destaque, sem recortar o espaço.</figcaption></figure>
      </div><p>Exemplo ilustrativo. Confira também o ângulo e as proporções da sua própria referência.</p></details>
      <p className={styles.caption}>O recorte é preparado neste navegador, sem gerar uma imagem nem usar Nodes. Você pode desfazê-lo nesta sessão.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="spn-cta" disabled={busy || !changed} onClick={apply}>{busy ? 'Preparando recorte…' : 'Usar este recorte'}</button>
    </div>
  </Sheet>
}
