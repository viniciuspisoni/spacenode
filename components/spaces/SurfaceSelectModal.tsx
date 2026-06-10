'use client'

// Seleção de SUPERFÍCIE por clique (Trocar material, camada de superfície V2).
//
// Substitui o pincel como caminho principal: o usuário clica na superfície (ou
// usa os atalhos "Piso"/"Parede") e a segmentação devolve a superfície inteira
// com preview verde. Depois refina com "+ adicionar área" / "− remover área"
// (cada clique re-segmenta a região clicada e une/subtrai da seleção atual) e
// desfaz passos. O pincel continua disponível como modo manual.
//
// Usa POST /api/edits/segment (modos semantic / points / refine — atrás de
// SURFACE_SEGMENTATION_ENABLED). Cada operação é uma chamada de segmentação
// paga pela casa (decisão de produto: sem custo de nodes pro usuário).

import { useRef, useState } from 'react'

export interface SurfaceSelection {
  maskUrl:    string
  previewUrl: string
  coverage:   number
}

type RefineMode = 'add' | 'remove'

export function SurfaceSelectModal({ imageUrl, initial, onConfirm, onUseBrush, onClose }: {
  imageUrl:   string
  /** Seleção existente (refino vindo do modal de confirmação do pincel). */
  initial?:   SurfaceSelection | null
  onConfirm:  (sel: SurfaceSelection) => void
  /** Fecha e deixa o usuário pintar manualmente (fallback do pincel). */
  onUseBrush?: () => void
  onClose:    () => void
}) {
  const [current, setCurrent]       = useState<SurfaceSelection | null>(initial ?? null)
  const [history, setHistory]       = useState<(SurfaceSelection | null)[]>([])
  const [refineMode, setRefineMode] = useState<RefineMode>('add')
  const [busy, setBusy]             = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  async function callSegment(body: Record<string, unknown>, busyMsg: string) {
    setBusy(busyMsg)
    setError(null)
    try {
      const res = await fetch('/api/edits/segment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image_url: imageUrl, ...body }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.surface_mask_url) {
        throw new Error(d?.error ?? 'Não foi possível detectar a superfície. Tente outro ponto.')
      }
      setHistory(h => [...h, current])
      setCurrent({
        maskUrl:    d.surface_mask_url as string,
        previewUrl: (d.preview_url as string) ?? imageUrl,
        coverage:   typeof d.surface_coverage === 'number' ? d.surface_coverage : 0,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function pickSemantic(surface: 'floor' | 'wall') {
    if (busy) return
    void callSegment(
      { semantic: surface },
      surface === 'floor' ? 'Detectando o piso…' : 'Detectando a parede…',
    )
  }

  function onImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (busy) return
    const img = imgRef.current
    if (!img || !img.naturalWidth || !img.naturalHeight) return
    const rect = img.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * img.naturalWidth)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * img.naturalHeight)

    if (!current) {
      void callSegment({ points: [{ x, y }] }, 'Detectando a superfície…')
      return
    }
    void callSegment(
      { base_mask_url: current.maskUrl, points: [{ x, y }], op: refineMode === 'add' ? 'add' : 'subtract' },
      refineMode === 'add' ? 'Adicionando área…' : 'Removendo área…',
    )
  }

  function undo() {
    if (busy || history.length === 0) return
    setError(null)
    setHistory(h => {
      const next = [...h]
      const prev = next.pop()
      setCurrent(prev ?? null)
      return next
    })
  }

  function clearAll() {
    if (busy) return
    setError(null)
    setHistory(h => [...h, current])
    setCurrent(null)
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 999,
    background: active ? 'rgba(29,158,117,0.14)' : 'var(--color-surface)',
    border: active ? '0.5px solid rgba(29,158,117,0.55)' : '0.5px solid var(--color-border-strong)',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
    cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120,
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)',
        borderRadius: 14, padding: 18, maxWidth: 860, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            Selecionar superfície
          </div>
          <button onClick={onClose} disabled={!!busy} style={{
            fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none',
            textDecoration: 'underline', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}>
            Cancelar
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {current
            ? <>Confira a área em <strong>verde</strong>. Para ajustar, escolha <strong>adicionar</strong> ou <strong>remover</strong> e clique na região.</>
            : <>Clique na superfície que você quer alterar — ou use um atalho:</>}
        </div>

        {/* Atalhos semânticos + modo de refino */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => pickSemantic('floor')} disabled={!!busy} style={chipStyle(false)}>
            ▦ Piso
          </button>
          <button type="button" onClick={() => pickSemantic('wall')} disabled={!!busy} style={chipStyle(false)}>
            ▤ Parede
          </button>
          {current && (
            <>
              <span style={{ width: 1, height: 18, background: 'var(--color-border-strong)', margin: '0 4px' }} />
              <button type="button" onClick={() => setRefineMode('add')} disabled={!!busy} style={chipStyle(refineMode === 'add')}>
                + Adicionar área
              </button>
              <button type="button" onClick={() => setRefineMode('remove')} disabled={!!busy} style={chipStyle(refineMode === 'remove')}>
                − Remover área
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          {history.length > 0 && (
            <button type="button" onClick={undo} disabled={!!busy} style={chipStyle(false)}>
              ↶ Desfazer
            </button>
          )}
          {current && (
            <button type="button" onClick={clearAll} disabled={!!busy} style={chipStyle(false)}>
              Limpar
            </button>
          )}
        </div>

        {/* Imagem clicável (preview verde quando há seleção) */}
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '0.5px solid var(--color-border)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={current?.previewUrl ?? imageUrl}
            alt="selecionar superfície"
            onClick={onImageClick}
            draggable={false}
            style={{
              display: 'block', width: '100%', height: 'auto', maxHeight: '56vh',
              objectFit: 'contain', background: 'var(--color-bg)',
              cursor: busy ? 'wait' : 'crosshair', userSelect: 'none',
            }}
          />
          {busy && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
              color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
            }}>
              {busy}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: '9px 12px', borderRadius: 8,
            background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
            color: '#e57373', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => current && onConfirm(current)}
            disabled={!current || !!busy}
            className="spn-action"
            style={{
              flex: 1, minWidth: 240, width: 'auto', padding: '12px 18px',
              background: '#1D9E75', color: '#042818', border: '0.5px solid rgba(0,0,0,0.18)',
              opacity: !current || busy ? 0.5 : 1,
              cursor: !current || busy ? 'not-allowed' : 'pointer',
            }}
          >
            {current
              ? `Usar esta seleção — ${(current.coverage * 100).toFixed(1)}% da imagem`
              : 'Clique na superfície para começar'}
          </button>
          {onUseBrush && (
            <button
              type="button"
              onClick={onUseBrush}
              disabled={!!busy}
              className="spn-action spn-action--ghost"
              style={{ width: 'auto', padding: '12px 16px', fontSize: 12 }}
            >
              Prefiro pintar com o pincel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Barra compacta da seleção ativa (painel do editor): thumb + ações. */
export function SurfaceSelectionBar({ selection, onOpen, onClear, disabled }: {
  selection: SurfaceSelection | null
  onOpen:    () => void
  onClear:   () => void
  disabled:  boolean
}) {
  if (!selection) {
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 10, width: '100%',
          background: 'rgba(29,158,117,0.07)', border: '0.5px dashed rgba(29,158,117,0.45)',
          color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500,
          letterSpacing: '-0.005em', cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', textAlign: 'left', opacity: disabled ? 0.5 : 1,
        }}
      >
        <span aria-hidden style={{ fontSize: 14, color: '#1D9E75' }}>⊙</span>
        <span style={{ flex: 1 }}>
          Selecionar superfície com 1 clique
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 400, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            Detecta o piso ou a parede inteira — ou pinte com o pincel, se preferir.
          </span>
        </span>
      </button>
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: 8, borderRadius: 10,
      background: 'rgba(29,158,117,0.08)', border: '0.5px solid rgba(29,158,117,0.45)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={selection.previewUrl}
        alt="superfície selecionada"
        style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 6, border: '0.5px solid var(--color-border-strong)' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.005em' }}>
          ● Superfície selecionada · {(selection.coverage * 100).toFixed(1)}%
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          O material será aplicado nesta área (o pincel é ignorado).
        </div>
      </div>
      <button type="button" onClick={onOpen} disabled={disabled} style={{
        fontSize: 11, color: 'var(--color-text-secondary)', background: 'none',
        textDecoration: 'underline', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}>
        Editar
      </button>
      <button type="button" onClick={onClear} disabled={disabled} style={{
        fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none',
        textDecoration: 'underline', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}>
        Remover
      </button>
    </div>
  )
}
