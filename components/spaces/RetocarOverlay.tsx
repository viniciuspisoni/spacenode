'use client'

// Overlay full-screen do modo embebido da Retocar (dentro do Spaces).
//
// Mostra canvas + painel lateral com DNA ativo + Vista Mestre como thumbnail.
// Difere do standalone: prompt simplificado, contexto enriquecido server-side,
// cria nova vista no Space (com is_edited + parent_vista_id + edit_chain_root_id).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RetocarCanvas, type RetocarCanvasHandle, BRUSH_MIN, BRUSH_MAX } from './RetocarCanvas'
import { RetocarModeTabs } from './RetocarModeTabs'
import { LARGE_MASK_THRESHOLD } from '@/lib/spaces/edit-economy'
import type { Quality, Space, Vista, ProjectDNA, EditSourceType } from '@/lib/spaces/types'
import { EDIT_MODE_LABELS, type EditMode } from '@/lib/spaces/engines'
import { MAX_EDIT_REFERENCES, SURFACE_SEGMENTATION_ENABLED, type EditReferenceImage, type EditReferenceRole } from '@/lib/spaces/edit-router'
import { ReferencesPanel, suggestPromptForRole, type RefMenuKind } from './RetocarReferences'
import { ReferenceFocusModal, type NormCrop } from './ReferenceFocusModal'
import { RetocarImportModal } from './RetocarImportModal'

// Debug: mostra a imagem REJEITADA pelo quality gate (sem salvar) pra julgar se
// foi catastrófica ou um resultado aceitável. Só dev/staging.
const SHOW_REJECTED_DEBUG =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_EDIT_DEBUG === '1'

interface Props {
  space:    Space
  vista:    Vista
  dna:      ProjectDNA | null
  balance:  number
  onClose:  () => void
}

