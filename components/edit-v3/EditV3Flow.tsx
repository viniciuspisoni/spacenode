'use client'

// EditV3Flow — Editar V3 (Google/Gemini-first, premium minimalista).
//
// Duas zonas: canvas (protagonista) · painel de vidro à direita. Na superfície
// ficam só os dois campos que o usuário PRECISA preencher — a ação e a frase
// que descreve a mudança. As ferramentas de seleção deixaram de ocupar uma
// coluna permanente de 46px: elas colam no canvas e só aparecem quando há
// seleção ou quando o usuário pede. Preservação, intensidade, qualidade e
// resolução de saída — que o contrato já aceitava e o cliente mandava fixo —
// ganharam uma porta: a linha "Precisão".
//
// Material e primitivas vêm do kit de vidro (`components/app/glass` +
// globals.css). O que sobra de CSS local (namespace .edv3-*) é só a geometria
// desta tela.

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditV3Canvas, type EditV3CanvasHandle, type EditV3Tool } from './EditV3Canvas'
import { BeforeAfter } from './BeforeAfter'
import { EditV2ImportModal } from '@/components/editar/EditV2ImportModal'
import { consumeHandoff } from '@/components/nodi/actions-bus'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import {
  ChoiceGroup,
  RowIcon,
  SettingGroup,
  SettingRow,
  Sheet,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import {
  IconLasso, IconPolygon, IconBrush, IconEraser, IconHand,
  IconUndo, IconRedo, IconTrash,
  IconUpload, IconHistory, IconDownload,
} from './icons'

type Action = 'remove' | 'swap_material' | 'insert_element' | 'refine_area'

// Vocabulário do contrato (/api/edit-v3/google). Nenhum campo novo: são os
// mesmos que o cliente já mandava fixos no corpo da requisição.
type Preservation = 'maximum' | 'standard'
type Intensity    = 'subtle' | 'standard' | 'strong'
type Quality      = 'standard' | 'high'
type OutputRes    = 'source' | '1K' | '2K' | '4K'

// Os ícones das quatro ações saíram com a coluna de ferramentas: o cartão de
// escolha é título + nota, e um ícone de 18px ao lado de "Trocar material" só
// competia com o texto que já diz a mesma coisa.
interface ActionDef {
  id: Action
  label: string
  /** Uma linha — é a nota do cartão de escolha. */
  note: string
  hint: string
  placeholder: string
  ref: 'material' | 'object' | null
  refLabel?: string
}

const ACTIONS: ActionDef[] = [
  {
    id: 'remove',
    label: 'Remover',
    note: 'Tira um objeto da cena',
    hint: 'Opcional: contorne o objeto para mirar só nele (sombras/reflexos próximos).',
    placeholder: 'Ex.: retirar o tapete da sala',
    ref: null,
  },
  {
    id: 'swap_material',
    label: 'Trocar material',
    note: 'Piso, parede, bancada, marcenaria',
    hint: 'Opcional: contorne a superfície para trocar só o material dela.',
    placeholder: 'Ex.: trocar o piso por porcelanato amadeirado',
    ref: 'material',
    refLabel: 'Usar referência de material',
  },
  {
    id: 'insert_element',
    label: 'Inserir elemento',
    note: 'Vegetação, mobiliário, detalhes',
    hint: 'Marque o lugar onde o elemento será inserido.',
    placeholder: 'Ex.: inserir um vaso com planta no canto',
    ref: 'object',
    refLabel: 'Usar imagem de referência',
  },
  {
    id: 'refine_area',
    label: 'Refinar área',
    note: 'Corrige falhas e artefatos',
    hint: 'Opcional: marque a região que precisa de ajuste.',
    placeholder: 'Ex.: corrigir a textura da parede do fundo',
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
  charged: boolean
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

export function EditV3Flow({
  initialBalance,
  allowHighQuality = false,
}: {
  initialBalance: number
  /** Alta precisão (Gemini Pro) é gated no servidor (EDIT_V3_ALLOW_PRO). Sem
   *  ela o cartão nem aparece: controle que só devolve 403 não é controle. */
  allowHighQuality?: boolean
}) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null)
  const [action, setAction] = useState<Action>('swap_material')
  const [instruction, setInstruction] = useState('')

  // Handoff do Nodi (ação confirmada no painel): pré-preenche a instrução.
  useEffect(() => {
    const handoff = consumeHandoff('editar')
    if (!handoff?.prompt) return
    const raf = requestAnimationFrame(() => setInstruction(handoff.prompt!))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Precisão — os quatro campos que o contrato já aceitava e o cliente mandava
  // fixos. Os defaults são EXATAMENTE os valores que iam antes no corpo.
  const [preservation, setPreservation] = useState<Preservation>('maximum')
  const [intensity, setIntensity] = useState<Intensity>('standard')
  const [quality, setQuality] = useState<Quality>('standard')
  const [outputResolution, setOutputResolution] = useState<OutputRes>('source')
  const [precisionOpen, setPrecisionOpen] = useState(false)

  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [coverage, setCoverage] = useState(0)
  const [tool, setTool] = useState<EditV3Tool>('lasso')
  const [brushSize, setBrushSize] = useState(36)
  // A caixa de ferramentas não mora na tela: ela é chamada.
  const [toolsOpen, setToolsOpen] = useState(false)
  const [cost, setCost] = useState<number | null>(null)
  const [busy, setBusy] = useState<null | 'upload' | 'generate'>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])
  const [result, setResult] = useState<ResultState | null>(null)
  const [view, setView] = useState<'edit' | 'result'>('edit')
  const [importOpen, setImportOpen] = useState(false)

  const canvasRef = useRef<EditV3CanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const refInputRef = useRef<HTMLInputElement | null>(null)
  // Latch SÍNCRONO anti-duplo-envio: `busy` (estado) não vira síncrono, então
  // dois disparos no mesmo tick poderiam submeter (e cobrar) duas vezes.
  const submittingRef = useRef(false)

  // O papel de parede é a imagem em edição — o resultado quando ele existe.
  useAmbient(result?.url ?? sourceUrl)

  const actionDef = ACTIONS.find(a => a.id === action)!
  const MIN_USABLE = 0.0002
  const SMALL_WARN = 0.004
  const hasSelection = coverage >= MIN_USABLE
  // Seleção é OPCIONAL (exceto Inserir, que exige onde). A instrução nomeia o
  // alvo ("retirar o tapete"); marcar uma área é o reforço de precisão.
  const hasInstruction = instruction.trim().length > 0
  const hasReference = !!referenceUrl
  const taskDescribed = hasInstruction || hasReference
  const ready =
    action === 'insert_element' ? hasSelection && taskDescribed // posição + o quê
    : action === 'swap_material' ? taskDescribed                // precisa dizer o material
    : taskDescribed || hasSelection                             // remove/refine: texto OU área
  const canGenerate = !!sourceUrl && busy === null && ready

  // Troca de ação: Inserir é a única que EXIGE seleção, então nela a caixa de
  // ferramentas abre junto. No evento, não num efeito — quem abre a caixa é o
  // clique do usuário, não uma reação em cadeia de render.
  const chooseAction = useCallback((id: Action) => {
    setAction(id)
    setError(null)
    if (!ACTIONS.find(a => a.id === id)!.ref) setReferenceUrl(null)
    if (id === 'insert_element') setToolsOpen(true)
  }, [])

  // Com a caixa fechada e nada marcado, o canvas não pinta: um clique perdido
  // não pode virar seleção invisível que muda o resultado (e o custo).
  const activeTool: EditV3Tool = toolsOpen || hasSelection ? tool : 'pan'
  const toolsVisible = toolsOpen || hasSelection

  const softWarning =
    hasSelection && coverage < SMALL_WARN
      ? 'A seleção está pequena, mas você ainda pode gerar. Aumente um pouco a margem para um resultado melhor.'
      : null

  // Resumo da linha Precisão: entra o que o usuário ESCOLHEU. Tudo no default,
  // sobra uma frase só — e ela é a promessa que a tela faz.
  const precisionSummary =
    summarize([
      preservation === 'standard' ? 'Preservação padrão' : '',
      intensity === 'subtle' ? 'Alteração sutil' : intensity === 'strong' ? 'Alteração forte' : '',
      quality === 'high' ? 'Alta precisão' : '',
      outputResolution !== 'source' ? `Saída ${outputResolution}` : '',
    ]) || 'Preserva o máximo'

  // ── Upload ──────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File, kind: 'source' | 'mask') => {
    const { url } = await uploadDirect(file, 'retocar-asset', { kind })
    if (!url) throw new Error('Erro ao enviar imagem')
    return url
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
    setToolsOpen(false)
    setError(null)
    setNotice(null)
    setImportOpen(false)
    setResult(null)
    setView('edit')
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
            output_resolution: outputResolution,
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
  }, [sourceUrl, action, quality, preservation, intensity, outputResolution, referenceUrl, actionDef.ref, instruction])

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
    const hasPaint = !!canvasRef.current?.hasSelection()
    // Só Inserir exige onde (posição). Demais aceitam edição por instrução.
    if (action === 'insert_element' && !hasPaint) {
      setError('Marque o lugar onde o elemento será inserido.')
      setToolsOpen(true)
      return
    }
    submittingRef.current = true
    setElapsed(0)
    setBusy('generate')
    try {
      let maskUrl: string | undefined
      if (hasPaint) {
        const blob = await canvasRef.current?.exportMaskBlob()
        if (blob) maskUrl = await uploadFile(new File([blob], 'mask.png', { type: 'image/png' }), 'mask')
      }
      const res = await fetch('/api/edit-v3/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          source_image_url: sourceUrl,
          ...(maskUrl ? { mask_url: maskUrl } : {}),
          instruction: instruction.trim(),
          preservation,
          intensity,
          quality,
          output_resolution: outputResolution,
          references: actionDef.ref && referenceUrl ? [{ kind: actionDef.ref, url: referenceUrl }] : [],
        }),
      })
      const json = await res.json().catch(() => null)

      if (res.ok && json?.rejected === false && json?.result_url) {
        const r: ResultState = {
          url: json.result_url,
          before: sourceUrl,
          nodes: json.nodes_cost ?? 0,
          charged: json?.charge?.debited === true,
          width: json.output?.width ?? null,
          height: json.output?.height ?? null,
        }
        setResult(r)
        setHistory(h => [...h, { url: r.url, kind: 'result' }])
        setView('result') // leva o usuário para a visão de resultado (claro que gerou)
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
  }, [busy, instruction, action, actionDef.ref, quality, preservation, intensity, outputResolution, referenceUrl, sourceUrl, uploadFile])

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

  // .spn-ghost não fixa display — num <a> ou com ícone, o flex é local.
  const ghostRow: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
  }

  // ════════════════════════════ EMPTY ════════════════════════════
  if (!sourceUrl) {
    return (
      <div className="edv3-page" style={{ maxWidth: 760 }}>
        <style>{EDV3_CSS}</style>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 6, fontSize: 13.5 }}>
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
          className="spn-glass"
          style={{
            marginTop: 28, aspectRatio: '16 / 9', display: 'grid', placeItems: 'center',
            cursor: 'pointer', borderRadius: 'var(--r-card)',
            borderStyle: 'dashed', borderColor: 'var(--glass-line-strong)',
          }}
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
        {error && <div className="spn-error" style={{ marginTop: 14 }}>{error}</div>}
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void handlePickSource(f); e.currentTarget.value = '' }} />
        <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
      </div>
    )
  }

  // ════════════════════════════ RESULT ════════════════════════════
  if (view === 'result' && result) {
    return (
      <div className="edv3-page" style={{ maxWidth: 1080 }}>
        <style>{EDV3_CSS}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Verde é ESTADO — aqui ele diz "deu certo", não "clique". */}
            <span style={{ width: 24, height: 24, borderRadius: 99, background: 'var(--color-accent-green)', color: '#08140c', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 14, fontWeight: 700 }}>✓</span>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Edição aplicada</h1>
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            {result.nodes} nodes · {result.charged ? 'debitados' : 'cobrança simulada nesta fase'} · salva no{' '}
            <a href="/app/history" style={{ color: 'var(--color-text-secondary)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Histórico
            </a>
          </span>
        </div>

        <div className="spn-glass" style={{ borderRadius: 'var(--r-card)', padding: 12 }}>
          <BeforeAfter before={result.before} after={result.url} aspect={sourceDims ? sourceDims.w / sourceDims.h : 4 / 3} />
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
            Arraste a alça para comparar antes e depois
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="spn-cta" style={{ width: 'auto', minWidth: 200 }} onClick={editFromResult}>
            Continuar editando este resultado
          </button>
          <button type="button" className="spn-ghost" onClick={() => setView('edit')}>Voltar e ajustar</button>
          <button type="button" className="spn-ghost" style={ghostRow} onClick={() => void download(result.url)}><IconDownload size={14} /> Baixar</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="spn-ghost" onClick={() => { setView('edit'); setResult(null); setHistory([]); setSourceUrl(null) }}>Nova imagem</button>
        </div>

        {history.length > 1 && (
          <div className="spn-glass" style={{ borderRadius: 'var(--r-card)', marginTop: 16, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto' }}>
              <span className="spn-field-label" style={{ marginBottom: 0, flexShrink: 0 }}>Versões</span>
              {history.map((h, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.url} alt={h.kind === 'original' ? 'Original' : `Versão ${i}`} style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 8, border: `0.5px solid ${h.url === result.url ? 'var(--color-accent-green)' : 'var(--glass-line-strong)'}` }} />
                  <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 9, color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.5)', padding: '0 4px', borderRadius: 4 }}>
                    {h.kind === 'original' ? 'orig' : `v${i}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════ WORK ════════════════════════════
  return (
    <div className="edv3-page" style={{ maxWidth: 1360 }}>
      <style>{EDV3_CSS}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Editar</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {result && (
            <button type="button" onClick={() => setView('result')} className="edv3-link">Ver resultado</button>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="edv3-link">Nova imagem</button>
          <button type="button" onClick={() => setImportOpen(true)} className="edv3-link">Histórico</button>
        </div>
      </div>

      <div className="edv3-grid">
        {/* ── Zona 1: canvas (protagonista) ── */}
        <div className="edv3-stage spn-glass">
          <EditV3Canvas
            ref={canvasRef}
            imageUrl={sourceUrl}
            tool={activeTool}
            brushSize={brushSize}
            onCoverageChange={setCoverage}
            disabled={busy === 'generate'}
          />

          {/* Estado da seleção + a porta das ferramentas. O resumo é o mesmo
              que já existia; o que mudou é que ele agora CHAMA a caixa. */}
          <div className="edv3-selrow">
            <span className="edv3-seldot" data-on={hasSelection} aria-hidden />
            <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', minWidth: 0 }}>
              {hasSelection
                ? `Área marcada · ${(coverage * 100).toFixed(1).replace('.', ',')}% — a edição fica só aqui`
                : action === 'insert_element'
                  ? 'Marque o lugar onde o elemento será inserido'
                  : 'Imagem inteira'}
            </span>
            <div style={{ flex: 1 }} />
            {hasSelection ? (
              <button type="button" className="spn-ghost" style={{ height: 28, padding: '0 11px', fontSize: 11.5 }}
                onClick={() => { canvasRef.current?.clearSelection(); setCoverage(0); setToolsOpen(false) }}>
                Limpar área
              </button>
            ) : (
              <button type="button" className="spn-ghost" style={{ height: 28, padding: '0 11px', fontSize: 11.5 }}
                aria-expanded={toolsOpen}
                onClick={() => {
                  // Fechar a caixa força `activeTool` para 'pan', e o canvas
                  // COMMITA um polígono em andamento ao SAIR do polígono
                  // (EditV3Canvas:465-473 — >= 3 pontos vira closePolygon()).
                  // Sem limpar antes, "Esconder ferramentas" no meio de um
                  // polígono cria uma seleção que o usuário nunca confirmou —
                  // e ela muda o resultado e o custo. A limpeza é síncrona
                  // (mexe em refs), então chega antes do efeito da troca.
                  if (toolsOpen) { canvasRef.current?.clearSelection(); setCoverage(0) }
                  setToolsOpen(v => !v)
                }}>
                {toolsOpen ? 'Esconder ferramentas' : 'Marcar área'}
              </button>
            )}
          </div>

          {/* Caixa de ferramentas colada ao canvas — nasce com a seleção e
              morre com ela. Fica ABAIXO do canvas, não por cima: vidro sobre
              superfície que repinta em rAF é o que o contrato proíbe. */}
          {toolsVisible && (
            <div className="edv3-tools spn-glass spn-glass--raised">
              <div className="spn-pills" role="radiogroup" aria-label="Ferramenta de seleção">
                {TOOLS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    className="spn-pill"
                    aria-checked={tool === t.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => setTool(t.id)}
                  >
                    <t.Icon size={14} /> {t.label}
                  </button>
                ))}
              </div>
              <div className="edv3-sep" aria-hidden />
              <button type="button" className="spn-icon-btn" title="Desfazer" aria-label="Desfazer" onClick={() => canvasRef.current?.undo()}><IconUndo size={16} /></button>
              <button type="button" className="spn-icon-btn" title="Refazer" aria-label="Refazer" onClick={() => canvasRef.current?.redo()}><IconRedo size={16} /></button>
              <button type="button" className="spn-icon-btn" title="Limpar seleção" aria-label="Limpar seleção"
                onClick={() => { canvasRef.current?.clearSelection(); setCoverage(0) }}><IconTrash size={16} /></button>
              {(tool === 'brush' || tool === 'eraser') && (
                <label className="edv3-brush">
                  Pincel
                  <input type="range" min={8} max={120} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} />
                </label>
              )}
            </div>
          )}

          {!hasSelection && action !== 'insert_element' && (
            <p className="spn-hint">
              Sem marcar uma área, a IA recria a cena para aplicar o pedido. Preservamos o projeto, a câmera e o enquadramento ao máximo, mas pode haver pequenas variações fora do ponto editado.
            </p>
          )}
          {softWarning && <p className="spn-hint">{softWarning}</p>}
          {busy === 'generate' && (
            <div className="edv3-progress spn-glass spn-glass--raised">
              <span>{hasSelection ? 'Aplicando a edição na área selecionada…' : 'Aplicando a edição na imagem…'}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{elapsed}s</span>
            </div>
          )}
          {error && <div className="spn-error" style={{ marginTop: 12 }}>{error}</div>}
          {notice && !error && <p className="spn-hint">{notice}</p>}
        </div>

        {/* ── Zona 2: painel ── */}
        <aside className="edv3-panel spn-tool-panel spn-glass spn-glass--chrome">
          <div className="spn-tool-panel-body">
            {/* Ação — superfície: é ela que muda tudo o mais. */}
            <div className="spn-field">
              <span className="spn-field-label">O que deseja fazer</span>
              <ChoiceGroup
                label="Ação"
                cols={2}
                value={action}
                onChange={chooseAction}
                options={ACTIONS.map(a => ({ value: a.id, title: a.label, note: a.note }))}
              />
            </div>

            {/* Instrução — o campo que habilita o botão: fica na superfície. */}
            <div className="spn-field">
              <span className="spn-field-label">Descreva a mudança</span>
              <textarea
                className="spn-textarea"
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder={actionDef.placeholder}
                rows={3}
              />
              <p className="spn-hint">{actionDef.hint}</p>

              {actionDef.ref && (
                <div style={{ marginTop: 10 }}>
                  {referenceUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={referenceUrl} alt="Referência" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--r-inner)', border: '0.5px solid var(--glass-line-strong)' }} />
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Referência ativa
                        <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)' }}>Ela orienta a edição — não será editada.</div>
                      </div>
                      <button type="button" onClick={() => setReferenceUrl(null)} className="edv3-link">Remover</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => refInputRef.current?.click()}
                      style={{
                        fontSize: 12.5, color: 'var(--color-text-secondary)', background: 'var(--color-chip)',
                        border: '0.5px dashed var(--glass-line-strong)', borderRadius: 'var(--r-inner)',
                        padding: '9px 12px', width: '100%', cursor: 'pointer', font: 'inherit',
                      }}>
                      + {actionDef.refLabel}
                    </button>
                  )}
                  <input ref={refInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (!f) return; try { setError(null); setReferenceUrl(await uploadFile(f, 'source')) } catch { setError('Erro ao enviar referência.') } }} />
                </div>
              )}
            </div>

            {/* Precisão — a porta para o que o contrato já aceitava. */}
            <div className="spn-field">
              <SettingGroup>
                <SettingRow
                  icon={<RowIcon name="precision" />}
                  title="Precisão"
                  value={precisionSummary}
                  controls="edv3-precision"
                  onOpen={() => setPrecisionOpen(true)}
                />
              </SettingGroup>
            </div>
          </div>

          {/* Dock: o CTA colado no rodapé do painel. */}
          <div className="spn-dock spn-glass spn-glass--chrome">
            <div className="spn-cost">
              <div className="spn-cost-figures">
                <div className="spn-cost-main">{cost !== null ? `${cost} nodes` : '—'}</div>
                <div className="spn-cost-sub">Saldo: {initialBalance} nodes</div>
              </div>
              <button type="button" className="spn-cta" disabled={!canGenerate} onClick={handleGenerate}>
                {busy === 'generate' ? 'Gerando…' : hasSelection ? 'Aplicar na área' : 'Aplicar na imagem'}
              </button>
            </div>
            <p className="spn-hint" style={{ textAlign: 'center' }}>
              {!canGenerate
                ? 'Descreva a mudança ou marque uma área para começar.'
                : hasSelection
                  ? 'Geometria, câmera e proporções são preservadas.'
                  : 'Preservamos câmera, proporções e enquadramento ao máximo — pode haver pequenas variações.'}
            </p>
          </div>
        </aside>
      </div>

      {/* Folha de precisão. Nenhum campo novo: os quatro já viajavam fixos no
          corpo da requisição — o que faltava era a porta. */}
      <Sheet id="edv3-precision" open={precisionOpen} title="Precisão" onClose={() => setPrecisionOpen(false)}>
        <div className="spn-field">
          <span className="spn-field-label">Fora da área marcada</span>
          <ChoiceGroup
            label="Preservação"
            cols={2}
            value={preservation}
            onChange={setPreservation}
            options={[
              { value: 'maximum',  title: 'Preservar ao máximo', note: 'Só a área muda' },
              { value: 'standard', title: 'Deixar acomodar',     note: 'Luz e sombra podem ceder' },
            ]}
          />
        </div>

        <div className="spn-field">
          <span className="spn-field-label">Intensidade da mudança</span>
          <ChoiceGroup
            label="Intensidade"
            cols={3}
            value={intensity}
            onChange={setIntensity}
            options={[
              { value: 'subtle',   title: 'Sutil',  note: 'Quase imperceptível' },
              { value: 'standard', title: 'Padrão', note: 'O equilíbrio' },
              { value: 'strong',   title: 'Forte',  note: 'Bem visível' },
            ]}
          />
          {intensity === 'strong' && !hasSelection && (
            <p className="spn-hint">Sem área marcada, a intensidade forte é contida para não recriar a cena inteira.</p>
          )}
        </div>

        {allowHighQuality && (
          <div className="spn-field">
            <span className="spn-field-label">Motor</span>
            <ChoiceGroup
              label="Qualidade"
              cols={2}
              value={quality}
              onChange={setQuality}
              options={[
                { value: 'standard', title: 'Padrão',        note: 'Rápido, resolve a maioria' },
                { value: 'high',     title: 'Alta precisão', note: 'Detalhe fino, custa mais' },
              ]}
            />
          </div>
        )}

        <div className="spn-field">
          <span className="spn-field-label">Resolução de saída</span>
          <ChoiceGroup
            label="Resolução de saída"
            cols={2}
            value={outputResolution}
            onChange={setOutputResolution}
            options={[
              { value: 'source', title: 'Igual à original', note: 'O padrão' },
              { value: '1K',     title: '1K',               note: 'Mais leve e barata' },
              { value: '2K',     title: '2K',               note: 'Apresentação' },
              { value: '4K',     title: '4K',               note: 'Prancha e impressão' },
            ]}
          />
          {outputResolution === '4K' && quality === 'standard' && (
            <p className="spn-hint">O motor padrão entrega até 2K — o 4K só vale com a alta precisão ligada.</p>
          )}
        </div>
      </Sheet>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void handlePickSource(f); e.currentTarget.value = '' }} />
      <EditV2ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSelect={url => void applySource(url)} />
    </div>
  )
}

// CSS local (namespace .edv3-*): só a geometria desta tela. Material,
// controles e folhas vêm do kit de vidro em globals.css.
const EDV3_CSS = `
.edv3-page { margin: 0 auto; padding: 14px 20px 24px; }
/* Antes: '46px minmax(0,1fr) 300px' — a primeira faixa era a coluna
   permanente de ferramentas, presente mesmo quando a seleção é opcional em 3
   das 4 ações. Ela virou uma caixa que nasce colada ao canvas. */
.edv3-grid { display:grid; grid-template-columns: minmax(0,1fr) 340px; gap:14px; align-items:stretch; }
.edv3-stage { display:flex; flex-direction:column; padding:12px; border-radius:var(--r-card); min-height:min(76vh,780px); }
.edv3-selrow { display:flex; align-items:center; gap:8px; margin-top:12px; flex-wrap:wrap; }
.edv3-seldot { width:6px; height:6px; border-radius:99px; flex-shrink:0; background:var(--color-text-tertiary); }
.edv3-seldot[data-on='true'] { background:var(--color-accent-green); }
.edv3-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:10px; padding:8px 10px; border-radius:var(--r-inner); }
.edv3-sep { width:1px; height:20px; background:var(--glass-line-strong); }
.edv3-brush { display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--color-text-tertiary); }
.edv3-brush input { width:120px; accent-color:var(--color-text-primary); }
.edv3-progress { display:flex; justify-content:space-between; gap:10px; margin-top:12px; padding:10px 14px; border-radius:var(--r-inner); font-size:13px; }
/* O dock só é dock se o painel tiver altura LIMITADA — é o limite que faz
   .spn-tool-panel-body rolar por dentro e o botão ficar preso no rodapé.
   Com align-self:stretch a linha do grid crescia junto com o conteúdo do
   painel: nada rolava por dentro, o dock virava o último bloco da coluna e
   sumia no scroll da página, que é exatamente o que ele existe para evitar.
   align-self:start + max-height devolvem o limite; sticky mantém o painel no
   campo de visão enquanto o palco, que pode ser mais alto, rola ao lado. */
.edv3-panel {
  align-self: start;
  position: sticky;
  top: 14px;
  /* 86px = os 14 do topo + o cabeçalho da página (h1 + margem, ~58) + 14
     de folga embaixo. Sem descontar o cabeçalho, em viewport curta o dock
     nascia logo ABAIXO da dobra e só aparecia depois de rolar um pouco —
     meio conserto. */
  max-height: calc(100dvh - 86px);
}
.edv3-link { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; color:var(--color-text-secondary); background:none; border:none; cursor:pointer; padding:0; font:inherit; }
.edv3-link:hover { color:var(--color-text-primary); }
@media (max-width: 980px) {
  .edv3-grid { grid-template-columns: minmax(0,1fr); }
  .edv3-stage { min-height:min(60vh,560px); }
  /* Coluna única: o painel vem DEPOIS do palco e a página inteira é o
     scroller. Prender aqui deixaria um scroll dentro do outro. */
  .edv3-panel { position: static; max-height: none; }
}
`
