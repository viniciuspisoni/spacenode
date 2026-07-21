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
//
// Progresso: os motores fal não reportam % — quando o job vem com progress 0,
// a barra é sintetizada pela estimativa do motor (capada em 92%).

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import { jsonOrNull, errMsg } from '@/lib/http/fetch-json'
import { urlToFile } from '@/lib/http/url-to-file'
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, animation: 'fadeIn 0.2s ease' }}>
      {job.inputUrl && (
        <img src={job.inputUrl} alt="origem"
          style={{ width: 130, height: 130, objectFit: 'cover', borderRadius: 12, border: '0.5px solid var(--color-border)', opacity: 0.85 }} />
      )}
      <div style={{ width: 260 }}>
        <div style={{ height: 3, borderRadius: 99, background: 'var(--color-surface-hover)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: 'var(--color-text-primary)',
            width: `${Math.max(4, shownProgress)}%`, transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{progressLabel(shownProgress)}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{shownProgress}%</span>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.6, maxWidth: 300 }}>
        A geração leva {formatMinutes(BLOCOS3D_ENGINES[job.quality]?.estimatedMs ?? 150_000)}. Pode navegar pelo app — o bloco continua sendo gerado e fica no histórico.
      </div>
    </div>
  )
}

type SlotFiles    = Partial<Record<ViewPosition, File>>
type SlotPreviews = Partial<Record<ViewPosition, string>>

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

  function renderSlot(pos: ViewPosition, style: React.CSSProperties) {
    const preview = slotPreviews[pos]
    const isFront = pos === 'front'
    const isDrag  = dragSlot === pos
    return (
      <div key={pos}
        onClick={() => openPicker(pos)}
        onDragOver={(e) => { e.preventDefault(); setDragSlot(pos) }}
        onDragLeave={() => setDragSlot(null)}
        onDrop={(e) => { e.preventDefault(); setDragSlot(null); const f = e.dataTransfer.files[0]; if (f) loadImageFile(f, pos) }}
        style={{
          position: 'relative',
          border: `1.5px dashed ${isDrag ? 'var(--color-border-focus)' : preview ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
          borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
          background: isDrag ? 'var(--color-surface)' : 'var(--color-upload-area)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.15s',
          ...style,
        }}
      >
        {preview ? (
          <>
            <img src={preview} alt={VIEW_POSITION_LABEL[pos]} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              onClick={(e) => { e.stopPropagation(); removeSlot(pos) }}
              title="Remover"
              style={{
                position: 'absolute', top: 5, right: 5, width: 18, height: 18,
                borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'color-mix(in srgb, var(--color-bg) 78%, transparent)',
                color: 'var(--color-text-secondary)', fontSize: 10, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span style={{ display: 'flex', color: 'var(--color-text-quaternary)' }}>
              <CubeGlyph size={isFront ? 22 : 14} strokeWidth={isFront ? 1.5 : 1.3} />
            </span>
            {isFront && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                Arraste ou clique — até {BLOCOS3D_SOURCE_MAX_MB} MB
              </span>
            )}
          </>
        )}
        <span style={{
          position: 'absolute', left: 6, bottom: 5,
          fontSize: 8.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
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
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Painel esquerdo ─────────────────────────────────────────────────── */}
      <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid var(--color-border)', overflow: 'hidden' }}>

        <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Blocos 3D</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>
            Transforme fotos de um objeto em um modelo 3D pronto para suas cenas e maquetes.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload multiview */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 10 }}>
              Ângulos do objeto
            </label>

            {renderSlot('front', { width: '100%', height: 128, marginBottom: 8 })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {(['left', 'back', 'right'] as ViewPosition[]).map(pos => renderSlot(pos, { height: 72 }))}
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f, activeSlotRef.current); e.target.value = '' }} />

            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                {imageCount === 0 ? 'A frente é obrigatória' : imageCount === 1 ? '1 ângulo' : `${imageCount} ângulos`}
                {imageCount >= 1 && ' · mais ângulos = mais fidelidade'}
              </span>
              {imageCount > 0 && (
                <button onClick={resetInput}
                  style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Limpar tudo
                </button>
              )}
            </div>

            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
              Funciona melhor com um objeto único em destaque — mobiliário, luminária, elemento de fachada — sobre fundo limpo.
            </div>
          </div>

          {/* Qualidade / motor */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 10 }}>
              Qualidade
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {BLOCOS3D_QUALITY_ORDER.map(q => {
                const e = BLOCOS3D_ENGINES[q]
                const available = engineAvailability[q]
                const isSelected = quality === q && available
                return (
                  <button key={q} onClick={() => available && setQuality(q)} disabled={!available}
                    title={available ? undefined : 'Indisponível no momento'}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: `1px solid ${isSelected ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                      background: isSelected ? 'var(--color-surface)' : 'transparent',
                      cursor: available ? 'pointer' : 'not-allowed', textAlign: 'left', width: '100%',
                      opacity: available ? 1 : 0.45,
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-quaternary)', transition: 'background 0.15s' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>{e.label}</span>
                        {e.badge && (
                          <span style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                            color: e.badge.tone === 'green' ? 'var(--color-accent-green)' : 'var(--color-text-tertiary)',
                            background: e.badge.tone === 'green' ? 'var(--color-accent-green-bg)' : 'var(--color-chip)',
                            border: e.badge.tone === 'green' ? '1px solid var(--color-accent-green-border)' : '1px solid var(--color-border)',
                            padding: '1px 5px', borderRadius: 20,
                          }}>
                            {e.badge.label}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.45 }}>{e.description}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' as const }}>
                        {[...e.formats, ...e.features].map(tag => (
                          <span key={tag} style={{
                            fontSize: 9.5, color: 'var(--color-text-secondary)',
                            background: 'var(--color-chip)', border: '1px solid var(--color-border-strong)',
                            padding: '2px 7px', borderRadius: 5, letterSpacing: '0.02em', whiteSpace: 'nowrap' as const,
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{e.costInNodes}</div>
                      <div style={{ fontSize: 8, color: 'var(--color-text-quaternary)', letterSpacing: '0.06em' }}>NODES</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Prompt de materiais (só em motor que suporta) */}
          {engine.supportsTexturePrompt && (
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 10 }}>
                Materiais (opcional)
              </label>
              <textarea
                value={texturePrompt}
                onChange={e => setTexturePrompt(e.target.value.slice(0, TEXTURE_PROMPT_MAX_LEN))}
                placeholder="Descreva os materiais em inglês — ex: cream boucle fabric, soft nubby wool texture, visible weave detail"
                rows={2}
                style={{
                  width: '100%', resize: 'vertical', minHeight: 52, maxHeight: 120,
                  padding: '9px 11px', borderRadius: 8,
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                Guia a texturização do modelo. Deixe vazio para seguir fielmente as fotos.
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-error-bg)', border: '0.5px solid var(--color-error-border)', fontSize: 11, color: 'var(--color-error)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div style={{ padding: '16px 24px', borderTop: '0.5px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Custo: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{nodeCost} Nodes</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}> · {formatMinutes(engine.estimatedMs)}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Saldo: <span style={{ color: credits > 0 ? 'var(--color-text-primary)' : 'var(--color-error)', fontWeight: 600 }}>{credits} Nodes</span>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
              background: canSubmit ? 'var(--color-inverse)' : 'var(--color-surface-hover)',
              color: canSubmit ? 'var(--color-inverse-foreground)' : 'var(--color-text-quaternary)',
              fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, color 0.15s', letterSpacing: '-0.01em',
            }}
          >
            {isGenerating ? 'Gerando bloco…' : credits < nodeCost ? 'Sem Nodes' : 'Gerar Bloco 3D'}
          </button>
        </div>
      </div>

      {/* ── Painel direito ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', padding: 32 }}>

          {/* Em processamento */}
          {job?.status === 'processing' && <ProcessingPanel job={job} />}

          {/* Concluído aguardando URLs do detalhe (seleção vinda da listagem) */}
          {job?.status === 'completed' && !glbUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--color-border-strong)', borderTop: '2px solid var(--color-text-secondary)', animation: 'spin 0.9s linear infinite' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Abrindo o bloco…</span>
            </div>
          )}

          {/* Resultado */}
          {job?.status === 'completed' && glbUrl && (
            <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.3s ease' }}>
              <div style={{
                flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden',
                border: '0.5px solid var(--color-border)',
                background: 'radial-gradient(120% 120% at 50% 0%, var(--color-bg-elevated) 0%, var(--color-bg) 100%)',
              }}>
                <GlbViewer url={glbUrl} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const, flexShrink: 0 }}>
                <div style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
                  Arraste para orbitar · scroll para zoom · {BLOCOS3D_ENGINES[job.quality]?.label ?? ''}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {FORMAT_ORDER.filter(f => job.modelUrls[f]).map(f => (
                    <button key={f} onClick={() => handleDownload(f)} disabled={downloading !== null}
                      style={{
                        fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
                        border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)',
                        cursor: downloading ? 'wait' : 'pointer',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      {downloading === f ? 'Baixando…' : FORMAT_LABEL[f]}
                    </button>
                  ))}
                  <button onClick={() => { setJob(null); resetInput() }}
                    style={{
                      fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
                      border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', cursor: 'pointer',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Novo bloco
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Falha */}
          {job?.status === 'failed' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, animation: 'fadeIn 0.2s ease' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-error-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 8v5M12 16.5v.01"/>
                  <circle cx="12" cy="12" r="9"/>
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>A geração não foi concluída</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 5, maxWidth: 320, lineHeight: 1.5 }}>
                  {job.errorMessage ?? 'Falha no processamento.'} Os nodes foram estornados — tente novamente com outras fotos ou qualidade.
                </div>
              </div>
              <button onClick={() => setJob(null)}
                style={{
                  fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
                  padding: '7px 14px', borderRadius: 6,
                  border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Vazio */}
          {!job && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: 'fadeIn 0.2s ease' }}>
              <div style={{ opacity: 0.16 }}>
                <CubeGlyph size={56} strokeWidth={0.8} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500, letterSpacing: '-0.01em' }}>O bloco 3D aparecerá aqui</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 5, lineHeight: 1.5, maxWidth: 300 }}>
                  Envie até 4 ângulos de um objeto para gerar um modelo 3D navegável — download em GLB, e todos os formatos no Premium.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Histórico do módulo */}
        {history.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--color-border)', padding: '12px 24px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              Blocos recentes
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {history.map(item => {
                const thumb = item.thumbnailUrl ?? item.inputUrl
                const isActive = job?.id === item.id
                return (
                  <button key={item.id} onClick={() => selectHistoryJob(item)}
                    title={item.status === 'failed' ? 'Falhou (estornado)' : item.status === 'processing' ? 'Gerando…' : 'Ver bloco'}
                    style={{
                      position: 'relative', width: 64, height: 64, flexShrink: 0,
                      borderRadius: 9, overflow: 'hidden', padding: 0,
                      border: `1.5px solid ${isActive ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                      background: 'var(--color-surface)', cursor: 'pointer',
                      opacity: item.status === 'failed' ? 0.45 : 1,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-quaternary)' }}>
                        <CubeGlyph size={20} strokeWidth={1.2} />
                      </div>
                    )}
                    {item.status === 'processing' && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-bg) 55%, transparent)' }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--color-border-strong)', borderTop: '1.5px solid var(--color-text-primary)', animation: 'spin 0.9s linear infinite' }} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
