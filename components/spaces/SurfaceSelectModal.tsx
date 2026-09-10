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
import { Sheet } from '@/components/app/glass'

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

  return (
    <Sheet open title="Selecionar superfície" onClose={onClose} doneLabel="Cancelar">
      <p className="spn-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        {current
          ? <>Confira a área em <strong>verde</strong>. Para ajustar, escolha <strong>adicionar</strong> ou <strong>remover</strong> e clique na região.</>
          : <>Clique na superfície que você quer alterar — ou use um atalho:</>}
      </p>

      {/* Atalhos semânticos + modo de refino, na mesma família de pílulas do
          resto do app. `aria-checked` é o estado ativo e o seletor do CSS. */}
      <div className="spn-pills" style={{ marginBottom: 12 }}>
        <button type="button" className="spn-pill" onClick={() => pickSemantic('floor')} disabled={!!busy}>
          ▦ Piso
        </button>
        <button type="button" className="spn-pill" onClick={() => pickSemantic('wall')} disabled={!!busy}>
          ▤ Parede
        </button>
        {current && (
          // Os dois modos de refino são um radiogroup DE VERDADE: `role="radio"`
          // solto entre pílulas de ação (Piso, Parede, Desfazer, Limpar) não é
          // dono de grupo nenhum, e o leitor de tela anuncia "opção 1 de 6".
          <div className="spn-pills" role="radiogroup" aria-label="Modo de refino">
            <button type="button" className="spn-pill" role="radio" aria-checked={refineMode === 'add'}
                    onClick={() => setRefineMode('add')} disabled={!!busy}>
              + Adicionar área
            </button>
            <button type="button" className="spn-pill" role="radio" aria-checked={refineMode === 'remove'}
                    onClick={() => setRefineMode('remove')} disabled={!!busy}>
              − Remover área
            </button>
          </div>
        )}
        {history.length > 0 && (
          <button type="button" className="spn-pill" onClick={undo} disabled={!!busy}>↶ Desfazer</button>
        )}
        {current && (
          <button type="button" className="spn-pill" onClick={clearAll} disabled={!!busy}>Limpar</button>
        )}
      </div>

      {/* Imagem clicável (preview verde quando há seleção) */}
      <div style={{
        position: 'relative', borderRadius: 'var(--r-inner)', overflow: 'hidden',
        border: '0.5px solid var(--glass-line)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={current?.previewUrl ?? imageUrl}
          alt="selecionar superfície"
          onClick={onImageClick}
          draggable={false}
          style={{
            display: 'block', width: '100%', height: 'auto', maxHeight: '46dvh',
            objectFit: 'contain', background: 'var(--color-preview-bg)',
            cursor: busy ? 'wait' : 'crosshair', userSelect: 'none',
          }}
        />
        {busy && <div className="spn-overlay">{busy}</div>}
      </div>

      {error && <div className="spn-error" style={{ marginTop: 12 }}>{error}</div>}

      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        <button
          type="button"
          className="spn-cta"
          onClick={() => current && onConfirm(current)}
          disabled={!current || !!busy}
        >
          {current
            ? <>Usar esta seleção <span className="spn-cta-meta">{(current.coverage * 100).toFixed(1)}% da imagem</span></>
            : 'Clique na superfície para começar'}
        </button>
        {onUseBrush && (
          <button type="button" className="spn-ghost" onClick={onUseBrush} disabled={!!busy}
                  style={{ width: '100%' }}>
            Prefiro pintar com o pincel
          </button>
        )}
      </div>
    </Sheet>
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
          padding: '10px 12px', borderRadius: 'var(--r-inner)', width: '100%',
          background: 'var(--color-accent-green-bg)',
          border: '0.5px dashed var(--color-accent-green-border)',
          color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500,
          letterSpacing: '-0.005em', cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', textAlign: 'left', opacity: disabled ? 0.5 : 1,
        }}
      >
        <span aria-hidden style={{ fontSize: 14, color: 'var(--color-accent-green)' }}>⊙</span>
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
      padding: 8, borderRadius: 'var(--r-inner)',
      background: 'var(--color-accent-green-bg)',
      border: '0.5px solid var(--color-accent-green-border)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={selection.previewUrl}
        alt="superfície selecionada"
        style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 6, border: '0.5px solid var(--glass-line)' }}
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
