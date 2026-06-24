'use client'

// EditV3Flow — Editar V3 (Google/Gemini-first, premium minimalista).
//
// Três zonas: barra vertical de ferramentas (esquerda) · canvas grande (centro)
// · painel contextual da ação (direita) · rodapé com histórico de versões e
// antes/depois. Quatro ações: Remover · Trocar material · Inserir elemento ·
// Refinar área. CTA verde, hairlines 0.5px, radius 14, zero jargão de provider —
// toda a complexidade vive em /api/edit-v3/google.
//
// Fonte da verdade do estilo: tokens --color-* / --font-sans (globals.css). Os
// estilos ficam neste módulo (namespace .edv3-*) — não tocamos globals.css.

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditV3Canvas, type EditV3CanvasHandle, type EditV3Tool } from './EditV3Canvas'
import { BeforeAfter } from './BeforeAfter'
import { EditV2ImportModal } from '@/components/editar/EditV2ImportModal'
import {
  IconLasso, IconPolygon, IconBrush, IconEraser, IconHand,
  IconUndo, IconRedo, IconTrash,
  IconRemove, IconMaterial, IconInsert, IconRefine,
  IconUpload, IconHistory, IconDownload, IconCompare,
} from './icons'

type Action = 'remove' | 'swap_material' | 'insert_element' | 'refine_area'
type Preservation = 'maximum' | 'standard'
type Intensity = 'subtle' | 'standard' | 'strong'

interface ActionDef {
  id: Action
  label: string
  Icon: typeof IconRemove
  desc: string
  hint: string
  placeholder: string
  ref: 'material' | 'object' | null
  refLabel?: string
}

const ACTIONS: ActionDef[] = [
  {
    id: 'remove',
    label: 'Remover',
    Icon: IconRemove,
    desc: 'Objetos, móveis ou elementos que você quer tirar da cena.',
    hint: 'Selecione o objeto inteiro — inclua sombras e reflexos próximos.',
    placeholder: 'Opcional — ex.: remover esta luminária',
    ref: null,
  },
  {
    id: 'swap_material',
    label: 'Trocar material',
    Icon: IconMaterial,
    desc: 'Parede, piso, painel, bancada, marcenaria, pedra, madeira ou metal.',
    hint: 'Contorne a superfície que vai receber o novo material.',
    placeholder: 'Ex.: trocar o piso por porcelanato amadeirado',
    ref: 'material',
    refLabel: 'Usar referência de material',
  },
  {
    id: 'insert_element',
    label: 'Inserir elemento',
    Icon: IconInsert,
    desc: 'Vegetação, mobiliário e detalhes que você quer acrescentar.',
    hint: 'Marque o lugar onde o elemento será inserido.',
    placeholder: 'Ex.: inserir um vaso com planta no canto',
    ref: 'object',
    refLabel: 'Usar imagem de referência',
  },
  {
    id: 'refine_area',
    label: 'Refinar área',
    Icon: IconRefine,
    desc: 'Corrigir falhas, artefatos e pequenas imperfeições de uma região.',
    hint: 'Marque a área pequena que precisa de ajuste.',
    placeholder: 'Opcional — ex.: corrigir a textura desta parede',
    ref: null,
  },
]

interface HistItem {
  url: string
  kind: 'original' | 'result'
}
interface ResultState {
  url: string
  before: string
  nodes: number
  width: number | null
  height: number | null
}

const TOOLS: { id: EditV3Tool; label: string; Icon: typeof IconBrush }[] = [
  { id: 'lasso', label: 'Laço', Icon: IconLasso },
  { id: 'polygon', label: 'Polígono', Icon: IconPolygon },
  { id: 'brush', label: 'Pincel', Icon: IconBrush },
  { id: 'eraser', label: 'Borracha', Icon: IconEraser },
  { id: 'pan', label: 'Mover', Icon: IconHand },
]