export function RetocarOverlay({ space, vista, dna, balance, onClose }: Props) {
  const router = useRouter()
  const canvasRef = useRef<RetocarCanvasHandle | null>(null)

  const [brush, setBrush]           = useState(40)
  const [coverage, setCoverage]     = useState(0)
  const [prompt, setPrompt]         = useState('')
  const [quality, setQuality]       = useState<Quality>(vista.quality)
  // Edit intention. Same contract as RetocarStandaloneFlow.
  const [mode, setMode]             = useState<EditMode>('material')
  const [submitting, setSubmitting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [showMestreLightbox, setShowMestreLightbox] = useState(false)
  const [resultUrl, setResultUrl]   = useState<string | null>(null)
  const [resultVistaId, setResultVistaId] = useState<string | null>(null)
  const [driftWarning, setDriftWarning] = useState<number | null>(null)
  const [stage, setStage]           = useState<'editing' | 'result'>('editing')
  // editRouter v1: pricing/preview + premium + referências (paridade com standalone).
  const [premium, setPremium]           = useState(false)
  const [routePreview, setRoutePreview] = useState<{ costNodes: number; isFreeFix: boolean; label: string; explanation: string } | null>(null)
  const [qualityGate, setQualityGate]   = useState<{ message: string; resultUrl?: string; drift?: number } | null>(null)
  // Camada de SUPERFÍCIE (Fase 1): confirmação antes de aplicar na superfície inteira.
  const [segmenting, setSegmenting]     = useState(false)
  const [segConfirm, setSegConfirm]     = useState<
    { previewUrl: string; surfaceMaskUrl: string; blobMaskUrl: string; surfaceCoverage: number; blobCoverage: number; surfaceCost: number } | null
  >(null)
  const [references, setReferences]     = useState<EditReferenceImage[]>([])
  const [refPicker, setRefPicker]       = useState<{ role: EditReferenceRole } | null>(null)
  const [refFocus, setRefFocus]         = useState<
    { url: string; role: EditReferenceRole; sourceType: EditSourceType; sourceId: string | null } | null
  >(null)
  const pendingUploadRoleRef            = useRef<EditReferenceRole | null>(null)
  const refFileInputRef                 = useRef<HTMLInputElement | null>(null)

  const cost        = routePreview?.costNodes ?? 0
  const balanceShort = !routePreview?.isFreeFix && balance < cost
  const largeMask    = coverage > LARGE_MASK_THRESHOLD
  const modeMeta    = EDIT_MODE_LABELS[mode]
  const isRemove    = mode === 'remove'
  const disabledBtn = coverage === 0 || balanceShort || submitting || (!isRemove && !prompt.trim())

  // Papel "principal" da ferramenta atual (o engine consome references[0]); a
  // ordenação garante que a textura/objeto certo vá pra frente (item 4).
  const primaryRefRole: EditReferenceRole | null =
    mode === 'material' ? 'material_texture'
    : (mode === 'replace' || mode === 'add') ? 'object_reference'
    : null
  function payloadReferences() {
    const ordered = primaryRefRole
      ? [...references.filter(r => r.role === primaryRefRole), ...references.filter(r => r.role !== primaryRefRole)]
      : references
    return ordered.map(r => ({ url: r.url, role: r.role, source: r.source, note: r.note }))
  }

  // Preview de rota/custo (editRouter) — debounced. Source = a vista editada.
  useEffect(() => {
    if (stage !== 'editing') return
    const handle = setTimeout(async () => {
      if (coverage <= 0) { setRoutePreview(null); return }
      try {
        const res = await fetch('/api/edits/preview', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            has_mask:      true,
            mask_coverage: coverage,
            prompt:        mode === 'remove' ? '' : prompt.trim(),
            quality,
            source_type:   'vista',
            source_id:     vista.id,
            mode,
            premium,
            references:    references.map(r => ({ url: r.url, role: r.role, source: r.source, note: r.note })),
          }),
        })
        if (!res.ok) return
        const d = await res.json()
        setRoutePreview({ costNodes: d.cost_nodes ?? 0, isFreeFix: !!d.is_free_fix, label: d.label ?? '', explanation: d.explanation ?? '' })
      } catch { /* best-effort */ }
    }, 350)
    return () => clearTimeout(handle)
  }, [stage, coverage, prompt, quality, mode, premium, references, vista.id])

  async function handleGenerate() {
    if (!canvasRef.current?.hasMask()) {
      setError('Pinte a área que quer editar antes de gerar.')
      return
    }
    if (!isRemove && !prompt.trim()) {
      setError('Descreva o que você quer nessa área antes de gerar.')
      return
    }
    if (balanceShort) {
      setError(`Saldo insuficiente. Necessários ${cost} nodes.`)
      return
    }
    setError(null)
    setDriftWarning(null)
    setQualityGate(null)
    setSegConfirm(null)
    setSubmitting(true)

    // 1) Upload do blob pintado.
    let blobMaskUrl: string
    let maskCoverage: number
    try {
      const blob = await canvasRef.current.getMaskBlob()
      if (!blob) throw new Error('Falha ao gerar máscara')
      maskCoverage = canvasRef.current.getMaskCoverage()
      const fd = new FormData()
      fd.append('file', new File([blob], 'mask.png', { type: 'image/png' }))
      fd.append('kind', 'mask')
      const maskRes = await fetch('/api/edits/upload-asset', { method: 'POST', body: fd })
      const maskData = await maskRes.json()
      if (!maskRes.ok) throw new Error(maskData?.error ?? 'Erro ao salvar máscara')
      blobMaskUrl = maskData.url
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
      return
    }

    // 2) Camada de SUPERFÍCIE (Fase 1): só material. Segmenta e, se estender além
    //    do pintado, pede confirmação. Best-effort: qualquer falha cai no blob.
    if (SURFACE_SEGMENTATION_ENABLED && mode === 'material' && vista.image_url) {
      setSegmenting(true)
      try {
        const segRes = await fetch('/api/edits/segment', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ image_url: vista.image_url, mask_url: blobMaskUrl }),
        })
        if (segRes.ok) {
          const seg = await segRes.json()
          const extended = !seg.used_fallback && seg.surface_coverage > maskCoverage * 1.15
          if (extended) {
            let surfaceCost = cost
            try {
              const pv = await fetch('/api/edits/preview', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ has_mask: true, mask_coverage: seg.surface_coverage, prompt: prompt.trim(), quality, source_type: 'vista', source_id: vista.id, mode, premium, references: payloadReferences() }),
              })
              if (pv.ok) { const d = await pv.json(); surfaceCost = d.cost_nodes ?? cost }
            } catch { /* mantém o custo atual */ }
            setSegmenting(false)
            setSubmitting(false)
            setSegConfirm({ previewUrl: seg.preview_url, surfaceMaskUrl: seg.surface_mask_url, blobMaskUrl, surfaceCoverage: seg.surface_coverage, blobCoverage: maskCoverage, surfaceCost })
            return
          }
        }
      } catch { /* best-effort: cai no blob */ }
      setSegmenting(false)
    }

    // 3) Sem segmentação (ou não estendeu) → gera com o blob pintado.
    await runGenerate(blobMaskUrl, maskCoverage)
  }

  // Geração com a máscara escolhida (blob pintado OU superfície segmentada).
  async function runGenerate(maskUrl: string, maskCoverage: number) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/spaces/${space.id}/vistas/${vista.id}/edit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          mask_url:      maskUrl,
          prompt:        isRemove ? '' : prompt.trim(),
          quality,
          mask_coverage: maskCoverage,
          mode,
          premium,
          references:    payloadReferences(),
        }),
      })
      const data = await res.json()
      if (data?.rejected) {
        setQualityGate({ message: data.message ?? 'A edição não preservou bem a imagem.', resultUrl: data.result_url, drift: data.out_of_mask_delta })
        return
      }
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro na edição')
      }
      const newVista = data.vista as { id: string; image_url: string }
      setResultUrl(newVista.image_url)
      setResultVistaId(newVista.id)
      setValidating(true)
      try {
        const v = await canvasRef.current?.validateOutsideMaskPreservation(newVista.image_url)
        if (v && !v.ok) setDriftWarning(v.drift)
      } finally {
        setValidating(false)
      }
      setStage('result')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function confirmSurface() {
    if (!segConfirm) return
    const { surfaceMaskUrl, surfaceCoverage } = segConfirm
    setSegConfirm(null)
    void runGenerate(surfaceMaskUrl, surfaceCoverage)
  }
  function useBlobOnly() {
    if (!segConfirm) return
    const { blobMaskUrl, blobCoverage } = segConfirm
    setSegConfirm(null)
    void runGenerate(blobMaskUrl, blobCoverage)
  }

  function acceptAsVersion() {
    if (!resultVistaId) return
    // A nova vista já foi criada no backend. Redireciona pra detalhe dela.
    router.push(`/app/spaces/${space.id}/vistas/${resultVistaId}`)
  }

  function redoEdit() {
    setStage('editing')
    setResultUrl(null)
    setResultVistaId(null)
    setDriftWarning(null)
    setError(null)
    // Mantém máscara e prompt
  }

  // ── referências da edição ────────────────────────────────────
  // REGRA: 1 referência ATIVA por papel. Anexar uma nova textura/objeto do mesmo
  // papel SUBSTITUI a anterior (não acumula) — senão a antiga ficava em
  // references[0] e o engine usava ela silenciosamente (bug "textura antiga").
  function addReference(ref: EditReferenceImage) {
    setReferences(prev => {
      const sameRoleIdx = prev.findIndex(r => r.role === ref.role)
      if (sameRoleIdx >= 0) {
        const next = [...prev]
        next[sameRoleIdx] = ref           // substitui no mesmo lugar (preserva ordem)
        return next
      }
      if (prev.length >= MAX_EDIT_REFERENCES) return prev
      return [...prev, ref]
    })
    const s = suggestPromptForRole(ref.role)
    if (s && !isRemove) setPrompt(p => (p.trim() ? p : s))
  }
  function removeReference(id: string) { setReferences(prev => prev.filter(r => r.id !== id)) }
  function clearAllReferences() { setReferences([]) }

  function handleAddReferenceKind(kind: RefMenuKind) {
    setError(null)
    if (kind === 'original') {
      if (vista.image_url) addReference({ id: `original:${vista.image_url}`, url: vista.image_url, role: 'original_image', source: 'original' })
      return
    }
    if (kind === 'vista_mestre') {
      // Embebido já conhece a vista mestre — abre o foco direto nela.
      if (space.vista_mestre_url) setRefFocus({ url: space.vista_mestre_url, role: 'consistency_reference', sourceType: 'vista', sourceId: null })
      else setError('Este projeto não tem vista mestre.')
      return
    }
    if (kind === 'project_render') { setRefPicker({ role: 'project_render' }); return }
    pendingUploadRoleRef.current = kind === 'material' ? 'material_texture' : kind === 'object' ? 'object_reference' : 'custom'
    refFileInputRef.current?.click()
  }

  async function onRefFilePicked(file: File | null) {
    const role = pendingUploadRoleRef.current
    pendingUploadRoleRef.current = null
    if (!file || !role) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Formato de referência não suportado (JPG, PNG, WebP).'); return }
    if (file.size > 8 * 1024 * 1024) { setError('Referência maior que 8 MB.'); return }
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('role', role)
      const res = await fetch('/api/edits/references/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro ao enviar referência')
      addReference(data.reference as EditReferenceImage)
    } catch (e) { setError((e as Error).message) }
  }

  function onReferencePicked(picked: { url: string; type: EditSourceType; id: string | null }) {
    const role = refPicker?.role ?? 'project_render'
    setRefPicker(null)
    setRefFocus({ url: picked.url, role, sourceType: picked.type, sourceId: picked.id })
  }

  async function onFocusConfirm(crop: NormCrop | null) {
    const f = refFocus
    setRefFocus(null)
    if (!f) return
    try {
      if (crop) {
        const res = await fetch('/api/edits/references/crop', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_url: f.url, ...crop, role: f.role }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Erro ao recortar referência')
        addReference(data.reference as EditReferenceImage)
        return
      }
      if ((f.sourceType === 'render' || f.sourceType === 'vista') && f.sourceId) {
        const res = await fetch('/api/edits/references/from-project', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_id: f.sourceId, source_type: f.sourceType, role: f.role }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Erro ao usar imagem do projeto')
        addReference(data.reference as EditReferenceImage)
      } else {
        addReference({ id: `project:${f.url}`, url: f.url, role: f.role, source: 'project' })
      }
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10,10,10,0.96)', backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '0.5px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            Editar vista · {space.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {vista.axis_label ?? 'Vista'} · {vista.quality.toUpperCase()}
            {stage === 'result' && ' · Resultado'}
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
          border: '0.5px solid var(--color-border-strong)', cursor: 'pointer',
          fontSize: 18,
        }}>×</button>
      </header>

      {/* Body */}
      <div style={{
        flex: 1, padding: 18,
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 18,
        minHeight: 0,
      }}>
        {/* Canvas + prompt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          {stage === 'editing' && vista.image_url && (
            <>
              <div style={{ flex: 1, minHeight: 0 }}>
                <RetocarCanvas
                  ref={canvasRef}
                  imageUrl={vista.image_url}
                  onMaskChange={setCoverage}
                  brush={brush}
                  onBrushChange={setBrush}
                />
              </div>

              <div style={{
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--color-border)',
                borderRadius: 12, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <RetocarModeTabs mode={mode} onModeChange={setMode} disabled={submitting} />

                <div style={{
                  fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
                }}>
                  {modeMeta.description}
                </div>

                {(mode === 'material' || mode === 'replace' || mode === 'add') && (
                  <div style={{
                    fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.45,
                    padding: '8px 10px', borderRadius: 8,
                    background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
                  }}>
                    Pinte <strong>toda a superfície</strong> que deseja alterar (piso, parede…). O material é aplicado
                    exatamente na área pintada — então cubra a superfície inteira, sem deixar de fora cantos ou bordas.
                  </div>
                )}

                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={isRemove
                    ? 'Não precisa de prompt — o motor preenche com o entorno automaticamente.'
                    : `${modeMeta.promptPlaceholder} · O motor já conhece o estilo do projeto.`
                  }
                  rows={2}
                  disabled={isRemove}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--color-bg)',
                    border: '0.5px solid var(--color-border-strong)',
                    borderRadius: 8, color: 'var(--color-text-primary)',
                    fontSize: 13, letterSpacing: '-0.005em',
                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                    opacity: isRemove ? 0.55 : 1,
                    cursor: isRemove ? 'not-allowed' : 'text',
                  }}
                />
                {error && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
                    color: '#e57373', fontSize: 12,
                  }}>
                    {error}
                  </div>
                )}
                {qualityGate && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(186,117,23,0.12)', border: '0.5px solid rgba(186,117,23,0.35)',
                    color: '#e0a766', fontSize: 12, lineHeight: 1.5,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <span style={{ fontWeight: 500 }}>A edição foi rejeitada para preservar sua imagem.</span>
                    <span style={{ fontSize: 11, color: '#1D9E75' }}>Nenhum node foi consumido.</span>
                    {references.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        Dica: aumente um pouco a máscara ao redor do objeto para dar mais contexto.
                      </span>
                    )}
                    {qualityGate.resultUrl && SHOW_REJECTED_DEBUG && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: 'var(--color-text-quaternary)', letterSpacing: '0.04em' }}>
                          DEBUG · resultado rejeitado{qualityGate.drift != null ? ` · ${(qualityGate.drift * 100).toFixed(0)}% fora da máscara` : ''}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qualityGate.resultUrl} alt="rejeitado (debug)"
                          style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 6, border: '0.5px solid var(--color-border)' }} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      <button type="button" onClick={() => setQualityGate(null)} className="spn-action spn-action--ghost"
                        style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}>Tentar novamente</button>
                      <button type="button" onClick={() => { setPremium(true); setQualityGate(null) }} className="spn-action spn-action--ghost"
                        style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}>Tentar modo avançado</button>
                    </div>
                  </div>
                )}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {coverage > 0 ? <>área: {(coverage * 100).toFixed(1)}%</> : 'pinte a área a editar'}
                    {largeMask && <span style={{ color: '#e0a766', marginLeft: 10 }}>⚠ área grande</span>}
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={disabledBtn}
                    className="spn-action"
                    style={{
                      width: 'auto', minWidth: 200, padding: '11px 22px',
                      background: '#1D9E75', color: '#042818',
                      border: '0.5px solid rgba(0,0,0,0.18)',
                      opacity: disabledBtn ? 0.5 : 1,
                      boxShadow: !disabledBtn
                        ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)'
                        : 'none',
                    }}
                  >
                    {submitting
                      ? (segmenting ? 'Detectando superfície…' : validating ? 'Validando…' : 'Editando…')
                      : (routePreview?.label ?? `${modeMeta.label} →`)}
                  </button>
                </div>
              </div>
            </>
          )}

          {stage === 'result' && resultUrl && vista.image_url && (
            <ResultPane
              beforeUrl={vista.image_url}
              afterUrl={resultUrl}
              prompt={prompt}
              driftWarning={driftWarning}
              onAccept={acceptAsVersion}
              onRedo={redoEdit}
              onDiscard={onClose}
            />
          )}
        </div>

        {/* Painel lateral */}
        <aside style={{
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 12, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 14,
          alignSelf: 'start', overflowY: 'auto', maxHeight: '100%',
        }}>
          <PanelLabel>Ferramentas</PanelLabel>

          {stage === 'editing' && (
            <>
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Brush</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{brush}px</span>
                </div>
                <input
                  type="range" min={BRUSH_MIN} max={BRUSH_MAX} value={brush}
                  onChange={e => setBrush(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#1D9E75' }}
                />
              </div>

              <button onClick={() => canvasRef.current?.clearMask()}
                className="spn-action spn-action--ghost"
                style={{ width: '100%', padding: '8px 12px', fontSize: 11 }}>
                Limpar máscara
              </button>

              <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
                <PanelLabel>Qualidade</PanelLabel>
                <div style={{
                  display: 'flex', gap: 4, padding: 3, marginTop: 8,
                  background: 'var(--color-surface)', borderRadius: 8,
                }}>
                  {(['hd', '2k', '4k'] as Quality[]).map(q => {
                    const active = q === quality
                    return (
                      <button key={q} onClick={() => setQuality(q)}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: 6,
                          background: active ? 'var(--color-bg-elevated)' : 'transparent',
                          color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          fontSize: 11, fontWeight: 500,
                          cursor: 'pointer',
                          boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                        }}>
                        {q.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Modo premium */}
              <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PanelLabel>Qualidade premium</PanelLabel>
                <button
                  type="button"
                  onClick={() => setPremium(!premium)}
                  disabled={submitting}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 11px', borderRadius: 8,
                    background: premium ? 'rgba(29,158,117,0.12)' : 'var(--color-surface)',
                    border: premium ? '0.5px solid rgba(29,158,117,0.5)' : '0.5px solid var(--color-border-strong)',
                    color: 'var(--color-text-primary)', fontSize: 11.5, fontFamily: 'inherit',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span>Modelo premium</span>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', color: premium ? '#1D9E75' : 'var(--color-text-quaternary)' }}>
                    {premium ? 'ATIVADO' : 'DESATIVADO'}
                  </span>
                </button>
              </div>

              {/* Referências da edição */}
              <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
                <ReferencesPanel
                  references={references}
                  onAdd={handleAddReferenceKind}
                  onRemove={removeReference}
                  onClearAll={clearAllReferences}
                  primaryRole={primaryRefRole}
                  disabled={submitting}
                />
              </div>
            </>
          )}

          {/* DNA ativo */}
          {dna && (
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
              <PanelLabel>DNA ativo</PanelLabel>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.55 }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--color-text-quaternary)' }}>Estilo: </span>
                  {dna.estilo.nome}
                </div>
                {dna.materiais.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: 'var(--color-text-quaternary)' }}>Materiais: </span>
                    {dna.materiais.slice(0, 3).map(m => m.nome).join(', ')}
                  </div>
                )}
                {dna.paleta.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {dna.paleta.slice(0, 6).map((c, i) => (
                      <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '0.5px solid rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Vista Mestre como thumb */}
          {space.vista_mestre_url && (
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
              <PanelLabel>Referência</PanelLabel>
              <button
                onClick={() => setShowMestreLightbox(true)}
                style={{
                  width: '100%', padding: 0, marginTop: 8, cursor: 'pointer',
                  border: '0.5px solid var(--color-border-strong)', borderRadius: 8,
                  background: 'transparent', overflow: 'hidden',
                }}
              >
                <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={space.vista_mestre_url} alt="Vista Mestre"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </button>
              <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 6, textAlign: 'center', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                vista mestre · ver maior
              </div>
            </div>
          )}

          {stage === 'editing' && (
            <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Saldo: <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{balance}</span> nodes
            </div>
          )}
        </aside>
      </div>

      {/* Lightbox Vista Mestre */}
      {showMestreLightbox && space.vista_mestre_url && (
        <div
          onClick={() => setShowMestreLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 110,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40, cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={space.vista_mestre_url} alt="Vista Mestre"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}

      {/* input oculto p/ upload de referência */}
      <input
        ref={refFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => { onRefFilePicked(e.target.files?.[0] ?? null); e.target.value = '' }}
        style={{ display: 'none' }}
      />

      {refPicker && (
        <RetocarImportModal
          title="Usar imagem do projeto como referência"
          onClose={() => setRefPicker(null)}
          onPick={onReferencePicked}
        />
      )}

      {refFocus && (
        <ReferenceFocusModal
          imageUrl={refFocus.url}
          onConfirm={onFocusConfirm}
          onClose={() => setRefFocus(null)}
        />
      )}

      {/* Camada de SUPERFÍCIE (Fase 1): confirmação antes de aplicar na superfície inteira */}
      {segConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 115,
          background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)',
            borderRadius: 14, padding: 18, maxWidth: 760, width: '100%',
            display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Detectamos a superfície inteira
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Em vez de aplicar só no que você pintou, dá pra aplicar o material em <strong>toda a superfície destacada em verde</strong> — até onde ela termina de verdade — preservando o resto da cena (móveis, tapete, paredes).
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={segConfirm.previewUrl} alt="superfície detectada"
              style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 8, border: '0.5px solid var(--color-border)' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <button type="button" onClick={confirmSurface} className="spn-action"
                style={{ flex: 1, minWidth: 220, width: 'auto', padding: '11px 18px', background: '#1D9E75', color: '#042818', border: '0.5px solid rgba(0,0,0,0.18)' }}>
                Aplicar na superfície — {segConfirm.surfaceCost} nodes
              </button>
              <button type="button" onClick={useBlobOnly} className="spn-action spn-action--ghost"
                style={{ width: 'auto', padding: '11px 16px', fontSize: 12 }}>
                Usar só o que pintei
              </button>
              <button type="button" onClick={() => { setSegConfirm(null); setSubmitting(false) }} className="spn-action spn-action--ghost"
                style={{ width: 'auto', padding: '11px 14px', fontSize: 12 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultPane({ beforeUrl, afterUrl, prompt, driftWarning, onAccept, onRedo, onDiscard }: {
  beforeUrl:    string
  afterUrl:     string
  prompt:       string
  driftWarning: number | null
  onAccept:     () => void
  onRedo:       () => void
  onDiscard:    () => void
}) {
  const [sliderPos, setSliderPos] = useState(50)
  const ref = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setContainerWidth(el.getBoundingClientRect().width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  function move(clientX: number) {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const pct = ((clientX - r.left) / r.width) * 100
    setSliderPos(Math.max(0, Math.min(100, pct)))
  }
  return (
    <>
      {driftWarning !== null && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(186,117,23,0.12)', border: '0.5px solid rgba(186,117,23,0.3)',
          color: '#e0a766', fontSize: 12,
        }}>
          ⚠ Motor alterou {(driftWarning * 100).toFixed(1)}% dos pixels fora da máscara (acima do limite de 2%).
        </div>
      )}

      <div
        ref={ref}
        onPointerDown={e => { setDragging(true); move(e.clientX); (e.target as Element).setPointerCapture(e.pointerId) }}
        onPointerMove={e => { if (dragging) move(e.clientX) }}
        onPointerUp={() => setDragging(false)}
        style={{
          position: 'relative', flex: 1, minHeight: 0,
          borderRadius: 14, overflow: 'hidden',
          background: 'var(--color-bg-elevated)', cursor: 'ew-resize',
          userSelect: 'none', touchAction: 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={afterUrl} alt="depois"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
        <div style={{ position: 'absolute', inset: 0, width: `${sliderPos}%`, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeUrl} alt="antes"
            style={{ position: 'absolute', inset: 0, height: '100%', objectFit: 'contain', width: containerWidth ?? '100%' }} draggable={false} />
        </div>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: `${sliderPos}%`,
          width: 2, background: '#fff', transform: 'translateX(-1px)',
          boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        }} />
      </div>

      <div style={{
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 12, padding: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          &quot;{prompt}&quot;
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onDiscard} className="spn-action spn-action--ghost"
            style={{ width: 'auto', padding: '9px 16px', fontSize: 12, color: '#e57373' }}>
            Descartar
          </button>
          <button onClick={onRedo} className="spn-action spn-action--ghost"
            style={{ width: 'auto', padding: '9px 16px', fontSize: 12 }}>
            ↶ Refazer
          </button>
          <button onClick={onAccept} className="spn-action"
            style={{
              width: 'auto', padding: '9px 18px', fontSize: 12,
              background: '#1D9E75', color: '#042818',
              border: '0.5px solid rgba(0,0,0,0.18)',
            }}>
            ✓ Aceitar como nova versão
          </button>
        </div>
      </div>
    </>
  )
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--color-text-tertiary)',
    }}>
      {children}
    </div>
  )
}
