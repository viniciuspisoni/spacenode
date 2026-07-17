'use client'

// Blocos 3D — client do módulo (imagem → modelo 3D).
//
// Fluxo: upload direto pro Storage (área blocos3d-source, binário não passa
// pela Vercel) → POST /api/blocos3d cria o job e debita → polling em
// GET /api/blocos3d/[jobId] até completed/failed → viewer 3D + downloads.
// Ao montar, adota o job processing mais recente (a geração sobrevive a
// reload/troca de página).
//
// Progresso: Meshy reporta % real; os motores fal não — quando o job vem com
// progress 0, a barra é sintetizada pela estimativa do motor (capada em 92%).

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { RetocarImportModal } from '@/components/spaces/RetocarImportModal'
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
} from '@/lib/blocos3d/config'
import type { Blocos3DJobView, Blocos3DQuality, ModelFormat } from '@/lib/blocos3d/types'

const GlbViewer = dynamic(() => import('./GlbViewer'), { ssr: false })

const POLL_INTERVAL_MS = 5000

const FORMAT_LABEL: Record<ModelFormat, string> = {
  glb:  'GLB',
  fbx:  'FBX',
  obj:  'OBJ',
  usdz: 'USDZ',
}
const FORMAT_ORDER: ModelFormat[] = ['glb', 'fbx', 'obj', 'usdz']

function progressLabel(progress: number, quality: Blocos3DQuality): string {
  if (progress < 15) return 'Analisando a imagem…'
  if (progress < 45) return 'Gerando a geometria…'
  if (progress < 70) return 'Refinando a malha…'
  if (progress < 95) return quality === 'draft' ? 'Otimizando o modelo…' : 'Aplicando texturas…'
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
  const estimated = BLOCOS3D_ENGINES[job.quality]?.estimatedMs ?? 120_000
  const elapsed = now - new Date(job.createdAt).getTime()
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 2
  return Math.min(92, Math.round((elapsed / estimated) * 100))
}

/** Glifo do módulo (cubo) — um só desenho pro dropzone, empty state e
 *  fallback do histórico. */
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
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{progressLabel(shownProgress, job.quality)}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>{shownProgress}%</span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', textAlign: 'center', lineHeight: 1.6, maxWidth: 300 }}>
        A geração leva {formatMinutes(BLOCOS3D_ENGINES[job.quality]?.estimatedMs ?? 120_000)}. Pode navegar pelo app — o bloco continua sendo gerado e fica no histórico.
      </div>
    </div>
  )
}

interface Blocos3DClientProps {
  initialCredits: number
  /** Disponibilidade real por tier (server checa as keys dos providers). */
  engineAvailability: Record<Blocos3DQuality, boolean>
}

