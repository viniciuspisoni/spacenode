'use client'

/**
 * Comparador do Ampliar — o lugar onde o usuário CONFERE o que comprou.
 *
 * Existe separado do `components/app/BeforeAfter` por duas razões que são o
 * contrato deste módulo:
 *
 *  1. Nada de filtro cosmético. O comparador compartilhado escurece e borra o
 *     "antes" (`contrast(.9) saturate(.9) blur(.4px)`) e satura o "depois"
 *     (`contrast(1.05) saturate(1.05)`) para o resultado impressionar. Num
 *     módulo que promete preservar cor e geometria isso é duplamente errado:
 *     encena uma melhora que pode não existir e impede o arquiteto de
 *     verificar fidelidade de cor, que é justamente o que ele precisa fazer.
 *  2. Nada de recorte. Lá o par é `aspect-[4/3]` + `object-cover`, que corta
 *     as laterais de qualquer render 16:9. Aqui o quadro tem o aspecto REAL da
 *     imagem e as duas usam `contain`.
 *
 * E o principal: o modo **100%**. Um upscale que só pode ser visto reduzido a
 * ~760 px de largura é um upscale que o usuário não tem como avaliar — o
 * detalhe pago mora exatamente nos pixels que a visão ajustada joga fora. No
 * modo 100% o resultado aparece em tamanho natural e o original aparece
 * ampliado pelo navegador até o MESMO tamanho físico. É a comparação honesta:
 * "o que o seu computador faria sozinho" contra "o que o motor fez".
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Segmented } from '@/components/app/glass'

export interface UpscaleCompareProps {
  beforeUrl: string
  afterUrl:  string
  /** Aspecto real (largura/altura) da imagem — o quadro nasce dele. */
  aspect:    number
  /** Dimensões reais do resultado; habilitam o modo 100%. */
  outputWidth?:  number | null
  outputHeight?: number | null
  beforeLabel?: string
  afterLabel?:  string
}

type Zoom = 'fit' | 'pixel'

const PIXEL_VIEW_HEIGHT = 380

export default function UpscaleCompare({
  beforeUrl, afterUrl, aspect,
  outputWidth, outputHeight,
  beforeLabel = 'Original', afterLabel = 'Ampliado',
}: UpscaleCompareProps) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [pos,  setPos]  = useState(50)
  const [pan,  setPan]  = useState({ x: 0.5, y: 0.5 })   // 0..1, centro da janela

  const frameRef  = useRef<HTMLDivElement>(null)
  // Qual gesto está em curso: mover a cortina ou deslocar a imagem no 100%.
  const gesture   = useRef<'curtain' | 'pan' | null>(null)
  const panStart  = useRef({ px: 0, py: 0, x: 0, y: 0 })

  // Largura útil da janela: o 1:1 precisa dela para limitar o deslocamento.
  // Vem de um observer e não de `ref.current` lido durante o render — ler ref
  // no render não reage a resize (e o lint do react-hooks reprova).
  const [frameWidth, setFrameWidth] = useState(0)
  useEffect(() => {
    const el = frameRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Sem dimensões reais não há 1:1 possível — o modo é derivado, não corrigido
  // por efeito depois do fato.
  const canPixel = Boolean(outputWidth && outputHeight)
  const mode: Zoom = canPixel ? zoom : 'fit'

  const moveCurtain = useCallback((clientX: number) => {
    const el = frameRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }, [])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = frameRef.current
    if (!el) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    const handleX = r.left + (pos / 100) * r.width
    // No 100% arrastar é deslocar a imagem; a cortina só se pega pela alça.
    // No ajustado, arrastar em qualquer lugar move a cortina (é o gesto que
    // todo mundo já espera de um antes/depois).
    const onHandle = Math.abs(e.clientX - handleX) < 24
    gesture.current = mode === 'pixel' && !onHandle ? 'pan' : 'curtain'
    if (gesture.current === 'curtain') moveCurtain(e.clientX)
    else panStart.current = { px: e.clientX, py: e.clientY, x: pan.x, y: pan.y }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!gesture.current) return
    if (gesture.current === 'curtain') { moveCurtain(e.clientX); return }
    const el = frameRef.current
    if (!el || !outputWidth || !outputHeight) return
    const r = el.getBoundingClientRect()
    // Quanto sobra de imagem fora da janela em cada eixo (0 = cabe inteira).
    const slackX = Math.max(1, outputWidth  - r.width)
    const slackY = Math.max(1, outputHeight - r.height)
    setPan({
      x: clamp01(panStart.current.x - (e.clientX - panStart.current.px) / slackX),
      y: clamp01(panStart.current.y - (e.clientY - panStart.current.py) / slackY),
    })
  }

  function endGesture(e: React.PointerEvent<HTMLDivElement>) {
    gesture.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  // Posição das duas imagens dentro da janela no modo 100%. As DUAS recebem a
  // mesma largura (a natural do resultado): o resultado fica 1:1 e o original
  // fica ampliado pelo navegador até o mesmo tamanho — a comparação que
  // interessa.
  const fitLayer: React.CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
  }

  const layer: React.CSSProperties = mode === 'pixel'
    ? {
        position: 'absolute',
        width:  outputWidth  ?? 0,
        height: outputHeight ?? 0,
        left: -Math.round(pan.x * Math.max(0, (outputWidth  ?? 0) - frameWidth)),
        top:  -Math.round(pan.y * Math.max(0, (outputHeight ?? 0) - PIXEL_VIEW_HEIGHT)),
        maxWidth: 'none',
      }
    : fitLayer

  return (
    <div>
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        style={{
          position: 'relative',
          width: '100%',
          ...(mode === 'pixel'
            ? { height: PIXEL_VIEW_HEIGHT }
            : { aspectRatio: String(aspect || 1.5) }),
          borderRadius: 'var(--r-inner)',
          overflow: 'hidden',
          background: 'var(--color-chip)',
          cursor: mode === 'pixel' ? 'grab' : 'ew-resize',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {/* Resultado no fundo, original por cima recortado pela cortina: assim
            o que aparece à esquerda da linha é o "antes". */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={afterUrl} alt={afterLabel} draggable={false} style={layer} />
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeUrl} alt={beforeLabel} draggable={false} style={layer} />
        </div>

        {/* Cortina */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: `${pos}%`,
          width: 1, background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 0 0 0.5px rgba(0,0,0,0.35)', pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.94)',
            boxShadow: '0 1px 8px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="10" viewBox="0 0 16 12" fill="none" aria-hidden>
              <path d="M1 6h14M5 2 1 6l4 4M11 2l4 4-4 4" stroke="#1a1a1a"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <span style={cornerLabel('left')}>{beforeLabel}</span>
        <span style={cornerLabel('right')}>{afterLabel}</span>
      </div>

      {/* Controle de zoom: some quando não há 1:1 possível. */}
      {canPixel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 1 260px' }}>
            <Segmented
              label="Nível de zoom"
              value={mode}
              onChange={setZoom}
              items={[
                { value: 'fit',   label: 'Imagem inteira' },
                { value: 'pixel', label: 'Detalhe 100%'   },
              ]}
            />
          </div>
          <span className="spn-hint" style={{ marginTop: 0 }}>
            {mode === 'pixel'
              ? 'Pixel a pixel — arraste para percorrer, use a alça para comparar.'
              : 'Arraste para comparar.'}
          </span>
        </div>
      )}
    </div>
  )
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function cornerLabel(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: 10,
    [side]: 12,
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.92)',
    background: 'rgba(0,0,0,0.5)',
    padding: '3px 8px',
    borderRadius: 6,
    pointerEvents: 'none',
  }
}
