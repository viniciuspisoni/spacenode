'use client'

// Fluxo de geração do Spaces em 3 etapas — Referência → Ação → Gerar.
// Substitui o antigo EixosPanel (abas Luz/Câmera/Detalhe) + SketchGuidedEixoBody.
//
//   1. Referência — de onde vem a GEOMETRIA desta geração:
//      Vista Mestre · Novo print (upload) · Imagem do histórico.
//      Um novo print vira a autoridade geométrica; a Vista Mestre passa a
//      transferir apenas a identidade visual do projeto.
//   2. Ação — o que fazer sobre a referência:
//      Nova Vista (principal) · Alterar Luz · Ajustar Materiais · Criar Detalhe.
//   3. Gerar — resumo claro do que será preservado × atualizado (muda por
//      ação), qualidade e custo. Verde só no estado ativo e no CTA.
//
// Uploads de print vão direto browser → Storage (uploadDirect, área
// 'spaces-sketch'), com compressão local acima de 4 MB.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ENGINES, type EngineId, type Resolution } from '@/lib/engines'
import {
  AXIS_OPTIONS, ANGULO_LABEL_SUGGESTIONS,
  detalheOptionsForContext, type DetalheContext, type AxisOption,
} from '@/lib/spaces/axes'
import { getVistaGenerationCost, getAvailableQualities } from '@/lib/spaces/economy'
import type { GenerationAction, Quality, ReferenceKind } from '@/lib/spaces/types'
import { ACTION_LABEL, summaryForGeneration } from '@/lib/spaces/references'
import type { PlanId } from '@/lib/plans'
import { InsufficientBalancePanel } from './InsufficientBalancePanel'
import { DetailIcon } from './DetailIcons'
import { uploadDirect } from '@/lib/storage/direct-upload-client'

// ── Corpo do request enviado ao POST /api/spaces/[id]/generate ─
export interface GenerateRequestBody {
  action:    GenerationAction
  reference:
    | { kind: 'vista_mestre' }
    | { kind: 'vista'; vista_id: string }
    | { kind: 'print'; prints: Array<{ url: string; label: string | null }> }
  values?:           string[]
  directions?:       string[]
  custom_direction?: string
  instruction?:      string
  quality:           Quality
}

export interface HistoryReferenceOption {
  id:        string
  image_url: string
  label:     string
}

interface Props {
  engine:          EngineId
  defaultQuality?: Quality
  balance:         number
  planId:          PlanId
  pooled:          boolean
  spaceId:         string
  detalheContext:  DetalheContext
  vistaMestreUrl:  string | null
  /** Vistas concluídas do Space — candidatas a referência geométrica. */
  historyOptions:  HistoryReferenceOption[]
  disabled?:       boolean
  onGenerate:      (body: GenerateRequestBody, meta: { count: number; total: number; quality: Quality }) => Promise<void>
}

// ── Upload de prints (compressão local + direct upload) ───────

const MAX_PRINTS         = 10
const MAX_BYTES          = 25 * 1024 * 1024
// Teto da área 'spaces-sketch' no Storage (lib/storage/direct-upload.ts).
// Aceitamos originais até 25 MB contando com a compressão local; se ela não
// reduzir o suficiente, o upload é barrado AQUI com mensagem clara — não com
// erro críptico do servidor.
const AREA_MAX_BYTES     = 10 * 1024 * 1024
const ALLOWED_MIME       = ['image/jpeg', 'image/png', 'image/webp']
const COMPRESS_THRESHOLD = 4 * 1024 * 1024
const MAX_DIMENSION      = 2400
const JPEG_QUALITY       = 0.85
const MAX_INSTRUCTION    = 300

function scaleToFit(w: number, h: number, maxDim: number) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h }
  const ratio = w > h ? maxDim / w : maxDim / h
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao decodificar imagem')) }
    img.src = url
  })
}

async function compressIfNeeded(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD) return file
  const img = await loadImage(file)
  const { width, height } = scaleToFit(img.width, img.height, MAX_DIMENSION)
  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) return file
  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg' })
}