export default function Blocos3DClient({ initialCredits, engineAvailability }: Blocos3DClientProps) {
  // Entrada
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging,   setIsDragging]   = useState(false)

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

  const [showImportModal, setShowImportModal] = useState(false)
  const [isImporting,     setIsImporting]     = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  const engine   = BLOCOS3D_ENGINES[quality]
  const nodeCost = engine.costInNodes
  const isGenerating = isSubmitting || job?.status === 'processing'
  const canSubmit = !!imageFile && credits >= nodeCost && !isGenerating && engineAvailability[quality]

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
      const jobs = await refreshHistory()
      if (cancelled) return
      // Retomada: adota o processing mais recente (só se nada selecionado).
      const processing = jobs.find(j => j.status === 'processing')
      if (processing) setJob(cur => cur ?? processing)
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [refreshHistory])

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

  // ── Entrada de imagem ──────────────────────────────────────────────────────

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Arquivo deve ser uma imagem.'); return }
    if (file.size > BLOCOS3D_SOURCE_MAX_BYTES) { setError(`Imagem muito grande. Máximo ${BLOCOS3D_SOURCE_MAX_MB} MB.`); return }
    setImageFile(file)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview((e.target?.result as string) ?? null)
    reader.readAsDataURL(file)
  }

  function resetInput() {
    setImageFile(null)
    setImagePreview(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImportPick(picked: { url: string }) {
    setShowImportModal(false)
    setIsImporting(true)
    setError(null)
    try {
      loadImageFile(await urlToFile(picked.url))
    } catch {
      setError('Não foi possível importar a imagem do histórico.')
    } finally {
      setIsImporting(false)
    }
  }

  // ── Submissão ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!imageFile || !canSubmit) return
    setIsSubmitting(true)
    setError(null)
    try {
      const { key: sourceKey } = await uploadDirect(imageFile, 'blocos3d-source', {}, { confirm: false })

      const res = await fetch('/api/blocos3d', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceKey,
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
        inputUrl:     imagePreview,
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
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
            Transforme uma imagem em um modelo 3D pronto para suas cenas e maquetes.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Upload */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 10 }}>
              Imagem de referência
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) loadImageFile(f) }}
              style={{
                border: `1.5px dashed ${isDragging ? 'var(--color-border-focus)' : 'var(--color-border-strong)'}`,
                borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                transition: 'border-color 0.15s',
                background: isDragging ? 'var(--color-surface)' : 'var(--color-upload-area)',
                minHeight: imageFile ? 0 : 120,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: imageFile ? 0 : '28px 20px',
              }}
            >
              {imageFile && imagePreview ? (
                <img src={imagePreview} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
              ) : (
                <>
                  <span style={{ display: 'flex', color: 'var(--color-text-quaternary)' }}>
                    <CubeGlyph size={24} />
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10 }}>Arraste ou clique para enviar</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 4 }}>PNG, JPG, WEBP — até {BLOCOS3D_SOURCE_MAX_MB} MB</span>
                </>
              )}
            </div>

            {imageFile && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 240 }}>{imageFile.name}</span>
                <button onClick={(e) => { e.stopPropagation(); resetInput() }}
                  style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  Trocar imagem
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFile(f) }} />

            <button
              onClick={() => setShowImportModal(true)}
              disabled={isImporting}
              style={{
                marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 7,
                border: '1px solid var(--color-border)', background: 'transparent',
                fontSize: 11, color: 'var(--color-text-tertiary)',
                cursor: isImporting ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 7v5l3 3"/>
              </svg>
              {isImporting ? 'Importando…' : 'Importar do histórico'}
            </button>
            <div style={{ fontSize: 9, color: 'var(--color-text-quaternary)', marginTop: 8, lineHeight: 1.5 }}>
              Funciona melhor com um objeto único em destaque — mobiliário, luminária, elemento de fachada — sobre fundo limpo.
            </div>
          </div>

          {/* Qualidade / motor */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 10 }}>
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
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{e.description}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' as const }}>
                        {[...e.formats, ...e.features].map(tag => (
                          <span key={tag} style={{
                            fontSize: 8.5, color: 'var(--color-text-tertiary)',
                            background: 'var(--color-chip)', border: '1px solid var(--color-border)',
                            padding: '1.5px 6px', borderRadius: 5, letterSpacing: '0.02em', whiteSpace: 'nowrap' as const,
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
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 10 }}>
                Materiais (opcional)
              </label>
              <textarea
                value={texturePrompt}
                onChange={e => setTexturePrompt(e.target.value.slice(0, TEXTURE_PROMPT_MAX_LEN))}
                placeholder="Descreva os materiais em inglês — ex: brushed brass frame, walnut wood top, matte black leather seat"
                rows={2}
                style={{
                  width: '100%', resize: 'vertical', minHeight: 52, maxHeight: 120,
                  padding: '9px 11px', borderRadius: 8,
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 9, color: 'var(--color-text-quaternary)', marginTop: 4 }}>
                Guia a texturização do modelo. Deixe vazio para seguir fielmente a imagem.
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
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Custo: <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{nodeCost} Nodes</span>
              <span style={{ color: 'var(--color-text-quaternary)' }}> · {formatMinutes(engine.estimatedMs)}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Saldo: <span style={{ color: credits > 0 ? 'var(--color-text-secondary)' : 'var(--color-error)', fontWeight: 500 }}>{credits} Nodes</span>
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
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em' }}>
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
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 5, maxWidth: 320, lineHeight: 1.5 }}>
                  {job.errorMessage ?? 'Falha no processamento.'} Os nodes foram estornados — tente novamente com outra imagem ou qualidade.
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
                <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500, letterSpacing: '-0.01em' }}>O bloco 3D aparecerá aqui</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 5, lineHeight: 1.5, maxWidth: 300 }}>
                  Envie a imagem de um objeto para gerar um modelo 3D navegável, com download em GLB — e FBX, OBJ e USDZ na qualidade Alta.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Histórico do módulo */}
        {history.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--color-border)', padding: '12px 24px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
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

      {showImportModal && (
        <RetocarImportModal
          title="Importar imagem"
          onClose={() => setShowImportModal(false)}
          onPick={handleImportPick}
        />
      )}
    </div>
  )
}
