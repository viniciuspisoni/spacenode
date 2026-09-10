'use client'

// Blocos 3D — client do módulo (imagem → modelo 3D).
//
// Fluxo: upload direto pro Storage (área blocos3d-source, binário não passa
// pela Vercel) → POST /api/blocos3d cria o job e debita → polling em
// GET /api/blocos3d/[jobId] até completed/failed → viewer 3D + downloads.
// Ao montar, adota o job processing mais recente (a geração sobrevive a
// reload/troca de página).
//
// Multiview: 4 slots posicionais (Frente obrigatória + Esquerda/Trás/Direita)
// — o Tripo exige saber qual ângulo é qual; Rodin/Meshy recebem como lista.
// Os 4 slots são O TRABALHO: ficam na superfície do painel. O que sobra —
// motor e prompt de materiais — vive atrás de duas linhas de ajuste.
//
// Progresso: os motores fal não reportam % — quando o job vem com progress 0,
// a barra é sintetizada pela estimativa do motor (capada em 92%).
//
// Vidro: o painel é vidro, o PALCO não. O GlbViewer roda requestAnimationFrame
// permanente (OrbitControls com damping + autoRotate) e um backdrop-filter em
// volta dele custaria uma recomposição por frame. Os cartões de progresso e de
// falha podem ser vidro — quando eles aparecem, não há canvas rodando.

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  RowIcon,
  SettingGroup,
  SettingRow,
  Sheet,
  ChoiceGroup,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { jsonOrNull, errMsg } from '@/lib/http/fetch-json'
import { downloadBlob } from '@/lib/apresentar/svg-to-png'
import {
  BLOCOS3D_ENGINES,
  BLOCOS3D_QUALITY_ORDER,
  BLOCOS3D_SOURCE_MAX_BYTES,
  BLOCOS3D_SOURCE_MAX_MB,
  DEFAULT_BLOCOS3D_QUALITY,
  TEXTURE_PROMPT_MAX_LEN,
  VIEW_POSITION_LABEL,
  VIEW_POSITION_ORDER,
} from '@/lib/blocos3d/config'
import type { Blocos3DJobView, Blocos3DQuality, ModelFormat, ViewPosition } from '@/lib/blocos3d/types'

const GlbViewer = dynamic(() => import('./GlbViewer'), { ssr: false })

const POLL_INTERVAL_MS = 5000

const FORMAT_LABEL: Record<ModelFormat, string> = {
  glb:  'GLB',
  fbx:  'FBX',
  obj:  'OBJ',
  usdz: 'USDZ',
}
const FORMAT_ORDER: ModelFormat[] = ['glb', 'fbx', 'obj', 'usdz']

function progressLabel(progress: number): string {
  if (progress < 15) return 'Analisando as imagens…'
  if (progress < 45) return 'Gerando a geometria…'
  if (progress < 70) return 'Refinando a malha…'
  if (progress < 95) return 'Aplicando texturas…'
  return 'Finalizando…'
}

function formatMinutes(ms: number): string {
  const min = Math.round(ms / 60_000)
  return min <= 1 ? '~1 min' : `~${min} min`
}

/** % exibida: usa o progress real quando o provider reporta; senão sintetiza
 *  pelo tempo decorrido vs estimativa do motor (nunca fecha sozinha). */
function displayProgress(job: Blocos3DJobView, now: number): number {
  if (job.progress > 0) return job.progress
  const estimated = BLOCOS3D_ENGINES[job.quality]?.estimatedMs ?? 150_000
  const elapsed = now - new Date(job.createdAt).getTime()
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 2
  return Math.min(92, Math.round((elapsed / estimated) * 100))
}

/** Glifo do módulo (cubo) — um só desenho pro empty state, slots e fallback
 *  do histórico. */
