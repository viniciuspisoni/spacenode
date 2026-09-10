'use client'

// Reference focus (V1.1): o usuário arrasta um retângulo sobre a imagem de
// referência pra marcar SÓ o elemento relevante (ex.: a planta). Retorna o
// recorte normalizado (0–1) ou null (usar imagem inteira).

import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/components/app/glass'

interface Box { x: number; y: number; w: number; h: number } // px de exibição

export interface NormCrop { left: number; top: number; width: number; height: number }

export function ReferenceFocusModal({ imageUrl, onConfirm, onClose }: {
  imageUrl:  string
  onConfirm: (crop: NormCrop | null) => void
  onClose:   () => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const [disp, setDisp] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox]   = useState<Box | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // A folha tem 560px no desktop e o corpo dela come 32px de padding:
      // 470 é o maior palco que cabe sem a imagem sangrar pra fora.
      const maxW = 470, maxH = 380
      const r = img.naturalWidth / img.naturalHeight
      let w = maxW, h = Math.round(w / r)
      if (h > maxH) { h = maxH; w = Math.round(h * r) }
      setDisp({ w, h })
      setBox({ x: w * 0.3, y: h * 0.3, w: w * 0.4, h: h * 0.4 }) // padrão centralizado
    }
    img.onerror = () => setDisp({ w: 440, h: 330 })
    img.src = imageUrl
  }, [imageUrl])

  function pointAt(e: React.PointerEvent): { x: number; y: number } {
    const r = wrapRef.current!.getBoundingClientRect()
    const d = disp!
    return {
      x: Math.max(0, Math.min(d.w, e.clientX - r.left)),
      y: Math.max(0, Math.min(d.h, e.clientY - r.top)),
    }
  }
  function onDown(e: React.PointerEvent) {
    if (!disp) return
    const p = pointAt(e)
    dragRef.current = p
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (!dragRef.current || !disp) return
    const p = pointAt(e), s = dragRef.current
    setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  function onUp() { dragRef.current = null }

  function useArea() {
    if (!disp || !box || box.w < 8 || box.h < 8) { onConfirm(null); return }
    setBusy(true)
    onConfirm({ left: box.x / disp.w, top: box.y / disp.h, width: box.w / disp.w, height: box.h / disp.h })
  }
  function useWhole() { setBusy(true); onConfirm(null) }

  return (
    <Sheet open title="Focar a referência" onClose={onClose} doneLabel="Cancelar">
      <p className="spn-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Arraste para marcar só o elemento desejado (ex.: a planta). O modelo recebe
        apenas essa área — não a vista inteira.
      </p>

      {disp ? (
        // Sem vidro nenhum neste palco: o retângulo é redesenhado a cada
        // pointermove, e um borrão por cima faria o navegador recompor a
        // camada inteira a cada quadro do arrasto.
        <div
          ref={wrapRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          style={{
            position: 'relative', width: disp.w, height: disp.h, margin: '0 auto',
            cursor: 'crosshair', touchAction: 'none', userSelect: 'none',
            borderRadius: 'var(--r-inner)', overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="referência" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />
          {box && box.w > 0 && (
            <div style={{
              position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
              // Verde aqui é ESTADO (o que está selecionado), não ação — é o
              // único uso que a regra do CTA preserva.
              border: '2px solid var(--color-accent-green)',
              boxShadow: '0 0 0 9999px var(--color-scrim)',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      ) : (
        <div className="spn-empty">carregando…</div>
      )}

      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        <button type="button" className="spn-cta" onClick={useArea} disabled={busy}>
          Usar área selecionada
        </button>
        <button type="button" className="spn-ghost" onClick={useWhole} disabled={busy}
                style={{ width: '100%' }}>
          Usar imagem inteira
        </button>
      </div>
    </Sheet>
  )
}
