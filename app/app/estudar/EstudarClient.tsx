'use client'

// Estudar — client do módulo (estudos preliminares para ambientes reais).
//
// Fluxo em etapas: Foto → Preservar (medida opcional + marcação dos elementos
// a manter) → Briefing → Resultado (3 propostas com antes/depois, escolha,
// download, vínculo com projeto e refinamento localizado).
//
// Padrões do repo seguidos à risca:
//   - styles inline com tokens CSS (var(--color-*)) — sem Tailwind aqui;
//   - upload direto browser→Storage (uploadDirect, área estudo-asset);
//   - canvas de seleção do Editar V3 reutilizado como está (coords
//     normalizadas, export P&B na resolução natural — branco = marcado);
//   - comparador BeforeAfter do Editar V3 (aspecto real, sem crop);
//   - verde APENAS em estados ativos/confirmações; CTA primário inverse;
//   - cantos 14px nos cards, bordas 0.5px, muito espaço vazio.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { jsonOrNull, errMsg } from '@/lib/http/fetch-json'
import { EditV3Canvas, type EditV3CanvasHandle, type EditV3Tool } from '@/components/edit-v3/EditV3Canvas'
import { BeforeAfter } from '@/components/edit-v3/BeforeAfter'
import InsufficientNodesCta from '@/components/app/InsufficientNodesCta'
import {
  IconBrush,
  IconEraser,
  IconHand,
  IconLasso,
  IconPolygon,
  IconTrash,
  IconUndo,
} from '@/components/edit-v3/icons'
import {
  ESTUDO_DISCLAIMER,
  ESTUDO_TIPOS,
  ESTUDO_TIPO_DESCRICOES,
  ESTUDO_TIPO_LABELS,
  ESTUDO_VARIANTES,
  ESTUDO_VARIANTE_DESCRICOES,
  ESTUDO_VARIANTE_LABELS,
  type EstudoBriefing,
  type EstudoVariante,
} from '@/lib/estudar/types'

interface FolderOption { id: string; name: string; parent_id: string | null }

interface Props {
  initialCredits: number
  custoEstudo: number
  custoRefino: number
  folders: FolderOption[]
}

type Step = 'foto' | 'preservar' | 'briefing' | 'resultado'

interface AltVersion { id: string; imageUrl: string }
interface AltState {
  variante: EstudoVariante
  status: 'completed' | 'failed'
  errorMessage: string | null
  /** [0] = geração inicial; refinos são anexados ao fim. */
  versions: AltVersion[]
  /** Índice da versão exibida. */
  active: number
}

const LOADING_TEXTS = [
  'Lendo a fotografia do ambiente…',
  'Aplicando o briefing…',
  'Gerando a proposta Essencial…',
  'Gerando a proposta Equilibrada…',
  'Gerando a proposta Completa…',
  'Preservando estrutura e perspectiva…',
  'Finalizando as três propostas…',
]

const STEPS: { id: Step; label: string }[] = [
  { id: 'foto', label: 'Foto' },
  { id: 'preservar', label: 'Preservar' },
  { id: 'briefing', label: 'Briefing' },
  { id: 'resultado', label: 'Resultado' },
]

const EMPTY_BRIEFING: EstudoBriefing = {
  ambienteTipo: '',
  ambienteUso: '',
  estudoTipo: 'layout',
  itensObrigatorios: '',
  estilo: '',
  materiais: '',
  necessidades: '',
  orcamento: '',
  mudancasEstruturais: '',
  instrucoes: '',
}