function CubeGlyph({ size, strokeWidth = 1.5 }: { size: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3z" />
      <path d="M4.5 7.2L12 11.4l7.5-4.2M12 11.4V21" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

/** Painel de progresso com ticker próprio de 1s — isola o re-render da barra
 *  sintetizada (sem ele, a árvore inteira do módulo re-renderizaria a cada
 *  segundo durante toda a geração). */
function ProcessingPanel({ job }: { job: Blocos3DJobView }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const shownProgress = displayProgress(job, now)

  return (
    <div className="spn-glass" style={{
      borderRadius: 'var(--r-card)', padding: '22px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 340,
    }}>
      {job.inputUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={job.inputUrl} alt="origem" style={{
          width: 120, height: 120, objectFit: 'cover',
          borderRadius: 'var(--r-inner)', border: '0.5px solid var(--glass-line)',
        }} />
      )}
      <div style={{ width: '100%' }}>
        <div style={{ height: 3, borderRadius: 99, background: 'var(--color-chip)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: 'var(--color-text-primary)',
            width: `${Math.max(4, shownProgress)}%`, transition: 'width 0.6s var(--ease)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{progressLabel(shownProgress)}</span>
          <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            {shownProgress}%
          </span>
        </div>
      </div>
      <p className="spn-hint" style={{ marginTop: 0, textAlign: 'center' }}>
        Leva {formatMinutes(BLOCOS3D_ENGINES[job.quality]?.estimatedMs ?? 150_000)}. Pode navegar pelo app —
        o bloco continua sendo gerado e fica no histórico.
      </p>
    </div>
  )
}

type SlotFiles    = Partial<Record<ViewPosition, File>>
type SlotPreviews = Partial<Record<ViewPosition, string>>
type SheetId      = 'saida' | 'materiais'

interface Blocos3DClientProps {
  initialCredits: number
  /** Disponibilidade real por tier (server checa as keys dos providers). */
  engineAvailability: Record<Blocos3DQuality, boolean>
  /** Deep-link (?job=) vindo do Histórico — abre este job selecionado. */
  initialJobId?: string
}

export default function Blocos3DClient({ initialCredits, engineAvailability, initialJobId }: Blocos3DClientProps) {
  // Entrada — multiview por posição
  const [slotFiles,    setSlotFiles]    = useState<SlotFiles>({})
  const [slotPreviews, setSlotPreviews] = useState<SlotPreviews>({})
  const [dragSlot,     setDragSlot]     = useState<ViewPosition | null>(null)

  // Opções
  const [quality, setQuality] = useState<Blocos3DQuality>(
    engineAvailability[DEFAULT_BLOCOS3D_QUALITY] ? DEFAULT_BLOCOS3D_QUALITY
      : BLOCOS3D_QUALITY_ORDER.find(q => engineAvailability[q]) ?? DEFAULT_BLOCOS3D_QUALITY,
  )
  const [texturePrompt, setTexturePrompt] = useState('')
  const [sheet,         setSheet]         = useState<SheetId | null>(null)

  // Job + histórico
  const [job,     setJob]     = useState<Blocos3DJobView | null>(null)
  const [history, setHistory] = useState<Blocos3DJobView[]>([])

  // Submissão / feedback
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [credits,      setCredits]      = useState(initialCredits)
  const [error,        setError]        = useState<string | null>(null)
  const [downloading,  setDownloading]  = useState<ModelFormat | null>(null)

  const fileInputRef  = useRef<HTMLInputElement>(null)
  const activeSlotRef = useRef<ViewPosition>('front')
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  const engine   = BLOCOS3D_ENGINES[quality]
  const nodeCost = engine.costInNodes
  const imageCount = VIEW_POSITION_ORDER.filter(p => slotFiles[p]).length
  const isGenerating = isSubmitting || job?.status === 'processing'
  const canSubmit = !!slotFiles.front && credits >= nodeCost && !isGenerating && engineAvailability[quality]

  // O papel de parede é o trabalho em foco: o bloco aberto, ou a foto da frente.
  useAmbient(job?.thumbnailUrl ?? job?.inputUrl ?? slotPreviews.front ?? null)

  // ── Histórico + retomada de job em andamento ───────────────────────────────

  const refreshHistory = useCallback(async (): Promise<Blocos3DJobView[]> => {
    try {
      const res = await fetch('/api/blocos3d?limit=20')
      const data = await jsonOrNull(res)
      if (!res.ok || !Array.isArray(data?.jobs)) return []
      const jobs = data.jobs as Blocos3DJobView[]
      setHistory(jobs)
      return jobs
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Defere pro próximo tick: nada de setState síncrono no corpo do effect.
    const t = setTimeout(async () => {
      // Deep-link do Histórico (?job=): abre o job pedido com detalhe completo.
      if (initialJobId) {
        try {
          const res = await fetch(`/api/blocos3d/${initialJobId}`)
          const data = await jsonOrNull(res)
          if (!cancelled && res.ok && data?.job) setJob(data.job as Blocos3DJobView)
        } catch {
          // Job inválido/alheio — segue pro fluxo normal.
        }
      }
      const jobs = await refreshHistory()
      if (cancelled) return
      // Retomada: adota o processing mais recente (só se nada selecionado).
      const processing = jobs.find(j => j.status === 'processing')
      if (processing) setJob(cur => cur ?? processing)
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [refreshHistory, initialJobId])

  // ── Polling do job ativo ───────────────────────────────────────────────────

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (!job || job.status !== 'processing') return

    const poll = async () => {
      try {
        const res = await fetch(`/api/blocos3d/${job.id}`)
        const data = await jsonOrNull(res)
        if (!res.ok || !data?.job) return
        const fresh = data.job as Blocos3DJobView
        setJob(fresh)
        if (fresh.status !== 'processing') {
          refreshHistory()
          if (fresh.status === 'failed') {
            setError(fresh.errorMessage
              ? `A geração falhou: ${fresh.errorMessage}. Os nodes foram estornados.`
              : 'A geração falhou. Os nodes foram estornados.')
          }
        }
      } catch {
        // Transitório — o próximo tick tenta de novo.
      }
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status])

  // ── Entrada de imagens ─────────────────────────────────────────────────────

  function loadImageFile(file: File, pos: ViewPosition) {
    if (!file.type.startsWith('image/')) { setError('Arquivo deve ser uma imagem.'); return }
    if (file.size > BLOCOS3D_SOURCE_MAX_BYTES) { setError(`Imagem muito grande. Máximo ${BLOCOS3D_SOURCE_MAX_MB} MB.`); return }
    setError(null)
    setSlotFiles(cur => ({ ...cur, [pos]: file }))
    const reader = new FileReader()
    reader.onload = (e) => setSlotPreviews(cur => ({ ...cur, [pos]: (e.target?.result as string) ?? undefined }))
    reader.readAsDataURL(file)
  }

  function removeSlot(pos: ViewPosition) {
    setSlotFiles(cur => { const next = { ...cur }; delete next[pos]; return next })
    setSlotPreviews(cur => { const next = { ...cur }; delete next[pos]; return next })
  }

  function resetInput() {
    setSlotFiles({})
    setSlotPreviews({})
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openPicker(pos: ViewPosition) {
    activeSlotRef.current = pos
    fileInputRef.current?.click()
  }

  // ── Submissão ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!slotFiles.front || !canSubmit) return
    setIsSubmitting(true)
    setError(null)
    try {
      // Todos os ângulos sobem DIRETO pro Storage, em paralelo.
      const entries = await Promise.all(
        VIEW_POSITION_ORDER.filter(p => slotFiles[p]).map(async p => {
          const { key } = await uploadDirect(slotFiles[p]!, 'blocos3d-source', {}, { confirm: false })
          return [p, key] as const
        }),
      )
      const sourceKeys = Object.fromEntries(entries)

      const res = await fetch('/api/blocos3d', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceKeys,
          quality,
          ...(texturePrompt.trim() && engine.supportsTexturePrompt ? { texturePrompt: texturePrompt.trim() } : {}),
        }),
      })
      const data = await jsonOrNull(res)
      if (!res.ok) { setError(errMsg(data, 'Erro ao iniciar a geração.')); return }
      if (typeof data?.jobId !== 'string' || !data.jobId) {
        setError('Resposta inválida do servidor. Recarregue a página e confira o histórico.')
        return
      }

      if (typeof data?.credits === 'number') setCredits(data.credits)
      else setCredits(c => c - nodeCost)

      // Job otimista já em processing — o primeiro poll traz o estado real.
      setJob({
        id:           data.jobId,
        status:       'processing',
        progress:     0,
        quality,
        inputUrl:     slotPreviews.front ?? null,
        thumbnailUrl: null,
        modelUrls:    {},
        nodesCost:    nodeCost,
        errorMessage: null,
        createdAt:    new Date().toISOString(),
        completedAt:  null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha de conexão. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Download ───────────────────────────────────────────────────────────────

  async function handleDownload(format: ModelFormat) {
    const url = job?.modelUrls[format]
    if (!url || downloading) return
    setDownloading(format)
    try {
      const filename = `spacenode-bloco3d.${format}`
      if (url.includes('/storage/v1/object/sign/')) {
        // Signed URL do nosso Storage: o param download dispara o attachment
        // direto no browser — sem bufferizar dezenas de MB em memória.
        const a = document.createElement('a')
        a.href = `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        // Fallback (URL do provider, cross-origin sem attachment garantido).
        const res = await fetch(url)
        if (!res.ok) throw new Error('fetch failed')
        downloadBlob(await res.blob(), filename)
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(null)
    }
  }

  async function selectHistoryJob(item: Blocos3DJobView) {
    setError(null)
    setJob(item)
    // A listagem vem sem URLs de modelo (assinar 4 modelos × N linhas a cada
    // load seria caro à toa) — busca o detalhe completo ao selecionar.
    if (item.status === 'completed' && !item.modelUrls.glb) {
      try {
        const res = await fetch(`/api/blocos3d/${item.id}`)
        const data = await jsonOrNull(res)
        if (res.ok && data?.job) {
          const fresh = data.job as Blocos3DJobView
          setJob(cur => (cur?.id === item.id ? fresh : cur))
        }
      } catch {
        // O painel de carregamento segue até uma nova seleção.
      }
    }
  }

  const glbUrl = job?.status === 'completed' ? job.modelUrls.glb ?? null : null

  // ── Slot de upload ─────────────────────────────────────────────────────────

  function renderSlot(pos: ViewPosition, boxStyle: React.CSSProperties) {
    const preview = slotPreviews[pos]
    const isFront = pos === 'front'
    const isDrag  = dragSlot === pos
    return (
      <div key={pos}
        role="button"
        tabIndex={0}
        onClick={() => openPicker(pos)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(pos) } }}
        onDragOver={(e) => { e.preventDefault(); setDragSlot(pos) }}
        onDragLeave={() => setDragSlot(null)}
        onDrop={(e) => { e.preventDefault(); setDragSlot(null); const f = e.dataTransfer.files[0]; if (f) loadImageFile(f, pos) }}
        style={{
          position: 'relative',
          border: `1px dashed ${isDrag ? 'var(--color-border-focus)' : 'var(--glass-line-strong)'}`,
          borderRadius: 'var(--r-inner)', overflow: 'hidden', cursor: 'pointer',
          background: isDrag ? 'var(--color-chip-hover)' : 'var(--color-chip)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 180ms var(--ease), background 180ms var(--ease)',
          ...boxStyle,
        }}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={VIEW_POSITION_LABEL[pos]}
                 style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* O fundo vem inline de propósito: `.spn-icon-btn` zera o
                background e, sendo declarado depois no globals.css, venceria
                o `.spn-glass--raised`. Sobre foto o ✕ precisa de apoio. */}
            <button
              type="button"
              className="spn-icon-btn"
              onClick={(e) => { e.stopPropagation(); removeSlot(pos) }}
              aria-label={`Remover ${VIEW_POSITION_LABEL[pos]}`}
              style={{
                position: 'absolute', top: 5, right: 5, width: 20, height: 20, flex: '0 0 20px',
                background: 'color-mix(in srgb, var(--color-bg) 78%, transparent)',
                color: 'var(--color-text-primary)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   style={{ width: 10, height: 10 }}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <span style={{ display: 'flex', color: 'var(--color-text-quaternary)' }}>
              <CubeGlyph size={isFront ? 22 : 14} strokeWidth={isFront ? 1.5 : 1.3} />
            </span>
            {isFront && (
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 7 }}>
                Arraste ou clique — até {BLOCOS3D_SOURCE_MAX_MB} MB
              </span>
            )}
          </>
        )}
        <span style={{
          position: 'absolute', left: 6, bottom: 5,
          fontSize: 8.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: preview ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          background: preview ? 'color-mix(in srgb, var(--color-bg) 72%, transparent)' : 'transparent',
          padding: preview ? '2px 6px' : 0, borderRadius: 5,
        }}>
          {VIEW_POSITION_LABEL[pos]}{isFront ? '' : ' · opcional'}
        </span>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="spn-tool">
      <style>{'@keyframes spnSpin { to { transform: rotate(360deg) } }'}</style>

      {/* ── Painel ─────────────────────────────────────────────────────────── */}
      <div className="spn-tool-panel spn-glass spn-glass--chrome">
        <header style={{ flex: '0 0 auto', padding: '15px 16px 12px', borderBottom: '0.5px solid var(--glass-line)' }}>
          <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
            Blocos 3D
          </h1>
          <p className="spn-hint" style={{ marginTop: 5 }}>
            Fotos de um objeto viram um modelo 3D pronto para suas cenas e maquetes.
          </p>
        </header>

        <div className="spn-tool-panel-body">
          {/* Os ângulos são o trabalho: ficam na superfície, e sem a frente o
              CTA não liga. */}
          <div className="spn-field">
            <span className="spn-field-label">Ângulos do objeto</span>

            {renderSlot('front', { width: '100%', height: 128, marginBottom: 7 })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
              {(['left', 'back', 'right'] as ViewPosition[]).map(pos => renderSlot(pos, { height: 72 }))}
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f, activeSlotRef.current); e.target.value = '' }} />

            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span className="spn-hint" style={{ marginTop: 0 }}>
                {imageCount === 0 ? 'A frente é obrigatória' : imageCount === 1 ? '1 ângulo' : `${imageCount} ângulos`}
                {imageCount >= 1 && ' · mais ângulos, mais fidelidade'}
              </span>
              {imageCount > 0 && (
                <button type="button" className="spn-ghost" style={{ height: 28, flex: '0 0 auto' }} onClick={resetInput}>
                  Limpar
                </button>
              )}
            </div>

            <p className="spn-hint">
              Funciona melhor com um objeto único em destaque — mobiliário, luminária, elemento de
              fachada — sobre fundo limpo.
            </p>
          </div>

          <SettingGroup>
            <SettingRow icon={<RowIcon name="output" />} title="Saída"
                        value={summarize([engine.label, `${nodeCost} nodes`, formatMinutes(engine.estimatedMs)])}
                        onOpen={() => setSheet('saida')} />
            {/* A linha de materiais só existe onde o motor a entende — uma
                linha desabilitada seria ruído com cara de bug. */}
            {engine.supportsTexturePrompt ? (
              <SettingRow icon={<RowIcon name="materials" />} title="Materiais"
                          value={summarize([texturePrompt.trim()])}
                          onOpen={() => setSheet('materiais')} />
            ) : null}
          </SettingGroup>

          {error ? <div className="spn-error" style={{ marginTop: 14 }}>{error}</div> : null}
        </div>

        <div className="spn-dock spn-glass spn-glass--chrome">
          <div className="spn-cost">
            <div className="spn-cost-figures">
              <div className="spn-cost-main">{nodeCost} nodes · {formatMinutes(engine.estimatedMs)}</div>
              <div className="spn-cost-sub" style={credits < nodeCost ? { color: 'var(--color-error)' } : undefined}>
                Saldo {credits}
              </div>
            </div>
            <button type="button" className="spn-cta" onClick={handleSubmit} disabled={!canSubmit}>
              {isGenerating ? 'Gerando…' : credits < nodeCost ? 'Saldo insuficiente' : 'Gerar bloco'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Palco + histórico ──────────────────────────────────────────────── */}
      <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Sem .spn-glass aqui: o viewer repinta em rAF (ver o topo do arquivo). */}
        <div className="spn-tool-stage" style={{ flex: 1 }}>

          {job?.status === 'processing' && <ProcessingPanel job={job} />}

          {/* Concluído aguardando URLs do detalhe (seleção vinda da listagem) */}
          {job?.status === 'completed' && !glbUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 30, height: 30, borderRadius: '50%',
                border: '2px solid var(--glass-line-strong)',
                borderTopColor: 'var(--color-text-secondary)',
                animation: 'spnSpin 0.9s linear infinite',
              }} />
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Abrindo o bloco…</span>
            </div>
          )}

          {/* Resultado */}
          {job?.status === 'completed' && glbUrl && (
            <div style={{
              alignSelf: 'stretch', flex: 1, minHeight: 0,
              display: 'flex', flexDirection: 'column', gap: 12, padding: 12,
            }}>
              <div style={{
                flex: 1, minHeight: 0, borderRadius: 'var(--r-card)', overflow: 'hidden',
                border: '0.5px solid var(--glass-line)',
                background: 'radial-gradient(120% 120% at 50% 0%, var(--color-bg-elevated) 0%, var(--color-bg) 100%)',
              }}>
                <GlbViewer url={glbUrl} />
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, flexWrap: 'wrap', flexShrink: 0,
              }}>
                <span className="spn-hint" style={{ marginTop: 0 }}>
                  Arraste para orbitar · scroll para zoom · {BLOCOS3D_ENGINES[job.quality]?.label ?? ''}
                </span>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {FORMAT_ORDER.filter(f => job.modelUrls[f]).map(f => (
                    <button key={f} type="button" className="spn-ghost"
                            onClick={() => handleDownload(f)} disabled={downloading !== null}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <DownloadIcon />
                      {downloading === f ? 'Baixando…' : FORMAT_LABEL[f]}
                    </button>
                  ))}
                  <button type="button" className="spn-ghost"
                          onClick={() => { setJob(null); resetInput() }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Novo bloco
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Falha */}
          {job?.status === 'failed' && (
            <div className="spn-glass" style={{
              borderRadius: 'var(--r-card)', padding: '22px 24px', maxWidth: 360,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
            }}>
              <div className="spn-error">
                {job.errorMessage ?? 'Falha no processamento.'} Os nodes foram estornados — tente de novo
                com outras fotos ou outra qualidade.
              </div>
              <button type="button" className="spn-ghost" onClick={() => setJob(null)}>Tentar de novo</button>
            </div>
          )}

          {/* Vazio */}
          {!job && (
            <div className="spn-empty" style={{ maxWidth: 340 }}>
              O bloco 3D aparece aqui.
              <br />
              Envie até 4 ângulos de um objeto — GLB sempre, todos os formatos no Premium.
            </div>
          )}
        </div>

        {/* Histórico do módulo */}
        {history.length > 0 && (
          <div className="spn-glass" style={{ flex: '0 0 auto', borderRadius: 'var(--r-card)', padding: '11px 14px 13px' }}>
            <span className="spn-field-label">Blocos recentes</span>
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
              {history.map(item => {
                const thumb = item.thumbnailUrl ?? item.inputUrl
                const isActive = job?.id === item.id
                return (
                  <button key={item.id} type="button" onClick={() => selectHistoryJob(item)}
                    title={item.status === 'failed' ? 'Falhou (estornado)' : item.status === 'processing' ? 'Gerando…' : 'Ver bloco'}
                    style={{
                      position: 'relative', width: 60, height: 60, flexShrink: 0,
                      borderRadius: 10, overflow: 'hidden', padding: 0,
                      border: `1px solid ${isActive ? 'var(--color-border-focus)' : 'var(--glass-line)'}`,
                      background: 'var(--color-chip)', cursor: 'pointer',
                      opacity: item.status === 'failed' ? 0.45 : 1,
                      transition: 'border-color 180ms var(--ease)',
                    }}
                  >
                    {thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{
                        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: 'var(--color-text-quaternary)',
                      }}>
                        <CubeGlyph size={20} strokeWidth={1.2} />
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--color-scrim)',
                      }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: '50%',
                          border: '1.5px solid var(--glass-line-strong)',
                          borderTopColor: '#f5f5f7',
                          animation: 'spnSpin 0.9s linear infinite',
                        }} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Folhas ─────────────────────────────────────────────────────────── */}
      <Sheet open={sheet === 'saida'} title="Saída" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Motor</span>
          <ChoiceGroup
            label="Motor"
            cols={3}
            value={quality}
            onChange={setQuality}
            options={BLOCOS3D_QUALITY_ORDER.map(q => ({
              value:    q,
              title:    BLOCOS3D_ENGINES[q].label,
              note:     `${BLOCOS3D_ENGINES[q].costInNodes} nodes · ${formatMinutes(BLOCOS3D_ENGINES[q].estimatedMs)}`,
              disabled: !engineAvailability[q],
            }))}
          />
          <p className="spn-hint">{engine.description}</p>
        </div>
        <div className="spn-field">
          <span className="spn-field-label">O que o {engine.label} entrega</span>
          <div className="spn-pills">
            {[...engine.formats, ...engine.features].map(tag => (
              <span key={tag} className="spn-pill" style={{ cursor: 'default' }}>{tag}</span>
            ))}
          </div>
          {BLOCOS3D_QUALITY_ORDER.some(q => !engineAvailability[q]) ? (
            <p className="spn-hint">Um motor apagado está indisponível agora — os outros seguem gerando.</p>
          ) : null}
        </div>
      </Sheet>

      <Sheet open={sheet === 'materiais'} title="Materiais" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Descrição dos materiais</span>
          <textarea
            className="spn-textarea"
            value={texturePrompt}
            onChange={e => setTexturePrompt(e.target.value.slice(0, TEXTURE_PROMPT_MAX_LEN))}
            placeholder="Em inglês — ex.: cream boucle fabric, soft nubby wool texture, visible weave detail"
          />
          <p className="spn-hint">
            Guia a texturização do modelo. Em branco, o motor segue fielmente as fotos.
          </p>
        </div>
      </Sheet>
    </div>
  )
}
