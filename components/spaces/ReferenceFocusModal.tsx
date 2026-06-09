'use client'

// Reference focus (V1.1): o usuário arrasta um retângulo sobre a imagem de
// referência pra marcar SÓ o elemento relevante (ex.: a planta). Retorna o
// recorte normalizado (0–1) ou null (usar imagem inteira).

import { useEffect, useRef, useState } from 'react'

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
      const maxW = 560, maxH = 440
      const r = img.naturalWidth / img.naturalHeight
      let w = maxW, h = Math.round(w / r)
      if (h > maxH) { h = maxH; w = Math.round(h * r) }
      setDisp({ w, h })
      setBox({ x: w * 0.3, y: h * 0.3, w: w * 0.4, h: h * 0.4 }) // padrão centralizado
    }
    img.onerror = () => setDisp({ w: 480, h: 360 })
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
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 90, padding: 24,
      background: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)',
        borderRadius: 14, padding: 20, width: '100%', maxWidth: 640,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.015em', margin: 0 }}>
            Focar a referência
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            Arraste para marcar só o elemento desejado (ex.: a planta). O modelo recebe apenas essa área — não a vista inteira.
          </p>
        </div>

        {disp ? (
          <div
            ref={wrapRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            style={{
              position: 'relative', width: disp.w, height: disp.h, margin: '0 auto',
              cursor: 'crosshair', touchAction: 'none', userSelect: 'none',
              borderRadius: 8, overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="referência" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />
            {box && box.w > 0 && (
              <div style={{
                position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
                border: '2px solid #1D9E75', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)', pointerEvents: 'none',
              }} />
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)', fontSize: 12 }}>carregando…</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={useWhole} disabled={busy}
            className="spn-action spn-action--ghost" style={{ width: 'auto', padding: '9px 16px', fontSize: 12 }}>
            Usar imagem inteira
          </button>
          <button type="button" onClick={useArea} disabled={busy}
            className="spn-action spn-action--primary" style={{ width: 'auto', padding: '9px 16px', fontSize: 12 }}>
            Usar área selecionada
          </button>
        </div>
      </div>
    </div>
  )
}
