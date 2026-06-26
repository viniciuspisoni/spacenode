'use client'

// EditV2Flow — o novo editor arquitetônico da SpaceNode (Fase 3, experimental).
//
// Norte: "mais simples na superfície, mais preciso no resultado e mais
// poderoso por trás." A tela tem SÓ: imagem → tipo → seleção → instrução →
// referência opcional → custo em Nodes → Gerar → antes/depois.
// Nada de provider/modelo/jargão. Complexidade fica em /api/edits/v2.
//
// Fase 3: cobrança SIMULADA (a API não debita nodes); Alta precisão
// desabilitada (depende de autorização específica do fundador).

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditV2Canvas, type EditV2CanvasHandle } from './EditV2Canvas'
import { EditV2ImportModal } from './EditV2ImportModal'

// ── Tipos do contrato público da API v2 (espelho mínimo) ─────────────────────
type EditIntent = 'swap_material' | 'remove_element' | 'insert_element' | 'adjust_atmosphere' | 'fix_image'
type Preservation = 'maximum' | 'standard'
type Intensity = 'subtle' | 'standard' | 'strong'

interface EditTypeDef {
  id: EditIntent
  label: string
  desc: string
  maskRule: 'required' | 'optional' | 'none'
  maskHint: string
  placeholder: string
  refKind: 'material' | 'object' | null
  refLabel?: string
}

const EDIT_TYPES: EditTypeDef[] = [
  {
    id: 'swap_material',
    label: 'Trocar material',
    desc: 'Piso, parede, bancada, tecido, revestimento.',
    maskRule: 'optional',
    maskHint: 'Pinte a superfície inteira que vai receber o novo material. Sem seleção, a edição considera a imagem toda.',
    placeholder: 'Ex.: trocar o piso por madeira carvalho claro',
    refKind: 'material',
    refLabel: 'Usar referência de material',
  },
  {
    id: 'remove_element',
    label: 'Remover elemento',
    desc: 'Objetos, móveis, pessoas, vegetação.',
    maskRule: 'required',
    maskHint: 'Para melhorar o resultado, selecione o objeto inteiro com pequena margem. Se houver brilho ou reflexo, inclua também essa área na seleção.',
    placeholder: 'Opcional — ex.: remover a cadeira',
    refKind: null,
  },
  {
    id: 'insert_element',
    label: 'Inserir elemento',
    desc: 'Mobiliário, decoração, vegetação, objetos.',
    maskRule: 'required',
    maskHint: 'Pinte a área onde o elemento será inserido.',
    placeholder: 'Ex.: inserir uma poltrona de couro caramelo',
    refKind: 'object',
    refLabel: 'Usar referência do objeto',
  },
  {
    id: 'adjust_atmosphere',
    label: 'Ajustar atmosfera',
    desc: 'Luz, hora do dia, clima, pós-produção.',
    maskRule: 'none',
    maskHint: 'O ajuste vale para a imagem toda. Arquitetura, mobiliário e materiais são preservados.',
    placeholder: 'Ex.: fim de tarde, luz mais quente',
    refKind: null,
  },
  {
    id: 'fix_image',
    label: 'Corrigir imagem',
    desc: 'Artefatos, texturas quebradas, ruídos.',
    maskRule: 'required',
    maskHint: 'Pinte a área com o defeito. A correção reconstrói o que deveria estar ali.',
    placeholder: 'Opcional — ex.: corrigir a textura do piso',
    refKind: null,
  },
]

type Step = 'empty' | 'edit' | 'result'

interface ResultState {
  url: string
  nodes: number
  width: number | null
  height: number | null
}