interface PrintItem {
  localId:    string
  file:       File
  previewUrl: string
  remoteUrl:  string | null
  status:     'uploading' | 'uploaded' | 'failed'
  label:      string
  error?:     string
}

// ── Componente ────────────────────────────────────────────────

export function GenerationFlow({
  engine, defaultQuality, balance, planId, pooled, spaceId, detalheContext,
  vistaMestreUrl, historyOptions, disabled, onGenerate,
}: Props) {
  // Etapa 1 — referência geométrica
  const [refKind, setRefKind]             = useState<ReferenceKind>('vista_mestre')
  const [prints, setPrints]               = useState<PrintItem[]>([])
  const [historyVistaId, setHistoryVistaId] = useState<string | null>(null)
  // Etapa 2 — ação
  const [action, setAction]               = useState<GenerationAction>('nova_vista')
  const [luzSelected, setLuzSelected]         = useState<Set<string>>(new Set())
  const [detalheSelected, setDetalheSelected] = useState<Set<string>>(new Set())
  const [directions, setDirections]           = useState<Set<string>>(new Set())
  const [customDirection, setCustomDirection] = useState('')
  const [materialInstruction, setMaterialInstruction] = useState('')
  // Etapa 3 — gerar
  const availableQualities = getAvailableQualities(engine)
  const initialQuality     = defaultQuality && availableQualities.includes(defaultQuality)
                             ? defaultQuality
                             : availableQualities[0]
  const [quality, setQuality]       = useState<Resolution>(initialQuality)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // A vista escolhida no histórico sumiu da lista? Volta pro default (derivado
  // no render — lint proíbe setState em effect).
  const activeHistoryId = historyVistaId && historyOptions.some(h => h.id === historyVistaId)
    ? historyVistaId
    : null

  const readyPrints    = prints.filter(p => p.status === 'uploaded' && p.remoteUrl)
  const multiPrints    = refKind === 'print' && readyPrints.length > 1
  // Gerar com upload em andamento descartaria o print pendente sem aviso.
  const uploadsPending = refKind === 'print' && prints.some(p => p.status === 'uploading')

  // Revoga os previews (blobs) no unmount — sem isso, navegar pra outra rota
  // do app deixa os object URLs vivos até hard reload.
  const printsRef = useRef(prints)
  printsRef.current = prints
  useEffect(() => () => {
    printsRef.current.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl) })
  }, [])

  const referenceReady =
    refKind === 'vista_mestre' ? !!vistaMestreUrl
    : refKind === 'print'      ? readyPrints.length > 0
    : !!activeHistoryId

  // Com vários prints, cada print É uma nova vista — as ações de imagem única
  // (Luz/Materiais/Detalhe) exigem referência única.
  const actionAvailable = (a: GenerationAction) => a === 'nova_vista' || !multiPrints
  const effectiveAction: GenerationAction = actionAvailable(action) ? action : 'nova_vista'

  // Quantas vistas esta configuração gera
  const itemCount = useMemo(() => {
    if (!referenceReady) return 0
    if (effectiveAction === 'nova_vista') {
      if (refKind === 'print') return readyPrints.length
      return directions.size + (customDirection.trim().length >= 3 ? 1 : 0)
    }
    if (effectiveAction === 'luz')      return luzSelected.size
    if (effectiveAction === 'material') return materialInstruction.trim().length >= 3 ? 1 : 0
    return detalheSelected.size
  }, [referenceReady, effectiveAction, refKind, readyPrints.length, directions, customDirection, luzSelected, materialInstruction, detalheSelected])

  const costPer      = useMemo(() => getVistaGenerationCost(engine, quality), [engine, quality])
  const total        = costPer * itemCount
  const insufficient = total > balance && itemCount > 0

  // ── Upload pipeline ─────────────────────────────────────────

  function nextLocalId(): string {
    return `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  async function uploadOne(item: PrintItem): Promise<void> {
    try {
      const compressed = await compressIfNeeded(item.file)
      if (compressed.size > AREA_MAX_BYTES) {
        throw new Error('Imagem passa de 10 MB mesmo comprimida — exporte em resolução menor.')
      }
      const { url } = await uploadDirect(compressed, 'spaces-sketch', { spaceId })
      if (!url) throw new Error('Erro no upload')
      setPrints(curr => curr.map(c =>
        c.localId === item.localId ? { ...c, remoteUrl: url, status: 'uploaded' as const } : c,
      ))
    } catch (e) {
      setPrints(curr => curr.map(c =>
        c.localId === item.localId ? { ...c, status: 'failed' as const, error: (e as Error).message } : c,
      ))
    }
  }

  function addFiles(files: FileList | File[]) {
    setError(null)
    const list = Array.from(files)
    const slotsLeft = MAX_PRINTS - prints.length
    if (slotsLeft <= 0) {
      setError(`Limite de ${MAX_PRINTS} prints atingido — remova um pra adicionar outro.`)
      return
    }
    const accepted: PrintItem[] = []
    for (const f of list.slice(0, slotsLeft)) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setError(`"${f.name}" não é um formato suportado (JPG, PNG ou WebP).`)
        continue
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" é maior que 25 MB.`)
        continue
      }
      accepted.push({
        localId:    nextLocalId(),
        file:       f,
        previewUrl: URL.createObjectURL(f),
        remoteUrl:  null,
        status:     'uploading',
        label:      '',
      })
    }
    if (accepted.length === 0) return
    if (list.length > slotsLeft) {
      setError(`Apenas ${slotsLeft} prints foram aceitos — limite de ${MAX_PRINTS} por geração.`)
    }
    setPrints(curr => [...curr, ...accepted])
    accepted.forEach(it => { void uploadOne(it) })
  }

  function removePrint(localId: string) {
    setPrints(curr => {
      const it = curr.find(c => c.localId === localId)
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl)
      return curr.filter(c => c.localId !== localId)
    })
    setError(null)
  }

  function retryPrint(localId: string) {
    const it = prints.find(c => c.localId === localId)
    if (!it) return
    setPrints(curr => curr.map(c =>
      c.localId === localId ? { ...c, status: 'uploading' as const, error: undefined } : c,
    ))
    void uploadOne(it)
  }

  // ── Gerar ───────────────────────────────────────────────────

  function buildRequest(): GenerateRequestBody {
    const reference: GenerateRequestBody['reference'] =
      refKind === 'print'
        ? { kind: 'print', prints: readyPrints.map(p => ({ url: p.remoteUrl!, label: p.label.trim() || null })) }
        : refKind === 'vista'
          ? { kind: 'vista', vista_id: activeHistoryId! }
          : { kind: 'vista_mestre' }

    const body: GenerateRequestBody = { action: effectiveAction, reference, quality }
    if (effectiveAction === 'luz')      body.values = Array.from(luzSelected)
    if (effectiveAction === 'detalhe')  body.values = Array.from(detalheSelected)
    if (effectiveAction === 'material') body.instruction = materialInstruction.trim()
    if (effectiveAction === 'nova_vista' && refKind !== 'print') {
      if (directions.size > 0) body.directions = Array.from(directions)
      const custom = customDirection.trim()
      if (custom.length >= 3) body.custom_direction = custom
    }
    return body
  }

  async function handleGenerate() {
    if (itemCount === 0 || submitting || disabled || insufficient || uploadsPending) return
    setError(null)
    setSubmitting(true)
    try {
      await onGenerate(buildRequest(), { count: itemCount, total, quality })
      // Limpa seleções da ação (a referência escolhida permanece)
      setLuzSelected(new Set())
      setDetalheSelected(new Set())
      setDirections(new Set())
      setCustomDirection('')
      setMaterialInstruction('')
      if (refKind === 'print') {
        // Prints gerados saem da lista; os que falharam no upload ficam pra
        // reenvio (limpá-los obrigaria o usuário a re-upar).
        const hasFailed = prints.some(p => p.status === 'failed')
        setPrints(curr => {
          curr.filter(c => c.status !== 'failed')
              .forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl) })
          return curr.filter(c => c.status === 'failed')
        })
        if (!hasFailed) setRefKind('vista_mestre')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────

  const summary = summaryForGeneration(effectiveAction, refKind)

  return (
    <section style={{
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 14, padding: 24,
    }}>
      {/* ─── Etapa 1 · Referência ─── */}
      <StepHeader n={1} title="Referência" done={referenceReady}
        hint="De onde vem a geometria desta geração" />

      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--color-surface)', borderRadius: 10, marginBottom: 16 }}>
        {(['vista_mestre', 'print', 'vista'] as ReferenceKind[]).map(k => {
          const label = k === 'vista_mestre' ? 'Vista Mestre' : k === 'print' ? 'Novo print' : 'Do histórico'
          const avail = k !== 'vista' || historyOptions.length > 0
          const active = refKind === k
          return (
            <button
              key={k}
              onClick={() => avail && setRefKind(k)}
              disabled={!avail}
              title={avail ? '' : 'Gere vistas primeiro pra usá-las como referência'}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 7,
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                color: active ? 'var(--color-text-primary)'
                  : avail ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)',
                fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
                cursor: avail ? 'pointer' : 'not-allowed',
                boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {refKind === 'vista_mestre' && vistaMestreUrl && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 8 }}>
          <div style={{
            width: 108, aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden',
            border: '1.5px solid var(--color-accent-green)', flexShrink: 0,
            background: 'var(--color-surface)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vistaMestreUrl} alt="Vista Mestre"
                 style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
            A Vista Mestre é a base de geometria e identidade. As variações partem
            exatamente desta cena.
          </p>
        </div>
      )}

      {refKind === 'print' && (
        <PrintUploader
          prints={prints}
          dragOver={dragOver}
          setDragOver={setDragOver}
          fileInputRef={fileInputRef}
          addFiles={addFiles}
          removePrint={removePrint}
          retryPrint={retryPrint}
          setLabel={(id, v) => setPrints(curr => curr.map(c => c.localId === id ? { ...c, label: v } : c))}
        />
      )}

      {refKind === 'vista' && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {historyOptions.map(h => {
              const active = activeHistoryId === h.id
              return (
                <button
                  key={h.id}
                  onClick={() => setHistoryVistaId(h.id)}
                  title={h.label}
                  style={{
                    width: 108, padding: 0, overflow: 'hidden', textAlign: 'left',
                    background: active ? 'var(--color-accent-green-bg)' : 'var(--color-bg)',
                    border: active ? '1.5px solid var(--color-accent-green)' : '0.5px solid var(--color-border-strong)',
                    borderRadius: 10, cursor: 'pointer',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.image_url} alt={h.label}
                         style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{
                    padding: '6px 8px', fontSize: 10, fontWeight: 500,
                    color: active ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {active ? '✓ ' : ''}{h.label}
                  </div>
                </button>
              )
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', margin: '10px 0 0', lineHeight: 1.5 }}>
            A imagem escolhida vira a base de geometria e enquadramento desta geração.
          </p>
        </div>
      )}

      <Hairline />

      {/* ─── Etapa 2 · Ação ─── */}
      <StepHeader n={2} title="Ação" done={itemCount > 0}
        hint="O que fazer sobre a referência" dimmed={!referenceReady} />

      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        marginBottom: 18,
        opacity: referenceReady ? 1 : 0.45,
        pointerEvents: referenceReady ? 'auto' : 'none',
      }}>
        {(['nova_vista', 'luz', 'material', 'detalhe'] as GenerationAction[]).map(a => {
          const active = effectiveAction === a
          const avail  = actionAvailable(a)
          return (
            <button
              key={a}
              onClick={() => avail && setAction(a)}
              disabled={!avail}
              title={avail ? '' : 'Disponível com uma referência única (1 print)'}
              style={{
                padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                background: active ? 'var(--color-accent-green-bg)' : 'var(--color-bg)',
                border: active ? '1.5px solid var(--color-accent-green)' : '0.5px solid var(--color-border-strong)',
                color: active ? 'var(--color-text-primary)'
                  : avail ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)',
                fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
                cursor: avail ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {ACTION_LABEL[a]}
              <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--color-text-quaternary)', marginTop: 3, lineHeight: 1.4 }}>
                {a === 'nova_vista' && 'Outra vista do mesmo projeto'}
                {a === 'luz'        && 'Iluminação e atmosfera'}
                {a === 'material'   && 'Troca pontual de material'}
                {a === 'detalhe'    && 'Recorte para apresentação'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Body da ação */}
      {referenceReady && (
        <div style={{ marginBottom: 4 }}>
          {effectiveAction === 'nova_vista' && refKind === 'print' && (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.55, margin: 0 }}>
              Cada print enviado vira uma nova vista do projeto: a geometria e o
              enquadramento do print são preservados exatamente, e a identidade do
              projeto (materiais, paleta, luz) é aplicada sobre ele.
            </p>
          )}

          {effectiveAction === 'nova_vista' && refKind !== 'print' && (
            <>
              <OptionCards
                options={AXIS_OPTIONS.angulo}
                selected={directions}
                toggle={v => setDirections(s => {
                  const next = new Set(s)
                  if (next.has(v)) next.delete(v); else next.add(v)
                  return next
                })}
              />
              <input
                type="text"
                value={customDirection}
                onChange={e => setCustomDirection(e.target.value.slice(0, MAX_INSTRUCTION))}
                placeholder="Direção personalizada — ex.: da porta de entrada olhando pra sala"
                style={{
                  width: '100%', marginTop: 10, padding: '10px 14px', borderRadius: 8,
                  background: 'var(--color-bg)',
                  border: customDirection.trim().length >= 3
                    ? '1.5px solid var(--color-accent-green)'
                    : '0.5px solid var(--color-border-strong)',
                  color: 'var(--color-text-primary)', fontSize: 12.5,
                  letterSpacing: '-0.005em', outline: 'none',
                }}
              />
            </>
          )}

          {effectiveAction === 'luz' && (
            <OptionCards
              options={AXIS_OPTIONS.iluminacao}
              selected={luzSelected}
              toggle={v => setLuzSelected(s => {
                const next = new Set(s)
                if (next.has(v)) next.delete(v); else next.add(v)
                return next
              })}
            />
          )}

          {effectiveAction === 'material' && (
            <>
              <textarea
                value={materialInstruction}
                onChange={e => setMaterialInstruction(e.target.value.slice(0, MAX_INSTRUCTION))}
                placeholder="Descreva a troca — ex.: trocar o piso da sala para tauari claro; pintar a parede do sofá de verde-oliva"
                rows={3}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'vertical',
                  background: 'var(--color-bg)',
                  border: materialInstruction.trim().length >= 3
                    ? '1.5px solid var(--color-accent-green)'
                    : '0.5px solid var(--color-border-strong)',
                  color: 'var(--color-text-primary)', fontSize: 12.5, lineHeight: 1.55,
                  letterSpacing: '-0.005em', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', margin: '8px 0 0', lineHeight: 1.5 }}>
                Só a superfície indicada muda — o restante do ambiente permanece intacto.
              </p>
            </>
          )}

          {effectiveAction === 'detalhe' && (
            <OptionCards
              options={detalheOptionsForContext(detalheContext)}
              selected={detalheSelected}
              toggle={v => setDetalheSelected(s => {
                const next = new Set(s)
                if (next.has(v)) next.delete(v); else next.add(v)
                return next
              })}
            />
          )}
        </div>
      )}

      <Hairline />

      {/* ─── Etapa 3 · Gerar ─── */}
      <StepHeader n={3} title="Gerar" done={false}
        hint="Confira o que será mantido e o que muda" dimmed={itemCount === 0} />

      <div style={{ opacity: itemCount > 0 ? 1 : 0.45 }}>
        {/* Resumo — muda conforme referência × ação */}
        <div style={{
          background: 'var(--color-bg)', border: '0.5px solid var(--color-border)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 10, letterSpacing: '-0.005em' }}>
            Referência usada:{' '}
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
              {summary.referencia}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <SummaryColumn title="Será preservado" items={summary.preservado} tone="keep" />
            <SummaryColumn title="Será atualizado" items={summary.atualizado} tone="change" />
          </div>
        </div>

        {/* Qualidade */}
        <QualityPicker engine={engine} quality={quality} setQuality={setQuality} availableQualities={availableQualities} />

        {error && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
            color: '#e57373', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* CTA / saldo insuficiente */}
        <div style={{ marginTop: 16 }}>
          {insufficient ? (
            <InsufficientBalancePanel
              count={itemCount}
              costPer={costPer}
              total={total}
              available={balance}
              currentPlan={planId}
              pooled={pooled}
              onReduceTo={(n) => {
                if (effectiveAction === 'luz')      setLuzSelected(s => new Set(Array.from(s).slice(0, n)))
                if (effectiveAction === 'detalhe')  setDetalheSelected(s => new Set(Array.from(s).slice(0, n)))
                if (effectiveAction === 'nova_vista' && refKind !== 'print') {
                  setDirections(s => new Set(Array.from(s).slice(0, n)))
                  if (n <= directions.size) setCustomDirection('')
                }
                if (effectiveAction === 'nova_vista' && refKind === 'print') {
                  setPrints(curr => {
                    const ready = curr.filter(c => c.status === 'uploaded')
                    const others = curr.filter(c => c.status !== 'uploaded')
                    ready.slice(n).forEach(it => { if (it.previewUrl) URL.revokeObjectURL(it.previewUrl) })
                    return [...ready.slice(0, n), ...others]
                  })
                }
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {uploadsPending
                  ? `aguardando uploads… (${prints.filter(p => p.status === 'uploading').length} pendente${prints.filter(p => p.status === 'uploading').length === 1 ? '' : 's'})`
                  : itemCount > 0
                    ? <>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          {itemCount} vista{itemCount === 1 ? '' : 's'}
                        </span>
                        <span style={{ marginLeft: 8 }}>· {ENGINES[engine].name} {quality.toUpperCase()} · {costPer} nodes cada</span>
                      </>
                    : 'complete as etapas acima pra gerar'}
              </div>
              <button
                onClick={handleGenerate}
                disabled={itemCount === 0 || submitting || disabled || uploadsPending}
                className="spn-action"
                style={{
                  width: 'auto', minWidth: 200, padding: '12px 22px',
                  background: '#1D9E75', color: '#042818',
                  border: '0.5px solid rgba(0,0,0,0.18)',
                  opacity: itemCount === 0 ? 0.5 : 1,
                  boxShadow: itemCount > 0
                    ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)'
                    : 'none',
                }}
              >
                {submitting ? 'Gerando…' : `Gerar · ${total} nodes →`}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Sub-componentes ───────────────────────────────────────────

function Hairline() {
  return <div style={{ borderTop: '0.5px solid var(--color-border)', margin: '20px 0' }} />
}

function StepHeader({ n, title, hint, done, dimmed }: {
  n: number; title: string; hint: string; done: boolean; dimmed?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      opacity: dimmed ? 0.45 : 1,
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 999, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--color-accent-green)' : 'transparent',
        border: done ? 'none' : '1px solid var(--color-border-strong)',
        color: done ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
        fontSize: 10.5, fontWeight: 600,
      }}>
        {done ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : n}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
      }}>
        {title}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)', letterSpacing: '-0.005em' }}>
        {hint}
      </span>
    </div>
  )
}

function OptionCards({ options, selected, toggle }: {
  options:  AxisOption[]
  selected: Set<string>
  toggle:   (value: string) => void
}) {
  return (
    <div style={{
      display: 'grid', gap: 10,
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    }}>
      {options.map(opt => {
        const isSelected = selected.has(opt.value)
        return (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            style={{
              textAlign: 'left', padding: '14px 16px',
              background: isSelected ? 'var(--color-accent-green-bg)' : 'var(--color-bg)',
              border: isSelected ? '1.5px solid var(--color-accent-green)' : '0.5px solid var(--color-border-strong)',
              borderRadius: 10,
              display: 'flex', flexDirection: 'column', gap: 10,
              cursor: 'pointer', position: 'relative',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {opt.icon ? (
              <span style={{
                width: 36, height: 24, borderRadius: 5, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                color: isSelected ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
              }}>
                <DetailIcon name={opt.icon} />
              </span>
            ) : (
              <span style={{ width: 36, height: 24, borderRadius: 5, background: opt.color, flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.45 }}>
                {opt.description}
              </div>
            </div>
            {isSelected && (
              <span style={{
                position: 'absolute', top: 10, right: 10,
                width: 20, height: 20, borderRadius: 999,
                background: 'var(--color-accent-green)', color: 'var(--color-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function SummaryColumn({ title, items, tone }: {
  title: string; items: string[]; tone: 'keep' | 'change'
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', marginBottom: 8,
      }}>
        {title}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(item => (
          <li key={item} style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            fontSize: 11.5, color: 'var(--color-text-secondary)', lineHeight: 1.45,
            letterSpacing: '-0.005em',
          }}>
            <span aria-hidden style={{ flexShrink: 0, marginTop: 3, color: 'var(--color-text-quaternary)' }}>
              {tone === 'keep' ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="9" rx="1.5"/>
                  <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.6-6.3"/>
                  <path d="M21 3v6h-6"/>
                </svg>
              )}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function QualityPicker({ engine, quality, setQuality, availableQualities }: {
  engine:             EngineId
  quality:            Resolution
  setQuality:         (q: Resolution) => void
  availableQualities: Quality[]
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
      }}>
        Qualidade
      </span>
      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--color-surface)', borderRadius: 8 }}>
        {(['hd', '2k', '4k'] as Resolution[]).map(q => {
          const supported = availableQualities.includes(q)
          const active = quality === q && supported
          const cost = supported ? getVistaGenerationCost(engine, q) : null
          return (
            <button
              key={q}
              onClick={() => supported && setQuality(q)}
              disabled={!supported}
              title={supported ? `${cost} nodes/vista` : `Não disponível em ${ENGINES[engine].name}`}
              style={{
                padding: '6px 12px', borderRadius: 6,
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                color: active ? 'var(--color-text-primary)'
                  : supported ? 'var(--color-text-secondary)' : 'var(--color-text-quaternary)',
                fontSize: 11, fontWeight: 500, letterSpacing: '0.02em',
                cursor: supported ? 'pointer' : 'not-allowed',
                boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
              }}
            >
              {q.toUpperCase()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Uploader de prints ────────────────────────────────────────

function PrintUploader({
  prints, dragOver, setDragOver, fileInputRef, addFiles, removePrint, retryPrint, setLabel,
}: {
  prints:       PrintItem[]
  dragOver:     boolean
  setDragOver:  (v: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles:     (files: FileList | File[]) => void
  removePrint:  (localId: string) => void
  retryPrint:   (localId: string) => void
  setLabel:     (localId: string, value: string) => void
}) {
  const limitReached = prints.length >= MAX_PRINTS
  const usedLabels = new Set(prints.map(p => p.label.trim()).filter(l => l.length > 0))

  function applySuggestion(label: string) {
    const target = prints.find(p => p.label.trim().length === 0)
    if (target) setLabel(target.localId, label)
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: '0 0 10px' }}>
        O print enviado é a <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>base geométrica</strong> da
        geração: geometria, enquadramento e câmera dele são preservados exatamente.
        A Vista Mestre entra só como identidade do projeto — materiais, paleta e luz.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
        style={{ display: 'none' }}
      />

      <button
        type="button"
        onClick={() => !limitReached && fileInputRef.current?.click()}
        onDragOver={e => { if (!limitReached) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (limitReached) return
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
        }}
        disabled={limitReached}
        style={{
          width: '100%', padding: '22px 20px',
          background: dragOver ? 'rgba(48,209,88,0.04)' : 'var(--color-bg)',
          border: limitReached
            ? '0.5px dashed var(--color-border-strong)'
            : dragOver
              ? '1.5px dashed var(--color-accent-green)'
              : '0.5px dashed var(--color-border-strong)',
          borderRadius: 12,
          color: 'var(--color-text-tertiary)',
          cursor: limitReached ? 'not-allowed' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          transition: 'background 0.18s, border-color 0.18s',
          marginBottom: prints.length > 0 ? 14 : 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '-0.01em' }}>
          {limitReached ? `Limite de ${MAX_PRINTS} atingido` : 'Arraste prints aqui ou clique pra enviar'}
        </span>
        <span style={{ fontSize: 11 }}>
          {limitReached
            ? 'Remova um print pra adicionar outro'
            : `JPG, PNG ou WebP · qualquer ambiente ou ângulo · até ${MAX_PRINTS} por vez`}
        </span>
      </button>

      {prints.length > 0 && (
        <>
          <div style={{
            border: '0.5px solid var(--color-border)',
            borderRadius: 10, overflow: 'hidden', marginBottom: 12,
          }}>
            {prints.map((it, i) => (
              <div key={it.localId} style={{
                display: 'flex', flexDirection: 'column',
                borderBottom: i === prints.length - 1 ? 'none' : '0.5px solid var(--color-border)',
                background: it.status === 'failed' ? 'rgba(163,45,45,0.06)' : 'transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                  <div style={{
                    position: 'relative', flexShrink: 0,
                    width: 54, height: 54, borderRadius: 8, overflow: 'hidden',
                    background: 'var(--color-surface)',
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.previewUrl} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {it.status === 'uploading' && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{
                          width: 16, height: 16, border: '2px solid #fff',
                          borderTopColor: 'transparent', borderRadius: 999,
                          animation: 'printSpin 0.8s linear infinite',
                        }} />
                        <style>{`@keyframes printSpin { to { transform: rotate(360deg); } }`}</style>
                      </div>
                    )}
                    {it.status === 'failed' && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(163,45,45,0.6)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 15, fontWeight: 700,
                      }}>
                        !
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    value={it.label}
                    onChange={e => setLabel(it.localId, e.target.value)}
                    placeholder="Nome da vista (opcional)"
                    maxLength={48}
                    style={{
                      flex: 1, minWidth: 0,
                      padding: '8px 12px', borderRadius: 7,
                      background: 'var(--color-bg)',
                      border: '0.5px solid var(--color-border-strong)',
                      color: 'var(--color-text-primary)',
                      fontSize: 12, letterSpacing: '-0.005em',
                      outline: 'none',
                    }}
                  />

                  {it.status === 'failed' && (
                    <button
                      onClick={() => retryPrint(it.localId)}
                      style={{
                        padding: '6px 10px', fontSize: 11, borderRadius: 6,
                        background: 'transparent', color: '#e57373',
                        border: '0.5px solid rgba(163,45,45,0.4)',
                        cursor: 'pointer',
                      }}
                    >
                      ↻ Reenviar
                    </button>
                  )}

                  <button
                    onClick={() => removePrint(it.localId)}
                    title="Remover"
                    style={{
                      flexShrink: 0,
                      width: 28, height: 28, borderRadius: 6,
                      background: 'transparent', color: 'var(--color-text-tertiary)',
                      border: '0.5px solid var(--color-border-strong)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="6" y1="6" x2="18" y2="18"/>
                      <line x1="6" y1="18" x2="18" y2="6"/>
                    </svg>
                  </button>
                </div>
                {it.status === 'failed' && it.error && (
                  <div style={{ padding: '0 12px 10px 78px', fontSize: 11, color: '#e57373', lineHeight: 1.4 }}>
                    {it.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ANGULO_LABEL_SUGGESTIONS.map(label => {
              const used = usedLabels.has(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => !used && applySuggestion(label)}
                  disabled={used}
                  className="spn-pill"
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 11,
                    background: used ? 'var(--color-surface)' : 'transparent',
                    color: used ? 'var(--color-text-quaternary)' : 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-strong)',
                    cursor: used ? 'not-allowed' : 'pointer',
                    letterSpacing: '-0.005em',
                    textDecoration: used ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