export function EditV3Flow({ initialBalance }: { initialBalance: number }) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null)
  const [action, setAction] = useState<Action>('swap_material')
  const [instruction, setInstruction] = useState('')
  const [preservation, setPreservation] = useState<Preservation>('maximum')
  const [intensity, setIntensity] = useState<Intensity>('standard')
  const [quality] = useState<'standard' | 'high'>('standard') // Alta precisão: gated
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [coverage, setCoverage] = useState(0)
  const [tool, setTool] = useState<EditV3Tool>('lasso')
  const [brushSize, setBrushSize] = useState(36)
  const [cost, setCost] = useState<number | null>(null)
  const [busy, setBusy] = useState<null | 'upload' | 'generate'>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])
  const [result, setResult] = useState<ResultState | null>(null)
  const [showCompare, setShowCompare] = useState(true)
  const [importOpen, setImportOpen] = useState(false)

  const canvasRef = useRef<EditV3CanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const refInputRef = useRef<HTMLInputElement | null>(null)
  // Latch SÍNCRONO anti-duplo-envio: `busy` (estado) não vira síncrono, então
  // dois disparos no mesmo tick poderiam submeter (e cobrar) duas vezes.
  const submittingRef = useRef(false)

  const actionDef = ACTIONS.find(a => a.id === action)!
  const MIN_USABLE = 0.0002
  const SMALL_WARN = 0.004
  const hasSelection = coverage >= MIN_USABLE
  const needsInstruction =
    (action === 'swap_material' && !referenceUrl) || (action === 'insert_element' && !referenceUrl)
  const canGenerate =
    !!sourceUrl &&
    busy === null &&
    hasSelection &&
    (!needsInstruction || instruction.trim().length > 0)

  const softWarning =
    hasSelection && coverage < SMALL_WARN
      ? 'A seleção está pequena, mas você ainda pode gerar. Aumente um pouco a margem para um resultado melhor.'
      : null

  // ── Upload ──────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File, kind: 'source' | 'mask') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const res = await fetch('/api/edits/upload-asset', { method: 'POST', body: fd })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Erro ao enviar imagem')
    return json.url as string
  }, [])

  const applySource = useCallback(async (url: string, keepHistory = false) => {
    const dims = await new Promise<{ w: number; h: number } | null>(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = url
    })
    setSourceUrl(url)
    setSourceDims(dims)
    setReferenceUrl(null)
    setInstruction('')
    setCoverage(0)
    setError(null)
    setNotice(null)
    setImportOpen(false)
    setResult(null)
    setShowCompare(true)
    if (!keepHistory) setHistory([{ url, kind: 'original' }])
  }, [])

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

  // ── Custo estimado (dry-run server-side; debounce) ──────────────────────
  useEffect(() => {
    if (!sourceUrl) return
    let cancelled = false
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/edit-v3/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            source_image_url: sourceUrl,
            instruction: instruction.trim() || 'preview',
            preservation,
            intensity,
            quality,
            references: actionDef.ref && referenceUrl ? [{ kind: actionDef.ref, url: referenceUrl }] : [],
            dry_run: true,
            assume_mask: true,
          }),
        })
        const json = await res.json().catch(() => null)
        if (!cancelled && res.ok && typeof json?.nodes_cost === 'number') setCost(json.nodes_cost)
      } catch {
        /* preview best-effort; a geração revalida */
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [sourceUrl, action, preservation, intensity, quality, referenceUrl, actionDef.ref, instruction])

  useEffect(() => {
    if (busy !== 'generate') return
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  // ── Gerar ───────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!sourceUrl || busy || submittingRef.current) return
    setError(null)
    setNotice(null)
    if (!canvasRef.current?.hasSelection()) {
      setError('Selecione a área que deseja alterar.')
      return
    }
    submittingRef.current = true
    setElapsed(0)
    setBusy('generate')
    try {
      const blob = await canvasRef.current?.exportMaskBlob()
      if (!blob) {
        setError('Selecione a área que deseja alterar.')
        return
      }
      const maskUrl = await uploadFile(new File([blob], 'mask.png', { type: 'image/png' }), 'mask')
      const res = await fetch('/api/edit-v3/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          source_image_url: sourceUrl,
          mask_url: maskUrl,
          instruction: instruction.trim(),
          preservation,
          intensity,
          quality,
          references: actionDef.ref && referenceUrl ? [{ kind: actionDef.ref, url: referenceUrl }] : [],
        }),
      })
      const json = await res.json().catch(() => null)

      if (res.ok && json?.rejected === false && json?.result_url) {
        const r: ResultState = {
          url: json.result_url,
          before: sourceUrl,
          nodes: json.nodes_cost ?? 0,
          width: json.output?.width ?? null,
          height: json.output?.height ?? null,
        }
        setResult(r)
        setHistory(h => [...h, { url: r.url, kind: 'result' }])
        setShowCompare(true)
        setNotice(json?.charge?.debited ? `Edição aplicada · ${r.nodes} nodes debitados.` : 'Edição aplicada · cobrança simulada nesta fase.')
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
      submittingRef.current = false
      setBusy(null)
    }
  }, [busy, instruction, intensity, action, actionDef.ref, preservation, quality, referenceUrl, sourceUrl, uploadFile])

  const editFromResult = useCallback(() => {
    if (!result) return
    void applySource(result.url, true)
    setNotice('Editando a partir do resultado.')
  }, [applySource, result])

  const download = useCallback(async (url: string) => {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'spacenode-editar.png'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])

  // ── Estilos (tokens da marca; namespace local) ──────────────────────────
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
    color: disabled ? 'var(--color-text-quaternary)' : active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  })
  const railBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 10,
    border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'transparent'}`,
    background: active ? 'var(--color-surface-hover)' : 'transparent',
    color: disabled ? 'var(--color-text-quaternary)' : active ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  })

  // ════════════════════════════ EMPTY ════════════════════════════
  if (!sourceUrl) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px' }}>
        <style>{EDV3_CSS}</style>
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
          style={{ ...card, marginTop: 28, aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', cursor: 'pointer', borderStyle: 'dashed', borderColor: 'var(--color-border-strong)' }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}><IconUpload size={28} /></div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 10 }}>
              {busy === 'upload' ? 'Enviando…' : 'Envie uma imagem do projeto'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              Arraste aqui ou clique para escolher · JPG, PNG ou WebP até 10 MB
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button type="button" onClick={() => setImportOpen(true)} className="edv3-link">
            <IconHistory size={14} /> importar do histórico
          </button>
        </div>
        {error && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--color-text-secondary)' }}>{error}</div>}
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void handlePickSource(f); e.currentTarget.value = '' }} />
        <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
      </div>
    )
  }

  // ════════════════════════════ WORK ════════════════════════════
  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 24px 40px' }}>
      <style>{EDV3_CSS}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Saldo: {initialBalance} nodes</span>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="edv3-link">Nova imagem</button>
          <button type="button" onClick={() => setImportOpen(true)} className="edv3-link">Histórico</button>
        </div>
      </div>

      <div className="edv3-grid">
        {/* ── Zona 1: barra vertical de ferramentas ── */}
        <div className="edv3-rail" style={{ ...card, padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, alignSelf: 'start' }}>
          {TOOLS.map(t => (
            <button key={t.id} type="button" title={t.label} aria-label={t.label} style={railBtn(tool === t.id)} onClick={() => setTool(t.id)}>
              <t.Icon size={18} />
            </button>
          ))}
          <div className="edv3-rail-sep" />
          <button type="button" title="Desfazer" aria-label="Desfazer" style={railBtn(false)} onClick={() => canvasRef.current?.undo()}><IconUndo size={18} /></button>
          <button type="button" title="Refazer" aria-label="Refazer" style={railBtn(false)} onClick={() => canvasRef.current?.redo()}><IconRedo size={18} /></button>
          <button
            type="button"
            title="Limpar seleção"
            aria-label="Limpar seleção"
            style={railBtn(false)}
            onClick={() => { canvasRef.current?.clearSelection(); setCoverage(0) }}
          >
            <IconTrash size={18} />
          </button>
        </div>

        {/* ── Zona 2: canvas ── */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 560 }}>
          <EditV3Canvas
            ref={canvasRef}
            imageUrl={sourceUrl}
            tool={tool}
            brushSize={brushSize}
            onCoverageChange={setCoverage}
            disabled={busy === 'generate'}
          />
          {(tool === 'brush' || tool === 'eraser') && (
            <label style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Tamanho do pincel
              <input type="range" min={8} max={120} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-accent-green)' }} />
            </label>
          )}
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            {actionDef.hint}
            {hasSelection && <span style={{ color: 'var(--color-text-tertiary)' }}> · área selecionada: {(coverage * 100).toFixed(1)}%</span>}
          </div>
          {softWarning && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{softWarning}</div>}
          {busy === 'generate' && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, border: '0.5px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>Aplicando a edição na área selecionada…</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{elapsed}s</span>
            </div>
          )}
          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, border: '0.5px solid var(--color-border-strong)', fontSize: 13, color: 'var(--color-text-primary)' }}>{error}</div>
          )}
          {notice && !error && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>{notice}</div>}
        </div>

        {/* ── Zona 3: painel contextual ── */}
        <aside className="edv3-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Ação */}
          <div style={card}>
            <div style={sectionLabel}>Ação</div>
            <div className="edv3-actions">
              {ACTIONS.map(a => {
                const active = a.id === action
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setAction(a.id); setError(null); if (!a.ref) setReferenceUrl(null) }}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
                      padding: '11px 12px', borderRadius: 10, textAlign: 'left',
                      border: `0.5px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                      background: active ? 'var(--color-surface-hover)' : 'transparent',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: active ? 'var(--color-accent-green)' : 'var(--color-text-tertiary)' }}><a.Icon size={18} /></span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 10 }}>{actionDef.desc}</div>
          </div>

          {/* Instrução + referência */}
          <div style={card}>
            <div style={sectionLabel}>Instrução</div>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder={actionDef.placeholder}
              rows={3}
              style={{ width: '100%', resize: 'vertical', background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: 'var(--color-text-primary)', outline: 'none' }}
            />
            {actionDef.ref && (
              <div style={{ marginTop: 10 }}>
                {referenceUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referenceUrl} alt="Referência" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '0.5px solid var(--color-border-strong)' }} />
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Referência ativa
                      <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>Ela orienta a edição — não será editada.</div>
                    </div>
                    <button type="button" onClick={() => setReferenceUrl(null)} className="edv3-link">Remover</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => refInputRef.current?.click()} style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', background: 'none', border: '0.5px dashed var(--color-border-strong)', borderRadius: 9, padding: '8px 12px', width: '100%', cursor: 'pointer' }}>
                    + {actionDef.refLabel}
                  </button>
                )}
                <input ref={refInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (!f) return; try { setError(null); setReferenceUrl(await uploadFile(f, 'source')) } catch { setError('Erro ao enviar referência.') } }} />
              </div>
            )}
          </div>

          {/* Controles */}
          <div style={card}>
            <div style={sectionLabel}>Controles</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Preservação</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={segBtn(preservation === 'maximum')} onClick={() => setPreservation('maximum')}>Máxima</button>
                  <button type="button" style={segBtn(preservation === 'standard')} onClick={() => setPreservation('standard')}>Padrão</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Intensidade</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={segBtn(intensity === 'subtle')} onClick={() => setIntensity('subtle')}>Sutil</button>
                  <button type="button" style={segBtn(intensity === 'standard')} onClick={() => setIntensity('standard')}>Padrão</button>
                  <button type="button" style={segBtn(intensity === 'strong')} onClick={() => setIntensity('strong')}>Forte</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Qualidade</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={segBtn(true)}>Padrão</button>
                  <button type="button" style={segBtn(false, true)} disabled title="Em validação">Alta precisão</button>
                </div>
              </div>
            </div>
          </div>

          {/* Custo + CTA */}
          <div style={{ ...card, position: 'sticky', bottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Custo estimado</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{cost !== null ? `${cost} nodes` : '—'}</span>
            </div>
            <button type="button" className="edv3-cta" disabled={!canGenerate} onClick={handleGenerate}>
              {busy === 'generate' ? 'Gerando…' : 'Aplicar edição'}
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-quaternary)', textAlign: 'center' }}>
              Geometria, câmera e proporções são preservadas
            </div>
          </div>
        </aside>
      </div>

      {/* ── Rodapé: histórico de versões + antes/depois ── */}
      {result && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Versões</span>
              {history.map((h, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.url} alt={h.kind === 'original' ? 'Original' : `Versão ${i}`} style={{ width: 54, height: 40, objectFit: 'cover', borderRadius: 8, border: `0.5px solid ${h.url === result.url ? 'var(--color-accent-green)' : 'var(--color-border-strong)'}` }} />
                  <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 9, color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.5)', padding: '0 4px', borderRadius: 4 }}>
                    {h.kind === 'original' ? 'orig' : `v${i}`}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="edv3-link" onClick={() => setShowCompare(s => !s)}><IconCompare size={14} /> {showCompare ? 'Ocultar' : 'Antes / depois'}</button>
              <button type="button" className="edv3-ghost" onClick={editFromResult}>Editar a partir do resultado</button>
              <button type="button" className="edv3-ghost" onClick={() => void download(result.url)}><IconDownload size={14} /> Baixar</button>
            </div>
          </div>
          {showCompare && (
            <div style={{ marginTop: 12 }}>
              <BeforeAfter before={result.before} after={result.url} aspect={sourceDims ? sourceDims.w / sourceDims.h : 4 / 3} />
            </div>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void handlePickSource(f); e.currentTarget.value = '' }} />
      <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
    </div>
  )
}

// CSS local (namespace .edv3-*) — não toca globals.css.
const EDV3_CSS = `
.edv3-grid { display:grid; grid-template-columns: 50px minmax(0,1fr) 340px; gap:14px; align-items:start; }
.edv3-rail-sep { width:24px; height:1px; background:var(--color-border); margin:4px 0; }
.edv3-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.edv3-link { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; color:var(--color-text-secondary); background:none; border:none; cursor:pointer; padding:0; }
.edv3-link:hover { color:var(--color-text-primary); }
.edv3-ghost { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; font-weight:500; color:var(--color-text-secondary); background:var(--color-bg-elevated); border:0.5px solid var(--color-border-strong); border-radius:9px; padding:7px 12px; cursor:pointer; }
.edv3-ghost:hover { color:var(--color-text-primary); background:var(--color-surface-hover); }
.edv3-cta { width:100%; padding:12px 18px; border-radius:10px; font-size:13px; font-weight:600; letter-spacing:-0.01em; color:#08140c; background:var(--color-accent-green); border:0.5px solid var(--color-accent-green); cursor:pointer; transition:opacity .15s, transform .15s; }
.edv3-cta:hover:not(:disabled) { opacity:0.9; }
.edv3-cta:active:not(:disabled) { transform:scale(0.985); }
.edv3-cta:disabled { opacity:0.4; cursor:not-allowed; }
@media (max-width: 980px) {
  .edv3-grid { grid-template-columns: 50px minmax(0,1fr); }
  .edv3-panel { grid-column: 1 / -1; }
}
@media (max-width: 620px) {
  .edv3-grid { grid-template-columns: 1fr; }
  .edv3-rail { flex-direction: row !important; flex-wrap: wrap; }
  .edv3-rail-sep { width:1px; height:24px; }
}
`