export function EditV2Flow({ initialBalance }: { initialBalance: number }) {
  const [step, setStep] = useState<Step>('empty')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null)
  const [intent, setIntent] = useState<EditIntent>('swap_material')
  const [instruction, setInstruction] = useState('')
  const [preservation, setPreservation] = useState<Preservation>('maximum')
  const [intensity, setIntensity] = useState<Intensity>('standard')
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [coverage, setCoverage] = useState(0)
  const [cost, setCost] = useState<number | null>(null)
  const [busy, setBusy] = useState<null | 'upload' | 'generate'>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  /** Seleção por superfície (Trocar material): a marcação do usuário é
   *  SEMENTE; o sistema expande para a superfície coerente via /api/edits/segment
   *  (SAM2 — custo da casa, mesma política do v1). */
  const [surface, setSurface] = useState<{ url: string; coverage: number; usedFallback: boolean; label: string | null } | null>(null)
  const [detecting, setDetecting] = useState(false)
  /** Trocar material: 'region' = seleção por intenção (padrão); 'manual' =
   *  pincel/máscara exato (opção secundária). */
  const [materialMode, setMaterialMode] = useState<'region' | 'manual'>('region')

  const canvasRef = useRef<EditV2CanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const refInputRef = useRef<HTMLInputElement | null>(null)

  const typeDef = EDIT_TYPES.find(t => t.id === intent)!
  const needsMask = typeDef.maskRule === 'required'
  // Política (2026-06-12): bloquear MENOS, avisar MAIS. Bloqueia só seleção
  // PRATICAMENTE VAZIA (<0,02% da imagem); pequena/imperfeita gera aviso e o
  // gate pós-resultado protege — rejeição não cobra.
  const MIN_USABLE = 0.0002
  const SMALL_WARN = 0.004
  const hasSelection = coverage >= MIN_USABLE
  const needsInstruction =
    (intent === 'swap_material' || intent === 'insert_element' || intent === 'adjust_atmosphere') &&
    !referenceUrl
  const canGenerate =
    !!sourceUrl &&
    busy === null &&
    (!needsMask || hasSelection) &&
    (!needsInstruction || instruction.trim().length > 0)

  /** Avisos não-bloqueantes — orientação, nunca trava. */
  const softWarning = (() => {
    if (!hasSelection) return null
    if (coverage < SMALL_WARN) {
      return 'A seleção está pequena, mas você ainda pode gerar. Para melhorar o resultado, aumente um pouco a margem.'
    }
    return null
  })()

  // ── Upload da imagem principal ───────────────────────────────────────────
  const uploadFile = useCallback(async (file: File, kind: 'source' | 'mask') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const res = await fetch('/api/edits/upload-asset', { method: 'POST', body: fd })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Erro ao enviar imagem')
    return json.url as string
  }, [])

  /** Define a imagem de trabalho (upload ou histórico) e entra na edição. */
  const applySource = useCallback(async (url: string) => {
    const dims = await new Promise<{ w: number; h: number } | null>(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = url
    })
    setSourceUrl(url)
    setSourceDims(dims)
    setResult(null)
    setReferenceUrl(null)
    setInstruction('')
    setCoverage(0)
    setSurface(null)
    setMaterialMode('region')
    setError(null)
    setNotice(null)
    setImportOpen(false)
    setStep('edit')
  }, [])

  /** Seleção por intenção (Trocar material): a região marcada + a instrução são
   *  interpretadas no backend, que identifica o elemento arquitetônico e devolve
   *  a máscara da superfície. Em falha, degrada para a marcação como está. */
  const detectArea = useCallback(async () => {
    if (!sourceUrl || detecting || busy) return
    const region = await canvasRef.current?.exportMaskBlob()
    if (!region) {
      setError('Circule a região que deseja alterar antes de detectar.')
      return
    }
    setDetecting(true)
    setError(null)
    setNotice(null)
    try {
      const regionUrl = await uploadFile(new File([region], 'region.png', { type: 'image/png' }), 'mask')
      const res = await fetch('/api/edits/v2/detect-surface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: sourceUrl,
          region_mask_url: regionUrl,
          instruction: instruction.trim(),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.surface_mask_url) {
        setNotice('Não foi possível detectar a área agora — sua marcação será usada como está.')
        return
      }

      const interp = json.interpretation ?? {}
      const label = [interp.element_type, interp.location].filter(Boolean).join(' · ') || null
      setSurface({
        url: json.surface_mask_url,
        coverage: typeof json.surface_coverage === 'number' ? json.surface_coverage : 0,
        usedFallback: json.used_fallback === true,
        label,
      })
      // A superfície detectada vira a camada-base; a marcação-semente sai de
      // cena e o pincel/borracha passam a REFINAR a seleção.
      canvasRef.current?.clearStrokes()
      if (typeof json.surface_coverage === 'number') setCoverage(json.surface_coverage)
      if (json.used_fallback === true) {
        setNotice('Não foi possível identificar a superfície com precisão — sua marcação será usada como está. Ajuste com o pincel se precisar.')
      }
    } catch {
      setNotice('Não foi possível detectar a área agora — sua marcação será usada como está.')
    } finally {
      setDetecting(false)
    }
  }, [busy, detecting, instruction, sourceUrl, uploadFile])

  const handlePickSource = useCallback(
    async (file: File) => {
      setError(null)
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Formato não suportado. Use JPG, PNG ou WebP.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Imagem maior que 10 MB.')
        return
      }
      setBusy('upload')
      try {
        await applySource(await uploadFile(file, 'source'))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao enviar imagem')
      } finally {
        setBusy(null)
      }
    },
    [applySource, uploadFile],
  )

  // ── Custo estimado (dry-run server-side; debounce; custo zero) ───────────
  useEffect(() => {
    if (!sourceUrl || step !== 'edit') return
    let cancelled = false
    const id = setTimeout(async () => {
      if (!cancelled) setCost(null)
      try {
        const res = await fetch('/api/edits/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_image_url: sourceUrl,
            edit_intent: intent,
            instruction: instruction.trim() || 'preview',
            preservation_mode: preservation,
            intensity_mode: intensity,
            references: referenceUrl
              ? [{ kind: typeDef.refKind ?? 'material', url: referenceUrl }]
              : [],
            dry_run: true,
            assume_mask: typeDef.maskRule !== 'none',
          }),
        })
        const json = await res.json().catch(() => null)
        if (!cancelled && res.ok && typeof json?.nodes_cost === 'number') {
          setCost(json.nodes_cost)
        }
      } catch {
        /* preview é best-effort; a geração revalida */
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [sourceUrl, step, intent, preservation, intensity, referenceUrl, typeDef.refKind, typeDef.maskRule, instruction])

  // cronômetro honesto do loading (zerado no início do handleGenerate)
  useEffect(() => {
    if (busy !== 'generate') return
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  // ── Gerar ─────────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!sourceUrl || busy) return
    setError(null)
    setNotice(null)

    if (needsMask && !canvasRef.current?.hasSelection()) {
      setError('Selecione a área que deseja editar.')
      return
    }
    setElapsed(0)
    setBusy('generate')
    try {
      let maskUrl: string | null = null
      const blob = await canvasRef.current?.exportMaskBlob()
      if (blob) {
        maskUrl = await uploadFile(new File([blob], 'mask.png', { type: 'image/png' }), 'mask')
      }
      const res = await fetch('/api/edits/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_image_url: sourceUrl,
          mask_url: maskUrl,
          edit_intent: intent,
          instruction: instruction.trim(),
          preservation_mode: preservation,
          intensity_mode: intensity,
          references: referenceUrl
            ? [{ kind: typeDef.refKind ?? 'material', url: referenceUrl }]
            : [],
        }),
      })
      const json = await res.json().catch(() => null)

      if (res.ok && json?.rejected === false && json?.result_url) {
        setResult({
          url: json.result_url,
          nodes: json.nodes_cost ?? 0,
          width: json.output?.width ?? null,
          height: json.output?.height ?? null,
        })
        setStep('result')
        return
      }
      if (json?.rejected === true) {
        setError('A edição alterou mais do que o permitido e foi descartada. Tente uma seleção menor ou mais precisa. Nenhum node foi consumido.')
        return
      }
      setError(json?.error ?? 'Não foi possível concluir a edição. Nenhum node foi consumido.')
    } catch {
      setError('Falha de conexão. Nenhum node foi consumido.')
    } finally {
      setBusy(null)
    }
  }, [busy, instruction, intensity, intent, needsMask, preservation, referenceUrl, sourceUrl, typeDef.refKind, uploadFile])

  // ── Pós-resultado ─────────────────────────────────────────────────────────
  const editFromResult = useCallback(() => {
    if (!result) return
    setSourceUrl(result.url)
    setSourceDims(result.width && result.height ? { w: result.width, h: result.height } : sourceDims)
    setInstruction('')
    setReferenceUrl(null)
    setCoverage(0)
    setSurface(null)
    setMaterialMode('region')
    setResult(null)
    setNotice('Editando a partir do resultado.')
    setStep('edit')
  }, [result, sourceDims])

  const download = useCallback(async () => {
    if (!result) return
    const res = await fetch(result.url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'spacenode-editar.png'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [result])

  // ── UI helpers ────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    border: '0.5px solid var(--color-border)',
    borderRadius: 14,
    background: 'var(--color-bg-elevated)',
    padding: 16,
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    marginBottom: 10,
  }
  const segBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    flex: 1,
    padding: '7px 0',
    fontSize: 12.5,
    borderRadius: 8,
    border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'transparent'}`,
    background: active ? 'var(--color-surface-hover)' : 'transparent',
    color: disabled
      ? 'var(--color-text-quaternary)'
      : active
        ? 'var(--color-text-primary)'
        : 'var(--color-text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  })

  // ════════════════════════════ EMPTY ════════════════════════════
  if (step === 'empty') {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 6, fontSize: 14 }}>
          Ajustes precisos em imagens de projeto, preservando a arquitetura original.
        </p>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) void handlePickSource(f)
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            ...card,
            marginTop: 28,
            aspectRatio: '16 / 9',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            borderStyle: 'dashed',
            borderColor: 'var(--color-border-strong)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {busy === 'upload' ? 'Enviando…' : 'Envie uma imagem do projeto'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              Arraste aqui ou clique para escolher · JPG, PNG ou WebP até 10 MB
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            ou importar do histórico
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 14, fontSize: 13, color: 'var(--color-text-secondary)' }}>{error}</div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void handlePickSource(f)
            e.currentTarget.value = ''
          }}
        />
        <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
      </div>
    )
  }

  // ════════════════════════════ RESULT ════════════════════════════
  if (step === 'result' && result && sourceUrl) {
    return (
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Resultado</h1>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            {result.nodes} nodes · cobrança simulada nesta fase
          </span>
        </div>
        <div style={{ ...card, marginTop: 16, padding: 12 }}>
          <BeforeAfter
            before={sourceUrl}
            after={result.url}
            aspect={sourceDims ? sourceDims.w / sourceDims.h : 4 / 3}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="spn-action spn-action--primary" onClick={editFromResult}>
            Editar a partir do resultado
          </button>
          <button type="button" className="spn-action spn-action--ghost" onClick={() => setStep('edit')}>
            Refazer esta edição
          </button>
          <button type="button" className="spn-action spn-action--ghost" onClick={download}>
            Baixar
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="spn-action spn-action--ghost"
            onClick={() => {
              setStep('empty')
              setSourceUrl(null)
              setResult(null)
              setError(null)
            }}
          >
            Nova imagem
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════ EDIT ════════════════════════════
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Saldo: {initialBalance} nodes</span>
      </div>

      <div className="spn-editar-grid">
        {/* ── Área principal ── */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 520 }}>
          {sourceUrl && (
            <EditV2Canvas
              ref={canvasRef}
              imageUrl={sourceUrl}
              baseMaskUrl={surface?.url ?? null}
              onCoverageChange={setCoverage}
              onClearedBase={() => setSurface(null)}
              disabled={busy === 'generate'}
            />
          )}
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            {intent === 'swap_material' && surface
              ? `${surface.label ? `Detectado: ${surface.label}. ` : 'Área detectada. '}Ajuste com o pincel (adicionar) ou a borracha (remover) se precisar.`
              : intent === 'swap_material' && materialMode === 'region'
                ? 'Circule a superfície que deseja alterar. Não precisa pintar com precisão.'
                : typeDef.maskHint}
            {hasSelection && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                {' '}· área selecionada: {(coverage * 100).toFixed(1)}%
              </span>
            )}
          </div>
          {intent === 'swap_material' && materialMode === 'region' && hasSelection && busy !== 'generate' && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={detectArea}
                disabled={detecting}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  border: '0.5px solid var(--color-border-strong)',
                  background: 'transparent',
                  color: detecting ? 'var(--color-text-tertiary)' : 'var(--color-accent-green)',
                  cursor: detecting ? 'default' : 'pointer',
                }}
              >
                {detecting ? 'Detectando a área…' : surface ? 'Detectar novamente' : 'Detectar área'}
              </button>
              {!detecting && (
                <span style={{ fontSize: 11.5, color: 'var(--color-text-quaternary)' }}>
                  {surface
                    ? 'Ou gere usando a seleção atual.'
                    : 'O sistema identifica a superfície a partir da região + instrução. Ou gere usando a marcação como está.'}
                </span>
              )}
            </div>
          )}
          {intent === 'swap_material' && busy !== 'generate' && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => {
                  canvasRef.current?.clearSelection()
                  setSurface(null)
                  setMaterialMode(m => (m === 'region' ? 'manual' : 'region'))
                  setNotice(null)
                }}
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-text-tertiary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  padding: 0,
                }}
              >
                {materialMode === 'region' ? 'Pintar manualmente' : 'Voltar para circular região'}
              </button>
            </div>
          )}
          {softWarning && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {softWarning}
            </div>
          )}
          {busy === 'generate' && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 10,
                border: '0.5px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Editando a área selecionada…</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{elapsed}s</span>
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 10,
                border: '0.5px solid var(--color-border-strong)',
                fontSize: 13,
                color: 'var(--color-text-primary)',
              }}
            >
              {error}
            </div>
          )}
          {notice && !error && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>{notice}</div>
          )}
        </div>

        {/* ── Painel lateral ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={card}>
            <div style={sectionLabel}>Tipo de edição</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {EDIT_TYPES.map(t => {
                const active = t.id === intent
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setIntent(t.id)
                      setError(null)
                      setMaterialMode('region')
                      // Superfície detectada é específica do Trocar material:
                      // ao mudar de tipo, a seleção recomeça limpa.
                      if (surface) canvasRef.current?.clearSelection()
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '9px 11px',
                      borderRadius: 9,
                      border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'transparent'}`,
                      background: active ? 'var(--color-surface-hover)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {active && (
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 99,
                            background: 'var(--color-accent-green)',
                          }}
                        />
                      )}
                      {t.label}
                    </div>
                    {active && (
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                        {t.desc}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={card}>
            <div style={sectionLabel}>Instrução</div>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder={typeDef.placeholder}
              rows={3}
              style={{
                width: '100%',
                resize: 'vertical',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: 9,
                padding: '9px 11px',
                fontSize: 13,
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
            {typeDef.refKind && (
              <div style={{ marginTop: 10 }}>
                {referenceUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={referenceUrl}
                      alt="Referência"
                      style={{
                        width: 44,
                        height: 44,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '0.5px solid var(--color-border-strong)',
                      }}
                    />
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Referência ativa
                      <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>
                        A referência orienta a edição — ela não será editada.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReferenceUrl(null)}
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-tertiary)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => refInputRef.current?.click()}
                    style={{
                      fontSize: 12.5,
                      color: 'var(--color-text-secondary)',
                      background: 'none',
                      border: '0.5px dashed var(--color-border-strong)',
                      borderRadius: 9,
                      padding: '8px 12px',
                      width: '100%',
                      cursor: 'pointer',
                    }}
                  >
                    + {typeDef.refLabel}
                  </button>
                )}
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={async e => {
                    const f = e.target.files?.[0]
                    e.currentTarget.value = ''
                    if (!f) return
                    try {
                      setError(null)
                      setReferenceUrl(await uploadFile(f, 'source'))
                    } catch {
                      setError('Erro ao enviar referência.')
                    }
                  }}
                />
              </div>
            )}
          </div>

          <div style={card}>
            <div style={sectionLabel}>Controles</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  Preservação
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={segBtn(preservation === 'maximum')} onClick={() => setPreservation('maximum')}>
                    Máxima
                  </button>
                  <button type="button" style={segBtn(preservation === 'standard')} onClick={() => setPreservation('standard')}>
                    Padrão
                  </button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  Intensidade
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={segBtn(intensity === 'subtle')} onClick={() => setIntensity('subtle')}>
                    Sutil
                  </button>
                  <button type="button" style={segBtn(intensity === 'standard')} onClick={() => setIntensity('standard')}>
                    Padrão
                  </button>
                  <button type="button" style={segBtn(intensity === 'strong')} onClick={() => setIntensity('strong')}>
                    Forte
                  </button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  Qualidade
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={segBtn(true)}>Econômica</button>
                  <button type="button" style={segBtn(false, true)} disabled title="Em validação">
                    Alta precisão
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...card, position: 'sticky', bottom: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Custo estimado</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {cost !== null ? `${cost} nodes` : '—'}
              </span>
            </div>
            <button
              type="button"
              className="spn-action spn-action--primary"
              style={{ width: '100%', opacity: canGenerate ? 1 : 0.45 }}
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              {busy === 'generate' ? 'Gerando…' : 'Gerar edição'}
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-quaternary)', textAlign: 'center' }}>
              Geometria, câmera e proporções são preservadas · fase de testes: nodes não são debitados
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 16 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Enviar nova imagem
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Importar do histórico
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void handlePickSource(f)
                e.currentTarget.value = ''
              }}
            />
          </div>
        </aside>
      </div>
      <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
    </div>
  )
}

// ── Comparador antes/depois (cortina por pointer events, aspecto real) ───────
function BeforeAfter({ before, after, aspect }: { before: string; after: string; aspect: number }) {
  const [pos, setPos] = useState(50)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef(false)

  const move = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={e => {
        dragRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={e => dragRef.current && move(e.clientX)}
      onPointerUp={() => (dragRef.current = false)}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: String(aspect),
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'ew-resize',
        userSelect: 'none',
        background: '#0a0a0a',
        touchAction: 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="depois" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="antes" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${pos}%`,
          width: 2,
          background: 'rgba(255,255,255,0.9)',
          transform: 'translateX(-1px)',
        }}
      />
      <span style={cornerLabel('left')}>antes</span>
      <span style={cornerLabel('right')}>depois</span>
    </div>
  )
}

function cornerLabel(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: 10,
    [side]: 12,
    fontSize: 11,
    letterSpacing: '0.06em',
    color: 'rgba(255,255,255,0.85)',
    background: 'rgba(0,0,0,0.45)',
    padding: '3px 8px',
    borderRadius: 6,
  }
}