export default function EstudarClient({ initialCredits, custoEstudo, custoRefino, folders: initialFolders }: Props) {
  // ── Etapas ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('foto')

  // ── Foto ────────────────────────────────────────────────────────────────────
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Preservar (medida + marcação) ───────────────────────────────────────────
  const canvasRef = useRef<EditV3CanvasHandle | null>(null)
  const [tool, setTool] = useState<EditV3Tool>('brush')
  const [brushSize, setBrushSize] = useState(42)
  const [coverage, setCoverage] = useState(0)
  const [medidaDescricao, setMedidaDescricao] = useState('')
  const [medidaValor, setMedidaValor] = useState('')
  const [medidaUnidade, setMedidaUnidade] = useState<'cm' | 'm'>('cm')

  // ── Briefing ────────────────────────────────────────────────────────────────
  const [briefing, setBriefing] = useState<EstudoBriefing>(EMPTY_BRIEFING)
  const setB = <K extends keyof EstudoBriefing>(k: K, v: EstudoBriefing[K]) =>
    setBriefing(prev => ({ ...prev, [k]: v }))

  // ── Geração / resultado ─────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [error, setError] = useState<string | null>(null)
  const [credits, setCredits] = useState(initialCredits)
  const [insufficient, setInsufficient] = useState<number | null>(null)
  const [estudoId, setEstudoId] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [alts, setAlts] = useState<AltState[]>([])
  const [partialNote, setPartialNote] = useState<string | null>(null)

  // ── Escolha / projeto ───────────────────────────────────────────────────────
  const [escolhida, setEscolhida] = useState<EstudoVariante | null>(null)
  const [folders, setFolders] = useState<FolderOption[]>(initialFolders)
  const [folderId, setFolderId] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Refino localizado ───────────────────────────────────────────────────────
  const refineCanvasRef = useRef<EditV3CanvasHandle | null>(null)
  const [refining, setRefining] = useState<EstudoVariante | null>(null)
  const [refineTool, setRefineTool] = useState<EditV3Tool>('brush')
  const [refineBrush, setRefineBrush] = useState(42)
  const [refineInstruction, setRefineInstruction] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)

  const [isDownloading, setIsDownloading] = useState<string | null>(null)

  useEffect(() => {
    if (!isGenerating) return
    let i = 0
    const t = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 2400)
    return () => clearInterval(t)
  }, [isGenerating])

  const aspect = imageDims ? imageDims.w / imageDims.h : 4 / 3
  const stepIndex = STEPS.findIndex(s => s.id === step)
  const briefingOk = briefing.ambienteTipo.trim().length > 0
  const noNodes = credits < custoEstudo

  const folderTree = useMemo(() => {
    const tops = folders.filter(f => !f.parent_id)
    const out: { id: string; label: string }[] = []
    for (const t of tops) {
      out.push({ id: t.id, label: t.name })
      for (const c of folders.filter(f => f.parent_id === t.id)) {
        out.push({ id: c.id, label: `└ ${c.name}` })
      }
    }
    return out
  }, [folders])

  // ── Foto: carregar arquivo ──────────────────────────────────────────────────
  function loadImageFile(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formato não suportado — envie JPG, PNG ou WebP.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Arquivo acima de 15 MB — reduza a imagem e tente de novo.')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const img = new Image()
      img.onload = () => {
        setImageFile(file)
        setImagePreview(dataUrl)
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight })
        setStep('preservar')
      }
      img.onerror = () => setError('Não foi possível ler a imagem.')
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // ── Gerar estudo ────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!imageFile || isGenerating) return
    if (!briefingOk) {
      setError('Informe o tipo do ambiente pra gerar o estudo.')
      return
    }
    setError(null)
    setInsufficient(null)
    setIsGenerating(true)
    setLoadingText(LOADING_TEXTS[0])
    try {
      const { key: sourceKey } = await uploadDirect(imageFile, 'estudo-asset', { kind: 'source' }, { confirm: false })

      let maskKey: string | null = null
      if (canvasRef.current?.hasSelection()) {
        const blob = await canvasRef.current.exportMaskBlob()
        if (blob) {
          const up = await uploadDirect(blob, 'estudo-asset', { kind: 'mask' }, { confirm: false })
          maskKey = up.key
        }
      }

      const valor = Number(medidaValor.replace(',', '.'))
      const medida =
        medidaDescricao.trim() && Number.isFinite(valor) && valor > 0
          ? { descricao: medidaDescricao.trim(), valor, unidade: medidaUnidade }
          : null

      const res = await fetch('/api/estudar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceKey, maskKey, sourceType: 'PHOTO', medida, briefing }),
      })
      const data = await jsonOrNull(res)
      if (res.status === 402) {
        setInsufficient(typeof data?.required === 'number' ? data.required : custoEstudo)
        return
      }
      if (!res.ok || !data) {
        setError(errMsg(data, 'Erro ao gerar o estudo. Tente novamente.'))
        return
      }

      const rawAlts = Array.isArray(data.alternatives) ? data.alternatives : []
      const next: AltState[] = ESTUDO_VARIANTES.map(variante => {
        const raw = rawAlts.find(a => (a as { variante?: string })?.variante === variante) as
          | { id?: string; imageUrl?: string | null; status?: string; errorMessage?: string | null }
          | undefined
        const ok = raw?.status === 'completed' && typeof raw.imageUrl === 'string'
        return {
          variante,
          status: ok ? 'completed' : 'failed',
          errorMessage: ok ? null : (raw?.errorMessage ?? 'Não foi possível gerar esta alternativa.'),
          versions: ok ? [{ id: String(raw!.id), imageUrl: String(raw!.imageUrl) }] : [],
          active: 0,
        }
      })
      setEstudoId(typeof data.estudoId === 'string' ? data.estudoId : null)
      setSourceUrl(typeof data.sourceUrl === 'string' ? data.sourceUrl : null)
      setAlts(next)
      setEscolhida(null)
      setSavedOk(false)
      setPartialNote(
        data.status === 'partial'
          ? 'Uma ou mais propostas falharam — a fração correspondente dos Nodes foi devolvida.'
          : null,
      )
      if (typeof data.totalBalance === 'number') setCredits(data.totalBalance)
      else setCredits(c => Math.max(0, c - custoEstudo))
      setStep('resultado')
    } catch (e) {
      setError((e as Error).message || 'Erro ao gerar o estudo. Tente novamente.')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Escolher proposta ───────────────────────────────────────────────────────
  async function handleEscolher(variante: EstudoVariante) {
    setEscolhida(variante)
    setSavedOk(false)
    if (!estudoId) return
    await fetch(`/api/estudar/${estudoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escolhida: variante }),
    }).catch(() => null)
  }

  // ── Salvar no projeto / Histórico ───────────────────────────────────────────
  async function handleSalvar() {
    if (!estudoId || !escolhida || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/estudar/${estudoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escolhida, folderId: folderId || null, saveToHistory: true }),
      })
      const data = await jsonOrNull(res)
      if (!res.ok) {
        setSaveError(errMsg(data, 'Falha ao salvar.'))
        return
      }
      setSavedOk(true)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleNovaPasta() {
    const name = window.prompt('Nome do projeto/pasta:')?.trim()
    if (!name) return
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await jsonOrNull(res)
    const folder = data?.folder as FolderOption | undefined
    const id = folder?.id ?? (data?.id as string | undefined)
    if (res.ok && id) {
      setFolders(prev => [...prev, { id, name: folder?.name ?? name, parent_id: null }])
      setFolderId(id)
      setSavedOk(false)
    } else {
      setSaveError(errMsg(data, 'Falha ao criar a pasta.'))
    }
  }

  // ── Refino localizado ───────────────────────────────────────────────────────
  const refiningAlt = refining ? alts.find(a => a.variante === refining) ?? null : null
  const refiningImage = refiningAlt && refiningAlt.versions.length > 0
    ? refiningAlt.versions[refiningAlt.active]?.imageUrl ?? null
    : null

  async function handleRefine() {
    if (!estudoId || !refiningAlt || !refiningImage || isRefining) return
    if (!refineInstruction.trim()) {
      setRefineError('Descreva a alteração desejada.')
      return
    }
    if (!refineCanvasRef.current?.hasSelection()) {
      setRefineError('Pinte a região que deve mudar.')
      return
    }
    setRefineError(null)
    setIsRefining(true)
    try {
      const blob = await refineCanvasRef.current.exportMaskBlob()
      if (!blob) throw new Error('Não foi possível exportar a seleção.')
      const { key: maskKey } = await uploadDirect(blob, 'estudo-asset', { kind: 'refine-mask' }, { confirm: false })
      const baseVersion = refiningAlt.versions[refiningAlt.active]
      const res = await fetch('/api/estudar/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudoId,
          alternativaId: baseVersion.id,
          maskKey,
          instruction: refineInstruction.trim(),
        }),
      })
      const data = await jsonOrNull(res)
      if (res.status === 402) {
        setRefineError(`Saldo insuficiente — o refino custa ${custoRefino} Nodes.`)
        return
      }
      if (!res.ok || !data) {
        setRefineError(errMsg(data, 'Erro ao refinar. Tente novamente.'))
        return
      }
      const nova = data.alternativa as { id?: string; imageUrl?: string } | undefined
      if (nova?.id && nova.imageUrl) {
        setAlts(prev =>
          prev.map(a =>
            a.variante === refiningAlt.variante
              ? {
                  ...a,
                  versions: [...a.versions, { id: String(nova.id), imageUrl: String(nova.imageUrl) }],
                  active: a.versions.length,
                }
              : a,
          ),
        )
        setSavedOk(false)
      }
      if (typeof data.totalBalance === 'number') setCredits(data.totalBalance)
      else setCredits(c => Math.max(0, c - custoRefino))
      setRefining(null)
      setRefineInstruction('')
    } catch (e) {
      setRefineError((e as Error).message || 'Erro ao refinar. Tente novamente.')
    } finally {
      setIsRefining(false)
    }
  }

  // ── Download ────────────────────────────────────────────────────────────────
  async function handleDownload(url: string, variante: EstudoVariante) {
    setIsDownloading(variante)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `estudo-${variante}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank', 'noopener')
    } finally {
      setIsDownloading(null)
    }
  }

  function resetAll() {
    setStep('foto')
    setImageFile(null)
    setImagePreview(null)
    setImageDims(null)
    setBriefing(EMPTY_BRIEFING)
    setMedidaDescricao('')
    setMedidaValor('')
    setCoverage(0)
    setEstudoId(null)
    setSourceUrl(null)
    setAlts([])
    setEscolhida(null)
    setFolderId('')
    setSavedOk(false)
    setSaveError(null)
    setPartialNote(null)
    setError(null)
    setInsufficient(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{`@keyframes spnEstudoPulse { 0%,100% { opacity: 0.35 } 50% { opacity: 0.9 } }
@keyframes spnEstudoSpin { to { transform: rotate(360deg) } }`}</style>

      <div style={S.container}>
        {/* Cabeçalho */}
        <header style={S.header}>
          <div>
            <h1 style={S.title}>Estudar</h1>
            <p style={S.subtitle}>
              Estudos preliminares para ambientes reais — três propostas a partir de uma fotografia e do seu briefing.
            </p>
          </div>
          <div style={S.creditsBox} aria-label={`Saldo: ${credits} Nodes`}>
            <span style={S.creditsDot} aria-hidden />
            {credits} Nodes
          </div>
        </header>

        {/* Origem: PHOTO hoje; FLOOR_PLAN preparado no contrato */}
        <div style={S.sourceTypeRow} role="radiogroup" aria-label="Origem do estudo">
          <span style={{ ...S.sourceTypeChip, ...S.sourceTypeChipActive }} role="radio" aria-checked>
            Fotografia do ambiente
          </span>
          <span style={{ ...S.sourceTypeChip, opacity: 0.45, cursor: 'default' }} role="radio" aria-checked={false} aria-disabled>
            Planta baixa · em breve
          </span>
        </div>

        {/* Stepper */}
        <ol style={S.stepper} aria-label="Etapas do estudo">
          {STEPS.map((s, i) => {
            const done = i < stepIndex
            const current = i === stepIndex
            return (
              <li key={s.id} style={S.stepItem} aria-current={current ? 'step' : undefined}>
                <span
                  style={{
                    ...S.stepBullet,
                    ...(current ? S.stepBulletActive : done ? S.stepBulletDone : {}),
                  }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span style={{ ...S.stepLabel, ...(current ? { color: 'var(--color-text-primary)' } : {}) }}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span style={S.stepLine} aria-hidden />}
              </li>
            )
          })}
        </ol>

        {error && (
          <div role="alert" style={S.errorBox}>{error}</div>
        )}

        {/* ── Etapa 1: Foto ── */}
        {step === 'foto' && (
          <section aria-label="Envio da fotografia">
            <div
              style={{ ...S.dropzone, ...(isDragging ? S.dropzoneActive : {}) }}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (f) loadImageFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
              aria-label="Enviar fotografia do ambiente (JPG, PNG ou WebP, até 15 MB)"
            >
              <div style={S.dropIcon} aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4m0 0 4 4m-4-4-4 4" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Envie a fotografia do ambiente
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                Arraste aqui ou clique pra escolher · JPG, PNG ou WebP · até 15 MB
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', maxWidth: 420, lineHeight: 1.6 }}>
                Uma foto reta, com o ambiente inteiro visível e boa luz, dá o melhor estudo.
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) loadImageFile(f)
                e.target.value = ''
              }}
            />
          </section>
        )}

        {/* ── Etapa 2: Preservar (medida + marcação) ── */}
        {step === 'preservar' && imagePreview && (
          <section aria-label="Medida de referência e elementos a preservar" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={S.card}>
              <SectionLabel>Medida de referência · opcional</SectionLabel>
              <p style={S.helpText}>
                Uma medida real do ambiente ajuda o estudo a manter móveis e marcenaria em escala plausível.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 220px' }}>
                  <label htmlFor="medida-desc" style={S.fieldLabel}>O que foi medido</label>
                  <input
                    id="medida-desc"
                    style={S.input}
                    placeholder="ex.: largura da parede do fundo"
                    value={medidaDescricao}
                    onChange={e => setMedidaDescricao(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div style={{ flex: '1 1 110px' }}>
                  <label htmlFor="medida-valor" style={S.fieldLabel}>Valor</label>
                  <input
                    id="medida-valor"
                    style={S.input}
                    placeholder="ex.: 320"
                    inputMode="decimal"
                    value={medidaValor}
                    onChange={e => setMedidaValor(e.target.value)}
                    maxLength={10}
                  />
                </div>
                <div style={{ flex: '0 0 110px' }}>
                  <label htmlFor="medida-unidade" style={S.fieldLabel}>Unidade</label>
                  <select
                    id="medida-unidade"
                    style={{ ...S.input, cursor: 'pointer' }}
                    value={medidaUnidade}
                    onChange={e => setMedidaUnidade(e.target.value === 'm' ? 'm' : 'cm')}
                  >
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={S.card}>
              <SectionLabel>Elementos a preservar · opcional</SectionLabel>
              <p style={S.helpText}>
                Pinte o que deve permanecer exatamente como está na foto — uma marcenaria que fica, um piso novo,
                uma esquadria. O restante do ambiente fica livre pra proposta.
              </p>
              <ToolBar
                tool={tool}
                brushSize={brushSize}
                onTool={setTool}
                onBrush={setBrushSize}
                onUndo={() => canvasRef.current?.undo()}
                onClear={() => canvasRef.current?.clearSelection()}
              />
              <div style={S.canvasWrap}>
                <EditV3Canvas
                  ref={canvasRef}
                  imageUrl={imagePreview}
                  tool={tool}
                  brushSize={brushSize}
                  onCoverageChange={setCoverage}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }} role="status">
                {coverage > 0.0002
                  ? `Área marcada pra preservar: ~${Math.max(1, Math.round(coverage * 100))}% da imagem`
                  : 'Nada marcado — o estudo poderá propor mudanças em todo o ambiente (a estrutura é sempre preservada).'}
              </div>
            </div>

            <div style={S.navRow}>
              <button type="button" style={S.btnGhost} onClick={() => setStep('foto')}>Voltar</button>
              <button type="button" style={S.btnPrimary} onClick={() => setStep('briefing')}>
                Continuar pro briefing
              </button>
            </div>
          </section>
        )}

        {/* ── Etapa 3: Briefing ── */}
        {step === 'briefing' && !isGenerating && (
          <section aria-label="Briefing do estudo" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={S.card}>
              <SectionLabel>Ambiente</SectionLabel>
              <div style={S.fieldGrid}>
                <div>
                  <label htmlFor="amb-tipo" style={S.fieldLabel}>Tipo do ambiente *</label>
                  <input
                    id="amb-tipo"
                    style={S.input}
                    placeholder="ex.: sala de estar, cozinha, consultório"
                    value={briefing.ambienteTipo}
                    onChange={e => setB('ambienteTipo', e.target.value)}
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="amb-uso" style={S.fieldLabel}>Como o ambiente é usado</label>
                  <input
                    id="amb-uso"
                    style={S.input}
                    placeholder="ex.: família com duas crianças, recebe visitas"
                    value={briefing.ambienteUso}
                    onChange={e => setB('ambienteUso', e.target.value)}
                    maxLength={600}
                  />
                </div>
              </div>
            </div>

            <div style={S.card}>
              <SectionLabel>Estudo desejado</SectionLabel>
              <div style={S.tipoGrid} role="radiogroup" aria-label="Tipo de estudo">
                {ESTUDO_TIPOS.map(t => {
                  const active = briefing.estudoTipo === t
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setB('estudoTipo', t)}
                      style={{ ...S.tipoCard, ...(active ? S.tipoCardActive : {}) }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {ESTUDO_TIPO_LABELS[t]}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                        {ESTUDO_TIPO_DESCRICOES[t]}
                      </span>
                    </button>
                  )
                })}
              </div>
              {briefing.estudoTipo === 'reforma' && (
                <div style={{ marginTop: 14 }}>
                  <label htmlFor="mud-estruturais" style={S.fieldLabel}>
                    Mudanças estruturais desejadas · opcional
                  </label>
                  <textarea
                    id="mud-estruturais"
                    style={S.textarea}
                    placeholder="ex.: abrir a parede entre cozinha e sala. Em branco = nenhuma mudança estrutural."
                    value={briefing.mudancasEstruturais}
                    onChange={e => setB('mudancasEstruturais', e.target.value)}
                    maxLength={600}
                    rows={2}
                  />
                  <p style={{ ...S.helpText, marginTop: 6, marginBottom: 0 }}>
                    A estrutura (paredes, portas, janelas, proporções) só muda se você descrever aqui — e só o que descrever.
                  </p>
                </div>
              )}
            </div>

            <div style={S.card}>
              <SectionLabel>Programa e estilo</SectionLabel>
              <div style={S.fieldGrid}>
                <div>
                  <label htmlFor="itens" style={S.fieldLabel}>Itens obrigatórios</label>
                  <textarea
                    id="itens"
                    style={S.textarea}
                    placeholder="o que TODA proposta precisa ter — ex.: sofá pra 4 pessoas, mesa de trabalho"
                    value={briefing.itensObrigatorios}
                    onChange={e => setB('itensObrigatorios', e.target.value)}
                    maxLength={600}
                    rows={2}
                  />
                </div>
                <div>
                  <label htmlFor="necessidades" style={S.fieldLabel}>Necessidades específicas</label>
                  <textarea
                    id="necessidades"
                    style={S.textarea}
                    placeholder="ex.: circulação pra cadeira de rodas, gato em casa, home office"
                    value={briefing.necessidades}
                    onChange={e => setB('necessidades', e.target.value)}
                    maxLength={600}
                    rows={2}
                  />
                </div>
                <div>
                  <label htmlFor="estilo" style={S.fieldLabel}>Estilo</label>
                  <input
                    id="estilo"
                    style={S.input}
                    placeholder="ex.: contemporâneo quente, minimalista"
                    value={briefing.estilo}
                    onChange={e => setB('estilo', e.target.value)}
                    maxLength={300}
                  />
                </div>
                <div>
                  <label htmlFor="materiais" style={S.fieldLabel}>Materiais</label>
                  <input
                    id="materiais"
                    style={S.input}
                    placeholder="ex.: madeira clara, pedra natural, linho"
                    value={briefing.materiais}
                    onChange={e => setB('materiais', e.target.value)}
                    maxLength={300}
                  />
                </div>
                <div>
                  <label htmlFor="orcamento" style={S.fieldLabel}>Orçamento aproximado</label>
                  <input
                    id="orcamento"
                    style={S.input}
                    placeholder="ex.: R$ 20 mil"
                    value={briefing.orcamento}
                    onChange={e => setB('orcamento', e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div>
                  <label htmlFor="instrucoes" style={S.fieldLabel}>Instruções adicionais</label>
                  <textarea
                    id="instrucoes"
                    style={S.textarea}
                    placeholder="qualquer outra orientação pro estudo"
                    value={briefing.instrucoes}
                    onChange={e => setB('instrucoes', e.target.value)}
                    maxLength={800}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div style={S.navRow}>
              <button type="button" style={S.btnGhost} onClick={() => setStep('preservar')}>Voltar</button>
              <div style={{ flex: 1 }} />
            </div>

            {noNodes || insufficient !== null ? (
              <InsufficientNodesCta needed={insufficient ?? custoEstudo} available={credits} />
            ) : (
              <button
                type="button"
                style={{ ...S.btnGenerate, ...(briefingOk ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
                onClick={handleGenerate}
                disabled={!briefingOk}
              >
                <span>Gerar estudo · 3 propostas</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{custoEstudo} Nodes</span>
              </button>
            )}
            <p style={S.disclaimer}>{ESTUDO_DISCLAIMER}</p>
          </section>
        )}

        {/* ── Gerando ── */}
        {step === 'briefing' && isGenerating && (
          <section aria-label="Gerando o estudo" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} role="status" aria-live="polite">
              <span style={S.spinner} aria-hidden />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{loadingText}</span>
            </div>
            <div style={S.resultGrid}>
              {ESTUDO_VARIANTES.map((v, i) => (
                <div key={v} style={{ ...S.card, gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {ESTUDO_VARIANTE_LABELS[v]}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: String(aspect),
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                      animation: `spnEstudoPulse 1.8s ease-in-out ${i * 0.4}s infinite`,
                    }}
                    aria-hidden
                  />
                  <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>
                    {ESTUDO_VARIANTE_DESCRICOES[v]}
                  </div>
                </div>
              ))}
            </div>
            <p style={S.disclaimer}>Isso costuma levar de 1 a 3 minutos — as três propostas são geradas em paralelo.</p>
          </section>
        )}

        {/* ── Etapa 4: Resultado ── */}
        {step === 'resultado' && (
          <section aria-label="Resultado do estudo" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {partialNote && <div style={S.warnBox} role="status">{partialNote}</div>}

            <div style={S.resultGrid}>
              {alts.map(alt => {
                const activeVersion = alt.versions[alt.active] ?? null
                const selected = escolhida === alt.variante
                return (
                  <article
                    key={alt.variante}
                    style={{ ...S.card, gap: 12, ...(selected ? S.cardSelected : {}) }}
                    aria-label={`Proposta ${ESTUDO_VARIANTE_LABELS[alt.variante]}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--color-text-primary)' }}>
                        {ESTUDO_VARIANTE_LABELS[alt.variante]}
                        {selected && (
                          <span style={S.selectedBadge}>selecionada</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>
                        {ESTUDO_VARIANTE_DESCRICOES[alt.variante]}
                      </span>
                    </div>

                    {alt.status === 'completed' && activeVersion ? (
                      <>
                        <BeforeAfter
                          before={imagePreview ?? sourceUrl ?? ''}
                          after={activeVersion.imageUrl}
                          aspect={aspect}
                        />
                        {alt.versions.length > 1 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Versões desta proposta">
                            {alt.versions.map((ver, i) => (
                              <button
                                key={ver.id}
                                type="button"
                                aria-pressed={alt.active === i}
                                onClick={() =>
                                  setAlts(prev =>
                                    prev.map(a => (a.variante === alt.variante ? { ...a, active: i } : a)),
                                  )
                                }
                                style={{
                                  ...S.versionChip,
                                  ...(alt.active === i ? S.versionChipActive : {}),
                                }}
                              >
                                {i === 0 ? 'original' : `refino ${i}`}
                              </button>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            style={{ ...S.btnSmall, ...(selected ? S.btnSmallActive : {}) }}
                            onClick={() => handleEscolher(alt.variante)}
                            aria-pressed={selected}
                          >
                            {selected ? '✓ Escolhida' : 'Escolher esta'}
                          </button>
                          <button
                            type="button"
                            style={S.btnSmall}
                            onClick={() => { setRefining(alt.variante); setRefineError(null) }}
                          >
                            Refinar região · {custoRefino} Nodes
                          </button>
                          <button
                            type="button"
                            style={S.btnSmall}
                            onClick={() => handleDownload(activeVersion.imageUrl, alt.variante)}
                            disabled={isDownloading === alt.variante}
                          >
                            {isDownloading === alt.variante ? 'Baixando…' : 'Baixar'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={S.failBox} role="status">
                        {alt.errorMessage ?? 'Não foi possível gerar esta alternativa.'}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            {/* Salvar no projeto */}
            <div style={S.card}>
              <SectionLabel>Salvar no projeto</SectionLabel>
              <p style={S.helpText}>
                A proposta escolhida vai pro Histórico, dentro do projeto selecionado — com a foto original como “antes”.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label htmlFor="projeto" style={{ ...S.fieldLabel, marginBottom: 0 }}>Projeto</label>
                <select
                  id="projeto"
                  style={{ ...S.input, width: 'auto', minWidth: 200, cursor: 'pointer' }}
                  value={folderId}
                  onChange={e => { setFolderId(e.target.value); setSavedOk(false) }}
                >
                  <option value="">Sem pasta</option>
                  {folderTree.map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <button type="button" style={S.btnSmall} onClick={handleNovaPasta}>Nova pasta…</button>
                <button
                  type="button"
                  style={{ ...S.btnPrimary, ...(escolhida ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
                  onClick={handleSalvar}
                  disabled={!escolhida || isSaving}
                >
                  {isSaving ? 'Salvando…' : savedOk ? 'Salvo ✓ · salvar de novo' : 'Salvar no projeto'}
                </button>
                {savedOk && (
                  <span style={{ fontSize: 12, color: 'var(--color-accent-green)' }} role="status">
                    Salvo no <Link href="/app/history" style={{ textDecoration: 'underline' }}>Histórico</Link> ✓
                  </span>
                )}
              </div>
              {!escolhida && (
                <p style={{ ...S.helpText, marginBottom: 0, marginTop: 10 }}>Escolha uma das propostas acima pra salvar.</p>
              )}
              {saveError && <div role="alert" style={{ ...S.errorBox, marginTop: 10 }}>{saveError}</div>}
            </div>

            <div style={S.navRow}>
              <button type="button" style={S.btnGhost} onClick={resetAll}>Novo estudo</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>
                Estudo debitado: {custoEstudo} Nodes
              </span>
            </div>
            <p style={S.disclaimer}>{ESTUDO_DISCLAIMER}</p>
          </section>
        )}
      </div>

      {/* ── Overlay de refino localizado ── */}
      {refining && refiningImage && (
        <div style={S.overlay} role="dialog" aria-modal aria-label={`Refinar proposta ${ESTUDO_VARIANTE_LABELS[refining]}`}>
          <div style={S.overlayPanel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--color-text-primary)' }}>
                Refinar · {ESTUDO_VARIANTE_LABELS[refining]}
              </div>
              <button type="button" style={S.btnGhost} onClick={() => setRefining(null)} aria-label="Fechar refino">
                Fechar
              </button>
            </div>
            <p style={{ ...S.helpText, marginBottom: 0 }}>
              Pinte a região que deve mudar e descreva a alteração. O restante da imagem é preservado.
            </p>
            <ToolBar
              tool={refineTool}
              brushSize={refineBrush}
              onTool={setRefineTool}
              onBrush={setRefineBrush}
              onUndo={() => refineCanvasRef.current?.undo()}
              onClear={() => refineCanvasRef.current?.clearSelection()}
            />
            <div style={{ ...S.canvasWrap, height: 'min(52vh, 560px)' }}>
              <EditV3Canvas
                ref={refineCanvasRef}
                imageUrl={refiningImage}
                tool={refineTool}
                brushSize={refineBrush}
              />
            </div>
            <div>
              <label htmlFor="refine-inst" style={S.fieldLabel}>O que mudar na região</label>
              <input
                id="refine-inst"
                style={S.input}
                placeholder="ex.: troque o sofá por um de canto em linho cru"
                value={refineInstruction}
                onChange={e => setRefineInstruction(e.target.value)}
                maxLength={600}
              />
            </div>
            {refineError && <div role="alert" style={S.errorBox}>{refineError}</div>}
            {credits < custoRefino ? (
              <InsufficientNodesCta needed={custoRefino} available={credits} />
            ) : (
              <button type="button" style={S.btnGenerate} onClick={handleRefine} disabled={isRefining}>
                <span>{isRefining ? 'Refinando…' : 'Aplicar refinamento'}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{custoRefino} Nodes</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={S.sectionLabel}>{children}</div>
}

function ToolBar(props: {
  tool: EditV3Tool
  brushSize: number
  onTool: (t: EditV3Tool) => void
  onBrush: (n: number) => void
  onUndo: () => void
  onClear: () => void
}) {
  const tools: { id: EditV3Tool; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
    { id: 'brush', label: 'Pincel', Icon: IconBrush },
    { id: 'eraser', label: 'Borracha', Icon: IconEraser },
    { id: 'lasso', label: 'Laço', Icon: IconLasso },
    { id: 'polygon', label: 'Polígono', Icon: IconPolygon },
    { id: 'pan', label: 'Mover', Icon: IconHand },
  ]
  return (
    <div style={S.toolbar} role="toolbar" aria-label="Ferramentas de marcação">
      {tools.map(t => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          aria-pressed={props.tool === t.id}
          onClick={() => props.onTool(t.id)}
          style={{ ...S.toolBtn, ...(props.tool === t.id ? S.toolBtnActive : {}) }}
        >
          <t.Icon size={16} />
        </button>
      ))}
      <span style={S.toolDivider} aria-hidden />
      <label htmlFor="brush-size" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Pincel</label>
      <input
        id="brush-size"
        type="range"
        min={8}
        max={120}
        value={props.brushSize}
        onChange={e => props.onBrush(Number(e.target.value))}
        style={{ width: 90, accentColor: 'var(--color-text-secondary)' }}
        aria-label="Tamanho do pincel"
      />
      <span style={S.toolDivider} aria-hidden />
      <button type="button" title="Desfazer" aria-label="Desfazer" onClick={props.onUndo} style={S.toolBtn}>
        <IconUndo size={16} />
      </button>
      <button type="button" title="Limpar marcação" aria-label="Limpar marcação" onClick={props.onClear} style={S.toolBtn}>
        <IconTrash size={16} />
      </button>
    </div>
  )
}

// ── Styles (tokens do design system; cantos 14px nos cards) ───────────────────

const S: Record<string, React.CSSProperties> = {
  page: { flex: 1, overflowY: 'auto', background: 'var(--color-bg)', minHeight: 0 },
  container: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '40px 28px 72px',
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
  },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 6, maxWidth: 560, lineHeight: 1.6 },
  creditsBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 12, color: 'var(--color-text-secondary)',
    padding: '8px 14px', borderRadius: 999,
    border: '0.5px solid var(--color-border)', background: 'var(--color-surface-subtle)',
    whiteSpace: 'nowrap',
  },
  creditsDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: 'var(--color-accent-green)', boxShadow: '0 0 9px var(--color-accent-green-glow)',
  },
  sourceTypeRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  sourceTypeChip: {
    fontSize: 11, padding: '6px 12px', borderRadius: 999,
    border: '0.5px solid var(--color-border)', color: 'var(--color-text-tertiary)',
    background: 'var(--color-chip)',
  },
  sourceTypeChipActive: {
    borderColor: 'var(--color-border-strong)',
    color: 'var(--color-text-primary)',
    background: 'var(--color-surface)',
  },
  stepper: { display: 'flex', alignItems: 'center', gap: 10, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' },
  stepItem: { display: 'flex', alignItems: 'center', gap: 8 },
  stepBullet: {
    width: 22, height: 22, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 600,
    border: '0.5px solid var(--color-border-strong)', color: 'var(--color-text-tertiary)',
  },
  stepBulletActive: {
    background: 'var(--color-accent-green-bg)',
    borderColor: 'var(--color-accent-green-border)',
    color: 'var(--color-accent-green)',
  },
  stepBulletDone: { background: 'var(--color-surface)', color: 'var(--color-text-secondary)' },
  stepLabel: { fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' },
  stepLine: { width: 26, height: 1, background: 'var(--color-border)', display: 'inline-block' },
  card: {
    border: '0.5px solid var(--color-border)',
    borderRadius: 14,
    background: 'var(--color-bg-elevated)',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardSelected: {
    borderColor: 'var(--color-accent-green-border)',
    boxShadow: '0 0 0 1px var(--color-accent-green-border)',
  },
  selectedBadge: {
    marginLeft: 8,
    fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
    background: 'var(--color-accent-green-bg)', color: 'var(--color-accent-green)',
    padding: '2px 7px', borderRadius: 10, verticalAlign: 'middle',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  },
  helpText: { fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: 0 },
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 },
  fieldLabel: {
    display: 'block', fontSize: 11, fontWeight: 500,
    color: 'var(--color-text-secondary)', marginBottom: 6,
  },
  input: {
    width: '100%', padding: '10px 12px', fontSize: 13,
    background: 'var(--color-input)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-input-border)', borderRadius: 10, outline: 'none',
  },
  textarea: {
    width: '100%', padding: '10px 12px', fontSize: 13, resize: 'vertical',
    background: 'var(--color-input)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-input-border)', borderRadius: 10, outline: 'none',
    minHeight: 58, lineHeight: 1.5, fontFamily: 'inherit',
  },
  tipoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
  tipoCard: {
    display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
    padding: '14px 14px', borderRadius: 14, cursor: 'pointer',
    border: '1px solid var(--color-border)', background: 'var(--color-surface-subtle)',
    transition: 'border-color 0.15s ease, background 0.15s ease',
    fontFamily: 'inherit',
  },
  tipoCardActive: {
    borderColor: 'var(--color-accent-green)',
    background: 'var(--color-accent-green-bg)',
  },
  dropzone: {
    border: '0.5px dashed var(--color-border-strong)', borderRadius: 14,
    padding: '56px 24px', textAlign: 'center', cursor: 'pointer',
    background: 'var(--color-upload-area)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
    minHeight: 320, transition: 'background 0.18s ease, border-color 0.18s ease',
  },
  dropzoneActive: { borderColor: 'var(--color-border-focus)', background: 'var(--color-surface)' },
  dropIcon: {
    width: 44, height: 44, borderRadius: 14, color: 'var(--color-text-secondary)',
    background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'inset 0 0 0 0.5px var(--color-border)',
  },
  canvasWrap: {
    width: '100%', height: 'min(58vh, 620px)',
    background: 'var(--color-canvas)', borderRadius: 14, overflow: 'hidden',
    border: '0.5px solid var(--color-border)', position: 'relative',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    padding: '6px 8px', borderRadius: 10,
    border: '0.5px solid var(--color-border)', background: 'var(--color-surface-subtle)',
  },
  toolBtn: {
    width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--color-text-secondary)', background: 'transparent', border: '1px solid transparent',
    cursor: 'pointer',
  },
  toolBtnActive: {
    color: 'var(--color-accent-green)',
    borderColor: 'var(--color-accent-green-border)',
    background: 'var(--color-accent-green-bg)',
  },
  toolDivider: { width: 1, height: 18, background: 'var(--color-border)', margin: '0 4px' },
  navRow: { display: 'flex', alignItems: 'center', gap: 10 },
  btnPrimary: {
    padding: '12px 18px', borderRadius: 12, fontSize: 13, fontWeight: 650,
    background: 'var(--color-inverse)', color: 'var(--color-inverse-foreground)',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)',
  },
  btnGhost: {
    padding: '12px 16px', borderRadius: 12, fontSize: 13,
    background: 'transparent', color: 'var(--color-text-secondary)',
    border: '0.5px solid var(--color-border-strong)', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnSmall: {
    padding: '8px 12px', borderRadius: 10, fontSize: 12,
    background: 'var(--color-surface)', color: 'var(--color-text-primary)',
    border: '0.5px solid var(--color-border-strong)', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnSmallActive: {
    borderColor: 'var(--color-accent-green-border)',
    background: 'var(--color-accent-green-bg)',
    color: 'var(--color-accent-green)',
  },
  btnGenerate: {
    width: '100%', padding: '14px 17px', borderRadius: 12, fontSize: 13, fontWeight: 650,
    background: 'var(--color-inverse)', color: 'var(--color-inverse-foreground)',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  versionChip: {
    fontSize: 10, padding: '4px 10px', borderRadius: 999,
    border: '0.5px solid var(--color-border)', background: 'var(--color-chip)',
    color: 'var(--color-text-tertiary)', cursor: 'pointer', fontFamily: 'inherit',
  },
  versionChipActive: {
    borderColor: 'var(--color-accent-green-border)',
    background: 'var(--color-accent-green-bg)',
    color: 'var(--color-accent-green)',
  },
  resultGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 },
  errorBox: {
    padding: '10px 14px', borderRadius: 10, fontSize: 12,
    background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)',
    color: 'var(--color-error)',
  },
  warnBox: {
    padding: '10px 14px', borderRadius: 10, fontSize: 12,
    background: 'var(--color-warning-bg)', border: '0.5px solid var(--color-warning-border)',
    color: 'var(--color-warning)',
  },
  failBox: {
    padding: '18px 14px', borderRadius: 10, fontSize: 12, textAlign: 'center',
    background: 'var(--color-surface-subtle)', border: '0.5px dashed var(--color-border-strong)',
    color: 'var(--color-text-tertiary)',
  },
  disclaimer: {
    fontSize: 11, color: 'var(--color-text-quaternary)', textAlign: 'center',
    letterSpacing: '-0.005em', margin: 0,
  },
  spinner: {
    width: 14, height: 14, borderRadius: '50%', display: 'inline-block',
    border: '2px solid var(--color-border-strong)', borderTopColor: 'var(--color-text-primary)',
    animation: 'spnEstudoSpin 0.8s linear infinite',
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 60,
    background: 'var(--color-scrim-strong)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  overlayPanel: {
    width: 'min(960px, 100%)', maxHeight: '92vh', overflowY: 'auto',
    background: 'var(--color-panel)', color: 'var(--color-panel-foreground)',
    borderRadius: 14, border: '0.5px solid var(--color-border-strong)',
    boxShadow: 'var(--shadow-xl)', padding: 20,
    display: 'flex', flexDirection: 'column', gap: 14,
  },
}
