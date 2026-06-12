'use client'

// Fluxo standalone do modo Editar do Spacenode (intenção-primeiro).
//   empty   → upload da imagem (ou Importar do histórico)
//   intent  → "O que você quer fazer?" — 8 intenções (EditIntentPicker)
//   editing → canvas + brush + prompt + qualidade; a interface se adapta à
//             intenção (máscara obrigatória/opcional, referências explícitas,
//             toggle de geometria, botões "Edição rápida"/"Edição premium")
//   result  → slider antes/depois + Salvar / Descartar / Editar de novo
//
// O painel direito concentra as opções da geração — ferramentas de máscara,
// preservação, resolução final, referências, custo em nodes e os botões de
// gerar (rápida/premium — premium nunca é automático).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RetocarCanvas, type RetocarCanvasHandle, type MaskTool, BRUSH_MIN, BRUSH_MAX } from './RetocarCanvas'
import { RetocarImportModal } from './RetocarImportModal'
import { EditIntentPicker, ActiveIntentChip } from './EditIntentPicker'
import { EDIT_INTENTS, type EditIntent, type EditIntentMeta } from '@/lib/spaces/edit-intents'
import { PromptAssistant } from './PromptAssistant'
import { LARGE_MASK_THRESHOLD } from '@/lib/spaces/edit-economy'
import type { Quality, EditSourceType } from '@/lib/spaces/types'
import { EDIT_MODE_LABELS, type EditMode } from '@/lib/spaces/engines'
import { FIDELITY_LABELS, type FidelityMode } from '@/lib/spaces/edit-prompts'
import { MAX_EDIT_REFERENCES, SURFACE_SEGMENTATION_ENABLED, type EditReferenceImage, type EditReferenceRole } from '@/lib/spaces/edit-router'
import { ReferencesPanel, suggestPromptForRole, downscaleImageForUpload, type RefMenuKind } from './RetocarReferences'
import { ReferenceFocusModal, type NormCrop } from './ReferenceFocusModal'
import { SurfaceSelectModal, SurfaceSelectionBar, type SurfaceSelection } from './SurfaceSelectModal'

// Debug: mostra a imagem REJEITADA pelo quality gate (sem salvar). Só dev/staging.
const SHOW_REJECTED_DEBUG =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_EDIT_DEBUG === '1'

type Step = 'empty' | 'editing' | 'result'

/** Versão local na sessão. O id é um uuid criado no client (sem persistência). */
export interface EditVersion {
  id:         string
  url:        string
  isOriginal: boolean
  /** Label visível na strip ("Original" / "V1 · concreto cinza"). */
  label:      string
  prompt:     string
  mode:       EditMode | null
  cost:       number
  createdAt:  number
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function buildVersionLabel(args: { index: number; prompt: string; mode: EditMode | null }): string {
  const { index, prompt, mode } = args
  const summary = prompt.trim().slice(0, 28) || (mode ? EDIT_MODE_LABELS[mode].label.toLowerCase() : '')
  return summary ? `V${index} · ${summary}` : `V${index}`
}

/** Resultado do preview de rota (/api/edits/preview) — o que a UI mostra. */
interface RoutePreview {
  costNodes:   number
  isFreeFix:   boolean
  label:       string
  explanation: string
}

interface Props {
  initialBalance: number
}

export function RetocarStandaloneFlow({ initialBalance }: Props) {
  const canvasRef = useRef<RetocarCanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [step, setStep] = useState<Step>('empty')
  const [sourceUrl, setSourceUrl]     = useState<string | null>(null)
  const [sourceType, setSourceType]   = useState<EditSourceType>('upload')
  const [sourceId, setSourceId]       = useState<string | null>(null)
  const [resultUrl, setResultUrl]     = useState<string | null>(null)
  /** Local-session version history. Original + each successful generation.
      Not persisted across reloads (edits are in the DB anyway). */
  const [versions, setVersions]       = useState<EditVersion[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [coverage, setCoverage]       = useState(0)
  const [brush, setBrush]             = useState(40)
  const [tool, setTool]               = useState<MaskTool>('brush')
  const [maskVisible, setMaskVisible] = useState(true)
  const [prompt, setPrompt]           = useState('')
  const [quality, setQuality]         = useState<Quality>('2k')
  // Intenção-primeiro (Google-first): o usuário escolhe O QUE quer fazer antes
  // do prompt; o mode (vocabulário API/DB) deriva da intenção.
  const [intent, setIntent]           = useState<EditIntent | null>(null)
  const [mode, setMode]               = useState<EditMode>('material')
  // Project fidelity — how strictly to preserve geometry/scale/lighting.
  // 'max' is the safe default for real architectural work. Controlado pelo
  // toggle "Preservar geometria, perspectiva e iluminação original".
  const [fidelity, setFidelity]       = useState<FidelityMode>('max')
  const [balance, setBalance]         = useState(initialBalance)
  const [submitting, setSubmitting]   = useState(false)
  const [validating, setValidating]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [showImport, setShowImport]   = useState(false)
  const [driftWarning, setDriftWarning] = useState<number | null>(null)
  // Rota/custo calculados no servidor ANTES de gerar (sem consumir nodes).
  // routePreview = "Edição rápida"; premiumPreview = "Edição premium" (os dois
  // botões mostram o preço; premium NUNCA é automático — só pelo botão).
  const [routePreview, setRoutePreview]     = useState<RoutePreview | null>(null)
  const [premiumPreview, setPremiumPreview] = useState<RoutePreview | null>(null)
  // Quality gate: edição rejeitada por não preservar fora da máscara.
  const [qualityGate, setQualityGate]   = useState<{ message: string; resultUrl?: string; drift?: number } | null>(null)
  // Camada de SUPERFÍCIE (Fase 1): confirmação antes de aplicar na superfície inteira.
  const [segmenting, setSegmenting]     = useState(false)
  const [segConfirm, setSegConfirm]     = useState<
    { previewUrl: string; surfaceMaskUrl: string; blobMaskUrl: string; surfaceCoverage: number; blobCoverage: number; surfaceCost: number; premiumSel: boolean } | null
  >(null)
  // Camada de SUPERFÍCIE V2 (clique-primeiro): seleção ativa + modal de seleção.
  // Quando surfaceSel existe, a geração usa ESSA máscara (o pincel é ignorado).
  const [surfaceSel, setSurfaceSel]       = useState<SurfaceSelection | null>(null)
  const [surfacePicker, setSurfacePicker] = useState<{ initial: SurfaceSelection | null } | null>(null)
  // Referências visuais da edição (V1).
  const [references, setReferences]     = useState<EditReferenceImage[]>([])
  const [refPicker, setRefPicker]       = useState<{ role: EditReferenceRole } | null>(null)
  // Reference focus (V1.1): imagem do projeto escolhida, aguardando recorte.
  const [refFocus, setRefFocus]         = useState<
    { url: string; role: EditReferenceRole; sourceType: EditSourceType; sourceId: string | null } | null
  >(null)
  const pendingUploadRoleRef            = useRef<EditReferenceRole | null>(null)
  const refFileInputRef                 = useRef<HTMLInputElement | null>(null)

  // Custo vem da rota (editRouter), não mais de getEditCost(quality).
  const cost = routePreview?.costNodes ?? 0
  const balanceShort = !routePreview?.isFreeFix && balance < cost
  const premiumShort = balance < (premiumPreview?.costNodes ?? 0)

  // A intenção ativa define máscara obrigatória/opcional, referências, toggle.
  const intentMeta: EditIntentMeta | null = intent ? EDIT_INTENTS[intent] : null
  const maskRequired = intentMeta ? intentMeta.maskRequirement === 'required' : true

  // Preview de rota/custo (debounced) sempre que algo que afeta a cobrança muda.
  // Busca os DOIS preços (rápida e premium) para os dois botões. Sem máscara,
  // só consulta quando a intenção permite edição da imagem inteira. A seleção
  // de SUPERFÍCIE (clique) tem prioridade sobre o pincel na cobertura.
  // setState fica dentro do setTimeout (não síncrono no corpo do efeito).
  const effectiveCoverage = surfaceSel ? surfaceSel.coverage : coverage
  useEffect(() => {
    if (step !== 'editing' || !sourceUrl || !intent) return
    const allowNoMask = EDIT_INTENTS[intent].maskRequirement !== 'required'
    const handle = setTimeout(async () => {
      const hasMask = effectiveCoverage > 0
      if (!hasMask && !allowNoMask) { setRoutePreview(null); setPremiumPreview(null); return }
      const fetchOne = async (premiumFlag: boolean): Promise<RoutePreview | null> => {
        try {
          const res = await fetch('/api/edits/preview', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              has_mask:      hasMask,
              mask_coverage: hasMask ? effectiveCoverage : 0,
              prompt:        mode === 'remove' ? '' : prompt.trim(),
              quality,
              source_type:   sourceType,
              source_id:     sourceId,
              mode,
              fidelity_mode: fidelity,
              premium:       premiumFlag,
              references:    references.map(r => ({ url: r.url, role: r.role, source: r.source, note: r.note })),
            }),
          })
          if (!res.ok) return null
          const d = await res.json()
          return {
            costNodes:   d.cost_nodes ?? 0,
            isFreeFix:   !!d.is_free_fix,
            label:       d.label ?? '',
            explanation: d.explanation ?? '',
          }
        } catch { return null /* preview é best-effort; o servidor reavalia ao gerar */ }
      }
      const [quick, prem] = await Promise.all([fetchOne(false), fetchOne(true)])
      if (quick) setRoutePreview(quick)
      if (prem)  setPremiumPreview(prem)
    }, 350)
    return () => clearTimeout(handle)
  }, [step, sourceUrl, sourceType, sourceId, intent, mode, quality, fidelity, effectiveCoverage, prompt, references])

  // ── intenção ─────────────────────────────────────────────────
  function pickIntent(i: EditIntent) {
    const meta = EDIT_INTENTS[i]
    setIntent(i)
    setMode(meta.mode)
    setFidelity('max') // toggle "Preservar geometria…" nasce LIGADO
    setError(null)
    setQualityGate(null)
    setRoutePreview(null)
    setPremiumPreview(null)
    setSurfaceSel(null)
    // Trocar material abre CLIQUE-primeiro: seleciona a superfície com 1 clique
    // (o pincel continua disponível em "Prefiro pintar com o pincel").
    if (i === 'swap_material' && SURFACE_SEGMENTATION_ENABLED) {
      setSurfacePicker({ initial: null })
    }
  }

  function changeIntent() {
    setIntent(null)
    setError(null)
    setQualityGate(null)
    setSurfaceSel(null)
    setSurfacePicker(null)
  }

  // ── upload da imagem ─────────────────────────────────────────
  async function uploadSourceFile(file: File) {
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'source')
    const res = await fetch('/api/edits/upload-asset', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? 'Erro ao salvar imagem')
    return data.url as string
  }

  function resetVersionsWithOriginal(url: string) {
    const orig: EditVersion = {
      id: newId(), url, isOriginal: true, label: 'Original',
      prompt: '', mode: null, cost: 0, createdAt: Date.now(),
    }
    setVersions([orig])
    setActiveVersionId(orig.id)
    setReferences([])
    setSurfaceSel(null)
    setSurfacePicker(null)
  }

  async function onFilePicked(f: File | null) {
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Formato não suportado. Use JPG, PNG ou WebP.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Imagem maior que 10 MB.')
      return
    }
    setError(null)
    try {
      const url = await uploadSourceFile(f)
      setSourceUrl(url)
      setSourceType('upload')
      setSourceId(null)
      resetVersionsWithOriginal(url)
      setStep('editing')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function onImportPicked(picked: { url: string; type: EditSourceType; id: string | null }) {
    setSourceUrl(picked.url)
    setSourceType(picked.type)
    setSourceId(picked.id)
    resetVersionsWithOriginal(picked.url)
    setShowImport(false)
    setStep('editing')
  }

  // ── referências da edição ────────────────────────────────────
  // 1 referência ATIVA por papel: anexar uma nova do mesmo papel SUBSTITUI a
  // anterior (não acumula) — senão a antiga ficava em references[0] e o engine
  // usava ela silenciosamente.
  function addReference(ref: EditReferenceImage) {
    setReferences(prev => {
      const sameRoleIdx = prev.findIndex(r => r.role === ref.role)
      if (sameRoleIdx >= 0) { const next = [...prev]; next[sameRoleIdx] = ref; return next }
      if (prev.length >= MAX_EDIT_REFERENCES) return prev
      return [...prev, ref]
    })
    const suggestion = suggestPromptForRole(ref.role)
    if (suggestion) setPrompt(p => (p.trim() ? p : suggestion))
  }

  function removeReference(id: string) {
    setReferences(prev => prev.filter(r => r.id !== id))
  }
  function clearAllReferences() { setReferences([]) }

  // Papel principal da ferramenta (o que o engine usa como references[0]) +
  // ordenação do payload pra garantir que ele vá pra frente (item 4).
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

  function handleAddReferenceKind(kind: RefMenuKind) {
    setError(null)
    if (kind === 'original') {
      if (!sourceUrl) { setError('Abra uma imagem antes de usar como referência.'); return }
      addReference({ id: `original:${sourceUrl}`, url: sourceUrl, role: 'original_image', source: 'original' })
      return
    }
    if (kind === 'project_render') { setRefPicker({ role: 'project_render' }); return }
    if (kind === 'vista_mestre')   { setRefPicker({ role: 'consistency_reference' }); return }
    // tipos por upload
    pendingUploadRoleRef.current =
      kind === 'material' ? 'material_texture' :
      kind === 'object'   ? 'object_reference' : 'custom'
    refFileInputRef.current?.click()
  }

  async function onRefFilePicked(file: File | null) {
    const role = pendingUploadRoleRef.current
    pendingUploadRoleRef.current = null
    if (!file || !role) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formato de referência não suportado (JPG, PNG, WebP).'); return
    }
    if (file.size > 40 * 1024 * 1024) { setError('Imagem muito grande (máx 40 MB).'); return }
    setError(null)
    try {
      // Reduz no browser (limite ~4.5MB de body da Vercel) sem perder fidelidade.
      const blob = await downscaleImageForUpload(file)
      const fd = new FormData()
      fd.append('file', new File([blob], 'reference.jpg', { type: blob.type || 'image/jpeg' }))
      fd.append('role', role)
      const res = await fetch('/api/edits/references/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        let msg = res.status === 413 ? 'Imagem muito grande para enviar.' : 'Erro ao enviar referência'
        try { const d = await res.json(); msg = d?.error ?? msg } catch { /* resposta não-JSON */ }
        throw new Error(msg)
      }
      const data = await res.json()
      addReference(data.reference as EditReferenceImage)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Imagem do projeto escolhida → abre o seletor de FOCO (recorte do elemento).
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
        // Recorta só o elemento da referência (server-side).
        const res = await fetch('/api/edits/references/crop', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ source_url: f.url, ...crop, role: f.role }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Erro ao recortar referência')
        addReference(data.reference as EditReferenceImage)
        return
      }
      // Imagem inteira: valida via from-project (render/vista) ou usa a URL direta.
      if ((f.sourceType === 'render' || f.sourceType === 'vista') && f.sourceId) {
        const res = await fetch('/api/edits/references/from-project', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ image_id: f.sourceId, source_type: f.sourceType, role: f.role }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Erro ao usar imagem do projeto')
        addReference(data.reference as EditReferenceImage)
      } else {
        addReference({ id: `project:${f.url}`, url: f.url, role: f.role, source: 'project' })
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // ── gerar edit ───────────────────────────────────────────────
  // `premiumSel` vem do botão clicado ("Edição rápida" ou "Edição premium") —
  // premium nunca é automático.
  async function handleGenerate(premiumSel: boolean) {
    const hasMaskPainted = !!canvasRef.current?.hasMask()
    if (maskRequired && !hasMaskPainted && !surfaceSel) {
      setError('Pinte a área que deseja editar.')
      return
    }
    // 'remove' doesn't need a prompt — the model fills from surroundings.
    if (mode !== 'remove' && !prompt.trim()) {
      setError('Descreva o que você quer nessa área antes de gerar.')
      return
    }
    const requiredNodes = premiumSel ? (premiumPreview?.costNodes ?? 0) : cost
    if (premiumSel ? premiumShort : balanceShort) {
      setError(`Saldo insuficiente. Necessários ${requiredNodes} nodes.`)
      return
    }
    setError(null)
    setDriftWarning(null)
    setQualityGate(null)
    setSegConfirm(null)
    setSubmitting(true)

    // Seleção de SUPERFÍCIE por clique ativa → a máscara JÁ é a superfície:
    // gera direto (sem upload de blob nem pré-passo de segmentação).
    if (surfaceSel) {
      await runGenerate(surfaceSel.maskUrl, surfaceSel.coverage, true, premiumSel)
      return
    }

    // Intenções sem máscara obrigatória e nada pintado → edição da imagem inteira.
    if (!hasMaskPainted) {
      await runGenerate(null, 0, false, premiumSel)
      return
    }

    // 1) Upload do blob pintado.
    let blobMaskUrl: string
    let maskCoverage: number
    try {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('Canvas indisponível')
      const blob = await canvas.getMaskBlob()
      if (!blob) throw new Error('Falha ao gerar máscara')
      maskCoverage = canvas.getMaskCoverage()
      const fd = new FormData()
      fd.append('file', new File([blob], 'mask.png', { type: 'image/png' }))
      fd.append('kind', 'mask')
      const maskRes = await fetch('/api/edits/upload-asset', { method: 'POST', body: fd })
      const maskData = await maskRes.json()
      if (!maskRes.ok) throw new Error(maskData?.error ?? 'Erro ao salvar máscara')
      blobMaskUrl = maskData.url
    } catch (e) {
      console.error('[retocar] handleGenerate error:', e)
      setError((e as Error).message)
      setSubmitting(false)
      return
    }

    // 2) Camada de SUPERFÍCIE (Fase 1): só material. Segmenta e, se estender além
    //    do pintado, pede confirmação. Best-effort: qualquer falha cai no blob.
    if (SURFACE_SEGMENTATION_ENABLED && mode === 'material' && sourceUrl) {
      setSegmenting(true)
      try {
        const segRes = await fetch('/api/edits/segment', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ image_url: sourceUrl, mask_url: blobMaskUrl }),
        })
        if (segRes.ok) {
          const seg = await segRes.json()
          const extended = !seg.used_fallback && seg.surface_coverage > maskCoverage * 1.15
          if (extended) {
            let surfaceCost = premiumSel ? (premiumPreview?.costNodes ?? cost) : cost
            try {
              const pv = await fetch('/api/edits/preview', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ has_mask: true, mask_coverage: seg.surface_coverage, prompt: prompt.trim(), quality, source_type: sourceType, source_id: sourceId, mode, premium: premiumSel, references: payloadReferences() }),
              })
              if (pv.ok) { const d = await pv.json(); surfaceCost = d.cost_nodes ?? surfaceCost }
            } catch { /* mantém o custo atual */ }
            setSegmenting(false)
            setSubmitting(false)
            setSegConfirm({ previewUrl: seg.preview_url, surfaceMaskUrl: seg.surface_mask_url, blobMaskUrl, surfaceCoverage: seg.surface_coverage, blobCoverage: maskCoverage, surfaceCost, premiumSel })
            return
          }
        }
      } catch { /* best-effort: cai no blob */ }
      setSegmenting(false)
    }

    // 3) Sem segmentação (ou não estendeu) → gera com o blob pintado.
    await runGenerate(blobMaskUrl, maskCoverage, false, premiumSel)
  }

  // Geração com a máscara escolhida (blob pintado, superfície segmentada, ou
  // NENHUMA — edição conversacional da imagem inteira).
  async function runGenerate(maskUrl: string | null, maskCoverage: number, fromSurface = false, premiumSel = false) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_image_url: sourceUrl,
          mask_url:         maskUrl ?? undefined,
          prompt:           mode === 'remove' ? '' : prompt.trim(),
          quality,
          source_type:      sourceType,
          source_id:        sourceId,
          mask_coverage:    maskCoverage,
          mode,
          edit_intent:      intent,
          fidelity_mode:    fidelity,
          premium:          premiumSel,
          references:       payloadReferences(),
        }),
      })
      const data = await res.json()
      // Quality gate (HTTP 200, mas rejeitado): não consumiu nodes, não criou
      // versão. Mostra mensagem + opções, mantém o usuário no editor.
      if (data?.rejected) {
        if (data.balance_after?.total_balance != null) {
          setBalance(data.balance_after.total_balance as number)
        }
        setQualityGate({ message: data.message ?? 'A edição não preservou bem a imagem.', resultUrl: data.result_url, drift: data.out_of_mask_delta })
        return
      }
      if (!res.ok) {
        if (res.status === 402) throw new Error(data?.message ?? 'Saldo insuficiente')
        throw new Error(data?.error ?? 'Erro na edição')
      }

      const outputUrl = data.result_url as string
      setResultUrl(outputUrl)
      if (data.balance_after?.total_balance != null) {
        setBalance(data.balance_after.total_balance as number)
      }
      // Custo realmente cobrado (a rota é reavaliada no servidor).
      const chargedCost = (data.routing?.cost_nodes as number | undefined) ?? cost
      // Append new version to the local history.
      setVersions(prev => {
        const idx = prev.filter(v => !v.isOriginal).length + 1
        const v: EditVersion = {
          id: newId(), url: outputUrl, isOriginal: false,
          label: buildVersionLabel({ index: idx, prompt, mode }),
          prompt, mode, cost: chargedCost, createdAt: Date.now(),
        }
        setActiveVersionId(v.id)
        return [...prev, v]
      })

      // Validação pixel-a-pixel client-side fora da máscara.
      // Wrapped in its own try/catch so a canvas SecurityError (cross-origin CORS)
      // never blocks the user from seeing an already-successful edit result.
      // Pulada quando a SUPERFÍCIE (segmentação) foi usada: a edição estende além
      // do blob pintado, então validar contra ele acusaria drift falso-positivo.
      // Também pulada na edição SEM máscara (imagem inteira — não há "fora").
      if (!fromSurface && maskUrl) {
        setValidating(true)
        try {
          const v = await canvasRef.current?.validateOutsideMaskPreservation(outputUrl)
          if (v && !v.ok) {
            setDriftWarning(v.drift)
          }
        } catch (valErr) {
          console.warn('[retocar] pixel validation skipped:', (valErr as Error).message)
        } finally {
          setValidating(false)
        }
      }

      setStep('result')
    } catch (e) {
      console.error('[retocar] handleGenerate error:', e)
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function confirmSurface() {
    if (!segConfirm) return
    const { surfaceMaskUrl, surfaceCoverage, premiumSel } = segConfirm
    setSegConfirm(null)
    void runGenerate(surfaceMaskUrl, surfaceCoverage, true, premiumSel)
  }
  function useBlobOnly() {
    if (!segConfirm) return
    const { blobMaskUrl, blobCoverage, premiumSel } = segConfirm
    setSegConfirm(null)
    void runGenerate(blobMaskUrl, blobCoverage, false, premiumSel)
  }

  function discardResult() {
    setResultUrl(null)
    setDriftWarning(null)
    setStep('editing')
  }

  function editAgainOnResult() {
    if (!resultUrl) return
    setSourceUrl(resultUrl)
    setSourceType('edit')
    setSourceId(null)
    setResultUrl(null)
    setDriftWarning(null)
    setPrompt('')
    // Limpa referências da edição anterior — senão a textura antiga continuava
    // ativa nas gerações seguintes (achado P1-4 da auditoria).
    setReferences([])
    setSurfaceSel(null) // seleção de superfície era da imagem anterior
    if (canvasRef.current) canvasRef.current.clearMask()
    setStep('editing')
  }

  function startOver() {
    setSourceUrl(null)
    setResultUrl(null)
    setDriftWarning(null)
    setPrompt('')
    setVersions([])
    setActiveVersionId(null)
    setSurfaceSel(null)
    setSurfacePicker(null)
    setStep('empty')
  }

  /** Use a version as the new editing base (replaces source, clears mask & prompt). */
  function useVersionAsBase(v: EditVersion) {
    setSourceUrl(v.url)
    setSourceType('edit')
    setSourceId(null)
    setResultUrl(null)
    setDriftWarning(null)
    setPrompt('')
    setReferences([]) // referência da edição anterior não vale pra nova base
    setSurfaceSel(null)
    setActiveVersionId(v.id)
    if (canvasRef.current) canvasRef.current.clearMask()
    setStep('editing')
  }

  /** View a previously generated version in the result view (compared with Original). */
  function viewVersion(v: EditVersion) {
    setActiveVersionId(v.id)
    if (v.isOriginal) {
      setResultUrl(null)
      setStep('editing')
    } else {
      const original = versions.find(x => x.isOriginal)
      if (original) {
        setSourceUrl(original.url)
        setSourceType(original.isOriginal ? sourceType : 'edit')
      }
      setResultUrl(v.url)
      setStep('result')
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', padding: '32px 24px 80px' }}>

      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 12, color: 'var(--color-text-tertiary)',
        letterSpacing: '-0.005em', marginBottom: 24,
      }}>
        <Link href="/app">Workspace</Link>
        <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Editar</span>
        {step === 'editing' && (
          <>
            <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
            <span>Editando</span>
          </>
        )}
        {step === 'result' && (
          <>
            <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
            <span>Resultado</span>
          </>
        )}
      </div>

      {step === 'empty' && (
        <EmptyStep
          onUpload={() => fileInputRef.current?.click()}
          onImport={() => setShowImport(true)}
          fileInputRef={fileInputRef}
          onFilePicked={onFilePicked}
          error={error}
        />
      )}

      {step === 'editing' && sourceUrl && !intent && (
        <IntentStep
          sourceUrl={sourceUrl}
          onPick={pickIntent}
          onStartOver={startOver}
        />
      )}

      {step === 'editing' && sourceUrl && intent && intentMeta && (
        <EditingStep
          sourceUrl={sourceUrl}
          canvasRef={canvasRef}
          coverage={coverage}
          setCoverage={setCoverage}
          brush={brush}
          setBrush={setBrush}
          tool={tool}
          setTool={setTool}
          maskVisible={maskVisible}
          setMaskVisible={setMaskVisible}
          prompt={prompt}
          setPrompt={setPrompt}
          quality={quality}
          setQuality={setQuality}
          mode={mode}
          intent={intent}
          intentMeta={intentMeta}
          onChangeIntent={changeIntent}
          fidelity={fidelity}
          setFidelity={setFidelity}
          routePreview={routePreview}
          premiumPreview={premiumPreview}
          qualityGate={qualityGate}
          onDismissGate={() => setQualityGate(null)}
          onTryPremium={() => { setQualityGate(null); void handleGenerate(true) }}
          references={references}
          onAddReference={handleAddReferenceKind}
          onRemoveReference={removeReference}
          onClearReferences={clearAllReferences}
          surfaceSel={surfaceSel}
          onOpenSurfacePicker={() => setSurfacePicker({ initial: surfaceSel })}
          onClearSurface={() => setSurfaceSel(null)}
          balance={balance}
          balanceShort={balanceShort}
          premiumShort={premiumShort}
          submitting={submitting}
          validating={validating}
          segmenting={segmenting}
          error={error}
          versions={versions}
          activeVersionId={activeVersionId}
          onPickVersion={viewVersion}
          onUseVersionAsBase={useVersionAsBase}
          onGenerate={handleGenerate}
          onStartOver={startOver}
        />
      )}

      {step === 'result' && sourceUrl && resultUrl && (
        <ResultStep
          sourceUrl={sourceUrl}
          resultUrl={resultUrl}
          prompt={prompt}
          coverage={coverage}
          driftWarning={driftWarning}
          versions={versions}
          activeVersionId={activeVersionId}
          onPickVersion={viewVersion}
          onUseVersionAsBase={useVersionAsBase}
          onEditAgain={editAgainOnResult}
          onDiscard={discardResult}
        />
      )}

      {/* input oculto p/ upload de referência */}
      <input
        ref={refFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => { onRefFilePicked(e.target.files?.[0] ?? null); e.target.value = '' }}
        style={{ display: 'none' }}
      />

      {showImport && (
        <RetocarImportModal
          onClose={() => setShowImport(false)}
          onPick={onImportPicked}
        />
      )}

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
              Em vez de aplicar só no que você pintou, dá pra aplicar o material em <strong>toda a superfície destacada em verde</strong> — até onde ela termina de verdade. <strong>Confira que só a superfície ficou em verde</strong>: se pegou tapete, cama ou móveis (porque o pincel passou por cima deles), use <strong>“Usar só o que pintei”</strong> e pinte de novo evitando os objetos.
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={segConfirm.previewUrl} alt="superfície detectada"
              style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 8, border: '0.5px solid var(--color-border)' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <button type="button" onClick={confirmSurface} className="spn-action"
                style={{ flex: 1, minWidth: 220, width: 'auto', padding: '11px 18px', background: '#1D9E75', color: '#042818', border: '0.5px solid rgba(0,0,0,0.18)' }}>
                Aplicar na superfície — {segConfirm.surfaceCost} nodes
              </button>
              <button type="button"
                onClick={() => {
                  // Caminho 2: a detecção saiu ~90% certa → refina por cliques em
                  // vez de aceitar/recusar. Confirmou no modal → vira surfaceSel e
                  // o usuário gera de novo (o preço já reflete a nova área).
                  setSurfacePicker({ initial: { maskUrl: segConfirm.surfaceMaskUrl, previewUrl: segConfirm.previewUrl, coverage: segConfirm.surfaceCoverage } })
                  setSegConfirm(null)
                }}
                className="spn-action spn-action--ghost"
                style={{ width: 'auto', padding: '11px 16px', fontSize: 12 }}>
                Refinar seleção
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

      {/* Seleção de SUPERFÍCIE por clique (V2 — clique-primeiro no Trocar material) */}
      {surfacePicker && sourceUrl && (
        <SurfaceSelectModal
          imageUrl={sourceUrl}
          initial={surfacePicker.initial}
          onConfirm={sel => { setSurfaceSel(sel); setSurfacePicker(null) }}
          onUseBrush={() => setSurfacePicker(null)}
          onClose={() => setSurfacePicker(null)}
        />
      )}
    </div>
  )
}

// ── Step: empty (upload / import) ────────────────────────────

function EmptyStep({ onUpload, onImport, fileInputRef, onFilePicked, error }: {
  onUpload:     () => void
  onImport:     () => void
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  onFilePicked: (f: File | null) => void
  error:        string | null
}) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 8,
        }}>
          Editar
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          Pós-produção arquitetônica assistida por IA. Pinte a área que quer
          alterar, descreva a mudança e a imagem fora da máscara permanece
          intacta.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => onFilePicked(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          onFilePicked(e.dataTransfer.files[0] ?? null)
        }}
        onClick={onUpload}
        style={{
          maxWidth: 540, margin: '0 auto',
          aspectRatio: '4 / 3',
          background: dragOver ? 'rgba(48,209,88,0.04)' : 'var(--color-bg-elevated)',
          border: dragOver
            ? '1.5px dashed var(--color-accent-green)'
            : '0.5px dashed var(--color-border-strong)',
          borderRadius: 14,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, cursor: 'pointer', padding: 32,
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
          Envie uma imagem ou arraste aqui
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          JPG, PNG ou WebP até 10 MB
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onImport() }}
          style={{
            marginTop: 10,
            fontSize: 12, color: 'var(--color-text-secondary)',
            background: 'transparent', cursor: 'pointer', padding: '6px 12px',
            border: '0.5px solid var(--color-border-strong)', borderRadius: 6,
          }}
        >
          ou Importar do histórico
        </button>
      </div>

      {error && (
        <div style={{
          maxWidth: 540, margin: '14px auto 0',
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}
    </>
  )
}

// ── Step: intenção (intenção-primeiro) ───────────────────────

function IntentStep({ sourceUrl, onPick, onStartOver }: {
  sourceUrl:   string
  onPick:      (i: EditIntent) => void
  onStartOver: () => void
}) {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sourceUrl}
          alt="imagem selecionada"
          style={{
            width: 96, height: 72, objectFit: 'cover', borderRadius: 8,
            border: '0.5px solid var(--color-border-strong)',
          }}
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{
            fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>
            O que você quer fazer nesta imagem?
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
            Escolha o tipo de edição — a interface se adapta ao que você precisa.
          </p>
        </div>
        <button
          onClick={onStartOver}
          style={{
            fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none',
            cursor: 'pointer', textDecoration: 'underline', padding: '4px 0',
          }}
        >
          Trocar imagem
        </button>
      </div>
      <EditIntentPicker onPick={onPick} />
    </div>
  )
}

// ── Step: editing ────────────────────────────────────────────

function EditingStep(props: {
  sourceUrl:    string
  canvasRef:    React.MutableRefObject<RetocarCanvasHandle | null>
  coverage:     number
  setCoverage:  (v: number) => void
  brush:        number
  setBrush:     (v: number) => void
  tool:         MaskTool
  setTool:      (t: MaskTool) => void
  maskVisible:  boolean
  setMaskVisible: (v: boolean) => void
  prompt:       string
  setPrompt:    (v: string) => void
  quality:      Quality
  setQuality:   (q: Quality) => void
  mode:         EditMode
  intent:       EditIntent
  intentMeta:   EditIntentMeta
  onChangeIntent: () => void
  fidelity:     FidelityMode
  setFidelity:  (f: FidelityMode) => void
  routePreview:   RoutePreview | null
  premiumPreview: RoutePreview | null
  qualityGate:   { message: string; resultUrl?: string; drift?: number } | null
  onDismissGate: () => void
  onTryPremium:  () => void
  references:        EditReferenceImage[]
  onAddReference:    (kind: RefMenuKind) => void
  onRemoveReference: (id: string) => void
  onClearReferences: () => void
  surfaceSel:          SurfaceSelection | null
  onOpenSurfacePicker: () => void
  onClearSurface:      () => void
  balance:      number
  balanceShort: boolean
  premiumShort: boolean
  submitting:   boolean
  validating:   boolean
  segmenting:   boolean
  error:        string | null
  versions:        EditVersion[]
  activeVersionId: string | null
  onPickVersion:   (v: EditVersion) => void
  onUseVersionAsBase: (v: EditVersion) => void
  onGenerate:   (premium: boolean) => void
  onStartOver:  () => void
}) {
  const {
    sourceUrl, canvasRef, coverage, setCoverage, brush, setBrush,
    tool, setTool, maskVisible, setMaskVisible,
    prompt, setPrompt, quality, setQuality, mode,
    intent, intentMeta, onChangeIntent,
    fidelity, setFidelity, routePreview, premiumPreview,
    qualityGate, onDismissGate, onTryPremium,
    references, onAddReference, onRemoveReference, onClearReferences,
    surfaceSel, onOpenSurfacePicker, onClearSurface,
    balance, balanceShort, premiumShort,
    submitting, validating, segmenting, error,
    versions, activeVersionId, onPickVersion, onUseVersionAsBase,
    onGenerate, onStartOver,
  } = props

  const largeMask    = coverage > LARGE_MASK_THRESHOLD && !surfaceSel
  const modeMeta     = EDIT_MODE_LABELS[mode]
  const isRemove     = mode === 'remove'
  const maskRequired = intentMeta.maskRequirement === 'required'
  const hasSelection = coverage > 0 || !!surfaceSel
  const disabledBtn  = (maskRequired && !hasSelection) || balanceShort || submitting || (!isRemove && !prompt.trim())
  const disabledPremium = (maskRequired && !hasSelection) || premiumShort || submitting || (!isRemove && !prompt.trim())
  // Seleção por clique disponível só pro Trocar material (escopo V1 da camada
  // de superfície) e atrás da flag de segmentação.
  const showSurfaceBar = intent === 'swap_material' && SURFACE_SEGMENTATION_ENABLED

  // Contextual hint for the mask state.
  let maskHint: string
  if (surfaceSel) {
    maskHint = `Superfície selecionada: ${(surfaceSel.coverage * 100).toFixed(1)}% da imagem.`
  } else if (coverage === 0) {
    maskHint = maskRequired
      ? 'Pinte a área que deseja editar.'
      : 'Sem seleção, a edição considera a imagem inteira. Pinte uma área para limitar.'
  } else if (!isRemove && !prompt) {
    maskHint = 'Descreva a alteração ou escolha um preset.'
  } else {
    maskHint = `Área mascarada: ${(coverage * 100).toFixed(1)}%`
  }

  return (
    <div className="spn-editar-grid">
      {/* Canvas + ação + prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ height: 'calc(100vh - 380px)', minHeight: 420 }}>
          <RetocarCanvas
            ref={canvasRef}
            imageUrl={sourceUrl}
            onMaskChange={setCoverage}
            brush={brush}
            onBrushChange={setBrush}
            tool={tool}
            maskVisible={maskVisible}
            loading={submitting}
            loadingMessage={segmenting ? 'Detectando superfície…' : validating ? 'Validando preservação fora da máscara…' : 'Aplicando edição com IA…'}
          />
        </div>

        <div style={{
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 12, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Intenção ativa — escolhida ANTES do prompt (intenção-primeiro). */}
          <ActiveIntentChip intent={intent} onChange={onChangeIntent} disabled={submitting} />

          <div style={{
            fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
            marginTop: -2, lineHeight: 1.5,
          }}>
            {intentMeta.helper}
          </div>

          {/* Trocar material: seleção de superfície por CLIQUE (pincel = fallback). */}
          {showSurfaceBar && (
            <SurfaceSelectionBar
              selection={surfaceSel}
              onOpen={onOpenSurfacePicker}
              onClear={onClearSurface}
              disabled={submitting}
            />
          )}

          {/* Editar com referência: campos EXPLÍCITOS (principal / referência /
              vista relacionada) — a referência nunca é confundida com a imagem
              que será editada. */}
          {intentMeta.explicitReference && (
            <ExplicitReferenceFields
              sourceUrl={sourceUrl}
              references={references}
              onAddReference={onAddReference}
              onRemoveReference={onRemoveReference}
              disabled={submitting}
            />
          )}

          {/* Prompt Assistant — textarea + chips + presets contextualizados ao modo. */}
          <PromptAssistant
            mode={mode}
            value={prompt}
            onChange={setPrompt}
            disabled={submitting}
          />

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
              color: '#e57373', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {qualityGate && (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: 'rgba(186,117,23,0.12)', border: '0.5px solid rgba(186,117,23,0.35)',
              color: '#e0a766', fontSize: 12.5, lineHeight: 1.5,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <span style={{ fontWeight: 500 }}>A edição foi rejeitada para preservar sua imagem.</span>
              <span style={{ fontSize: 11, color: '#1D9E75' }}>Nenhum node foi consumido.</span>
              {references.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  Dica: aumente um pouco a máscara ao redor do objeto para dar mais contexto à referência.
                </span>
              )}
              {qualityGate.resultUrl && SHOW_REJECTED_DEBUG && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-quaternary)', letterSpacing: '0.04em' }}>
                    DEBUG · resultado rejeitado{qualityGate.drift != null ? ` · ${(qualityGate.drift * 100).toFixed(0)}% fora da máscara` : ''}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qualityGate.resultUrl} alt="rejeitado (debug)"
                    style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 6, border: '0.5px solid var(--color-border)' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button
                  type="button"
                  onClick={onDismissGate}
                  className="spn-action spn-action--ghost"
                  style={{ width: 'auto', padding: '7px 14px', fontSize: 12 }}
                >
                  Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={onTryPremium}
                  className="spn-action spn-action--ghost"
                  style={{ width: 'auto', padding: '7px 14px', fontSize: 12 }}
                >
                  Tentar com edição premium
                </button>
              </div>
            </div>
          )}

          <div style={{
            fontSize: 11, color: 'var(--color-text-tertiary)',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span>{maskHint}</span>
            {largeMask && (
              <span style={{ color: '#e0a766' }}>
                ⚠ Área grande pode comprometer coerência
              </span>
            )}
          </div>
        </div>

        {versions.length > 1 && (
          <VersionStrip
            versions={versions}
            activeId={activeVersionId}
            onPick={onPickVersion}
            onUseAsBase={onUseVersionAsBase}
          />
        )}
      </div>

      {/* Painel lateral direito */}
      <aside style={{
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 12, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 16,
        alignSelf: 'start',
        position: 'sticky', top: 24,
      }}>
        {/* Ferramentas de máscara */}
        <PanelSection label="Ferramentas">
          <MaskToolbar
            brush={brush}
            setBrush={setBrush}
            tool={tool}
            setTool={setTool}
            maskVisible={maskVisible}
            setMaskVisible={setMaskVisible}
            onClear={() => canvasRef.current?.clearMask()}
            onInvert={() => canvasRef.current?.invertMask()}
            disabled={submitting}
          />
        </PanelSection>

        {/* Preservação — toggle simples (ON = máxima fidelidade) */}
        {intentMeta.geometryToggle && (
          <PanelSection label="Preservação do projeto">
            <GeometryToggle
              value={fidelity === 'max'}
              onChange={on => setFidelity(on ? 'max' : 'balanced')}
              disabled={submitting}
            />
          </PanelSection>
        )}

        {/* Resolução final */}
        <PanelSection label="Resolução final">
          <ResolutionControl value={quality} onChange={setQuality} disabled={submitting} />
          <p style={{
            fontSize: 10, color: 'var(--color-text-quaternary)',
            lineHeight: 1.5, marginTop: 6,
          }}>
            Para finalização em alta resolução, envie o resultado para Ampliar.
          </p>
        </PanelSection>

        {/* Referências da edição (V1) */}
        <ReferencesPanel
          references={references}
          onAdd={onAddReference}
          onRemove={onRemoveReference}
          onClearAll={onClearReferences}
          primaryRole={mode === 'material' ? 'material_texture' : mode === 'replace' || mode === 'add' ? 'object_reference' : null}
          disabled={submitting}
        />

        {/* Saldo + ação principal */}
        <div style={{
          marginTop: 'auto', paddingTop: 14,
          borderTop: '0.5px solid var(--color-border)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 11, color: 'var(--color-text-tertiary)',
          }}>
            <span>Saldo</span>
            <span style={{
              color: balanceShort ? '#e57373' : 'var(--color-text-primary)',
              fontWeight: 500,
            }}>
              {balance} nodes
            </span>
          </div>
          {/* Edição rápida (Google padrão) — botão principal */}
          <button
            onClick={() => onGenerate(false)}
            disabled={disabledBtn}
            className="spn-action"
            style={{
              background: '#1D9E75', color: '#042818',
              border: '0.5px solid rgba(0,0,0,0.18)',
              opacity: disabledBtn ? 0.5 : 1,
              cursor: disabledBtn ? 'not-allowed' : 'pointer',
              boxShadow: !disabledBtn
                ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.22)'
                : 'none',
              padding: '13px 16px',
            }}
          >
            {submitting
              ? (segmenting ? 'Detectando superfície…' : validating ? 'Validando…' : 'Aplicando edição com IA…')
              : (routePreview
                  ? (routePreview.isFreeFix ? routePreview.label : `Edição rápida — ${routePreview.costNodes} ${routePreview.costNodes === 1 ? 'node' : 'nodes'}`)
                  : modeMeta.ctaVerb)}
          </button>
          {/* Edição premium — opt-in explícito, nunca automático */}
          <button
            onClick={() => onGenerate(true)}
            disabled={disabledPremium}
            className="spn-action spn-action--ghost"
            title="Modelo de máxima qualidade para pedidos complexos."
            style={{
              padding: '11px 16px', fontSize: 12,
              opacity: disabledPremium ? 0.5 : 1,
              cursor: disabledPremium ? 'not-allowed' : 'pointer',
            }}
          >
            {premiumPreview
              ? `✦ Edição premium — ${premiumPreview.costNodes} nodes`
              : '✦ Edição premium'}
          </button>
          {!submitting && routePreview?.explanation && (
            <p style={{
              fontSize: 10.5, color: routePreview.isFreeFix ? '#1D9E75' : 'var(--color-text-tertiary)',
              lineHeight: 1.5, textAlign: 'center', margin: 0,
            }}>
              {routePreview.explanation}
            </p>
          )}
          <button
            onClick={onStartOver}
            disabled={submitting}
            style={{
              fontSize: 11, color: 'var(--color-text-tertiary)',
              background: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              textDecoration: 'underline', padding: '4px 0',
              opacity: submitting ? 0.4 : 1,
            }}
          >
            Trocar imagem original
          </button>
        </div>
      </aside>
    </div>
  )
}

// ── Painel: ferramentas de máscara ──────────────────────────
// (exported so the /dev sandbox can mount them in isolation)

export function MaskToolbar({
  brush, setBrush, tool, setTool, maskVisible, setMaskVisible,
  onClear, onInvert, disabled,
}: {
  brush:          number
  setBrush:       (v: number) => void
  tool:           MaskTool
  setTool:        (t: MaskTool) => void
  maskVisible:    boolean
  setMaskVisible: (v: boolean) => void
  onClear:        () => void
  onInvert:       () => void
  disabled:       boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Brush / eraser toggle */}
      <div style={{
        display: 'flex', gap: 3, padding: 3,
        background: 'var(--color-surface)', borderRadius: 8,
      }}>
        <ToolToggle
          active={tool === 'brush'}
          disabled={disabled}
          onClick={() => setTool('brush')}
          label="Pincel"
          icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l3-3 9.5-9.5a2.1 2.1 0 0 0-3-3L3 15v6z"/><line x1="11" y1="6" x2="18" y2="13"/></svg>}
        />
        <ToolToggle
          active={tool === 'eraser'}
          disabled={disabled}
          onClick={() => setTool('eraser')}
          label="Borracha"
          icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7l-4-4 11-11 9 9-3 6z"/><line x1="9" y1="9" x2="17" y2="17"/></svg>}
        />
      </div>

      {/* Brush size slider */}
      <div>
        <div style={{
          fontSize: 11, color: 'var(--color-text-tertiary)',
          marginBottom: 6, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Tamanho do {tool === 'eraser' ? 'apagador' : 'pincel'}</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{brush}px</span>
        </div>
        <input
          type="range"
          min={BRUSH_MIN} max={BRUSH_MAX}
          value={brush}
          onChange={e => setBrush(Number(e.target.value))}
          disabled={disabled}
          style={{ width: '100%', accentColor: '#1D9E75' }}
        />
      </div>

      {/* Ver/ocultar + inverter — botões secundários inline */}
      <div style={{ display: 'flex', gap: 6 }}>
        <SecondaryAction
          disabled={disabled}
          onClick={() => setMaskVisible(!maskVisible)}
          title={maskVisible ? 'Ocultar máscara' : 'Mostrar máscara'}
        >
          {maskVisible ? 'Ocultar' : 'Mostrar'}
        </SecondaryAction>
        <SecondaryAction
          disabled={disabled}
          onClick={onInvert}
          title="Inverter máscara"
        >
          Inverter
        </SecondaryAction>
      </div>

      <button
        onClick={onClear}
        disabled={disabled}
        className="spn-action spn-action--ghost"
        style={{ width: '100%', padding: '8px 14px', fontSize: 12 }}
      >
        Limpar máscara
      </button>

      {/* Recursos futuros — placeholders visuais, ainda não funcionais */}
      <ComingSoon disabled={disabled} />

      <div style={{
        fontSize: 10, color: 'var(--color-text-quaternary)', lineHeight: 1.55,
      }}>
        Atalhos: <kbd style={kbdStyle}>Cmd/Ctrl+Z</kbd> desfazer ·{' '}
        <kbd style={kbdStyle}>[</kbd> <kbd style={kbdStyle}>]</kbd> ajusta pincel
      </div>
    </div>
  )
}

function ToolToggle({ active, disabled, onClick, label, icon }: {
  active:   boolean
  disabled: boolean
  onClick:  () => void
  label:    string
  icon:     React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1, padding: '7px 4px', borderRadius: 6,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        background: active ? 'var(--color-bg-elevated)' : 'transparent',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontSize: 11, fontWeight: active ? 500 : 400,
        letterSpacing: '-0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
        opacity: disabled && !active ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function SecondaryAction({ children, onClick, disabled, title }: {
  children: React.ReactNode
  onClick:  () => void
  disabled: boolean
  title?:   string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        flex: 1,
        padding: '7px 10px',
        background: 'var(--color-bg)',
        border: '0.5px solid var(--color-border-strong)',
        borderRadius: 7,
        color: 'var(--color-text-secondary)',
        fontSize: 11, letterSpacing: '-0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function ComingSoon({ disabled }: { disabled: boolean }) {
  const items = [
    'Suavizar borda',
    'Expandir máscara',
    'Reduzir máscara',
    'Selecionar parede',
    'Selecionar piso',
    'Selecionar céu',
    'Selecionar vegetação',
  ]
  return (
    <details style={{ width: '100%' }}>
      <summary style={{
        listStyle: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-quaternary)',
        padding: '4px 0', userSelect: 'none',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4z" /></svg>
        Em breve
      </summary>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6,
      }}>
        {items.map(it => (
          <span
            key={it}
            style={{
              padding: '4px 8px',
              fontSize: 10,
              color: 'var(--color-text-quaternary)',
              background: 'var(--color-bg)',
              border: '0.5px dashed var(--color-border)',
              borderRadius: 6,
              letterSpacing: '-0.005em',
              cursor: 'not-allowed',
            }}
          >
            {it}
          </span>
        ))}
      </div>
    </details>
  )
}

// ── Painel: controle de fidelidade ───────────────────────────

export function FidelityControl({ value, onChange, disabled }: {
  value:    FidelityMode
  onChange: (v: FidelityMode) => void
  disabled: boolean
}) {
  const meta = FIDELITY_LABELS[value]
  const options: FidelityMode[] = ['max', 'balanced', 'creative']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', gap: 3, padding: 3,
        background: 'var(--color-surface)', borderRadius: 8,
      }}>
        {options.map(o => {
          const active = o === value
          const short  = o === 'max' ? 'Máxima' : o === 'balanced' ? 'Equilibrado' : 'Criativo'
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 6,
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: 11, fontWeight: active ? 500 : 400,
                letterSpacing: '-0.005em',
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
                opacity: disabled && !active ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              {short}
            </button>
          )
        })}
      </div>
      <p style={{
        fontSize: 10, color: 'var(--color-text-quaternary)',
        lineHeight: 1.55,
      }}>
        {meta.description}
      </p>
    </div>
  )
}

// ── Painel: controle de resolução final ─────────────────────

export function ResolutionControl({ value, onChange, disabled }: {
  value:    Quality
  onChange: (q: Quality) => void
  disabled: boolean
}) {
  const options: { id: Quality; label: string }[] = [
    { id: 'hd', label: 'Manter atual' },
    { id: '2k', label: '2K' },
    { id: '4k', label: '4K' },
  ]
  return (
    <div style={{
      display: 'flex', gap: 3, padding: 3,
      background: 'var(--color-surface)', borderRadius: 8,
    }}>
      {options.map(o => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.id)}
            style={{
              flex: 1, padding: '7px 4px', borderRadius: 6,
              background: active ? 'var(--color-bg-elevated)' : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontSize: 11, fontWeight: active ? 500 : 400,
              letterSpacing: '-0.005em',
              cursor: disabled ? 'not-allowed' : 'pointer',
              boxShadow: active ? 'inset 0 0 0 0.5px var(--color-border-strong)' : 'none',
              opacity: disabled && !active ? 0.5 : 1,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Painel: toggle de preservação de geometria ──────────────
// Liga/desliga a cláusula estrita: ON → fidelity 'max'; OFF → 'balanced'.

export function GeometryToggle({ value, onChange, disabled }: {
  value:    boolean
  onChange: (v: boolean) => void
  disabled: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '9px 12px', borderRadius: 8,
          background: value ? 'rgba(29,158,117,0.12)' : 'var(--color-surface)',
          border: value ? '0.5px solid rgba(29,158,117,0.5)' : '0.5px solid var(--color-border-strong)',
          color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          letterSpacing: '-0.005em', textAlign: 'left',
        }}
      >
        <span>Preservar geometria, perspectiva e iluminação original</span>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', whiteSpace: 'nowrap',
          color: value ? '#1D9E75' : 'var(--color-text-quaternary)',
        }}>
          {value ? 'ATIVADO' : 'DESATIVADO'}
        </span>
      </button>
      <p style={{ fontSize: 10, color: 'var(--color-text-quaternary)', lineHeight: 1.55 }}>
        Recomendado para projetos reais. Desligado, o modelo ganha liberdade para
        pequenas adaptações dentro da área editada.
      </p>
    </div>
  )
}

// ── Editar com referência: campos explícitos ─────────────────
// Imagem principal (a que SERÁ editada) / Imagem de referência (guia, nunca
// editada) / Vista relacionada do projeto (opcional, consistência).

function ExplicitReferenceFields({ sourceUrl, references, onAddReference, onRemoveReference, disabled }: {
  sourceUrl:         string
  references:        EditReferenceImage[]
  onAddReference:    (kind: RefMenuKind) => void
  onRemoveReference: (id: string) => void
  disabled:          boolean
}) {
  const objectRef  = references.find(r => r.role === 'object_reference')
  const projectRef = references.find(r => r.role === 'project_render' || r.role === 'consistency_reference')

  const fieldStyle: React.CSSProperties = {
    flex: 1, minWidth: 180,
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: 10, borderRadius: 10,
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--color-text-quaternary)',
  }
  const thumbStyle: React.CSSProperties = {
    width: '100%', height: 74, objectFit: 'cover', borderRadius: 7,
    border: '0.5px solid var(--color-border-strong)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Imagem principal */}
        <div style={fieldStyle}>
          <span style={labelStyle}>Imagem principal</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sourceUrl} alt="imagem principal" style={thumbStyle} />
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            É esta imagem que será editada.
          </span>
        </div>

        {/* Imagem de referência */}
        <div style={fieldStyle}>
          <span style={labelStyle}>Imagem de referência</span>
          {objectRef ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={objectRef.url} alt="referência" style={thumbStyle} />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveReference(objectRef.id)}
                style={{
                  fontSize: 10, color: 'var(--color-text-tertiary)', background: 'none',
                  textDecoration: 'underline', cursor: 'pointer', padding: 0, textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                Remover referência
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddReference('object')}
              className="spn-action spn-action--ghost"
              style={{ width: '100%', padding: '18px 10px', fontSize: 11 }}
            >
              + Adicionar referência
            </button>
          )}
        </div>

        {/* Vista relacionada (opcional) */}
        <div style={fieldStyle}>
          <span style={labelStyle}>Vista relacionada · opcional</span>
          {projectRef ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={projectRef.url} alt="vista relacionada" style={thumbStyle} />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveReference(projectRef.id)}
                style={{
                  fontSize: 10, color: 'var(--color-text-tertiary)', background: 'none',
                  textDecoration: 'underline', cursor: 'pointer', padding: 0, textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                Remover vista
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddReference('project_render')}
              className="spn-action spn-action--ghost"
              style={{ width: '100%', padding: '18px 10px', fontSize: 11 }}
            >
              + Vista do projeto
            </button>
          )}
        </div>
      </div>
      <p style={{
        fontSize: 10.5, color: 'var(--color-text-tertiary)', lineHeight: 1.5, margin: 0,
        padding: '7px 10px', borderRadius: 7,
        background: 'rgba(29,158,117,0.06)', border: '0.5px solid rgba(29,158,117,0.22)',
      }}>
        A referência não será editada — ela serve apenas como guia visual para a
        área selecionada na imagem principal.
      </p>
    </div>
  )
}

// ── Step: result ─────────────────────────────────────────────

function ResultStep({
  sourceUrl, resultUrl, prompt, coverage, driftWarning,
  versions, activeVersionId, onPickVersion, onUseVersionAsBase,
  onEditAgain, onDiscard,
}: {
  sourceUrl:    string
  resultUrl:    string
  prompt:       string
  coverage:     number
  driftWarning: number | null
  versions:        EditVersion[]
  activeVersionId: string | null
  onPickVersion:   (v: EditVersion) => void
  onUseVersionAsBase: (v: EditVersion) => void
  onEditAgain:  () => void
  onDiscard:    () => void
}) {
  const [sliderPos, setSliderPos] = useState(50)
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{
          fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.025em', marginBottom: 6,
        }}>
          Resultado
        </h2>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {prompt && (
            <>Prompt: <span style={{ color: 'var(--color-text-secondary)' }}>&quot;{prompt}&quot;</span></>
          )}
          <span style={{ marginLeft: prompt ? 12 : 0 }}>· área editada: {(coverage * 100).toFixed(1)}%</span>
        </div>
      </div>

      {driftWarning !== null && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(186,117,23,0.12)', border: '0.5px solid rgba(186,117,23,0.3)',
          color: '#e0a766', fontSize: 12, letterSpacing: '-0.005em',
        }}>
          ⚠ O motor alterou {(driftWarning * 100).toFixed(1)}% dos pixels fora da máscara
          (acima do limite recomendado de 2%). Considere refazer ou ajustar a máscara.
        </div>
      )}

      <BeforeAfterSlider
        beforeUrl={sourceUrl}
        afterUrl={resultUrl}
        pos={sliderPos}
        setPos={setSliderPos}
      />

      {versions.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <VersionStrip
            versions={versions}
            activeId={activeVersionId}
            onPick={onPickVersion}
            onUseAsBase={onUseVersionAsBase}
          />
        </div>
      )}

      <div style={{
        marginTop: 18, display: 'flex', gap: 10, justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <button onClick={onDiscard} className="spn-action spn-action--ghost"
          style={{ width: 'auto', padding: '10px 18px', fontSize: 12, color: '#e57373' }}>
          Descartar
        </button>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onEditAgain} className="spn-action spn-action--ghost"
            style={{ width: 'auto', padding: '10px 18px', fontSize: 12 }}>
            ✦ Editar de novo
          </button>
          <a
            href={resultUrl} download="editar-result.jpg" target="_blank" rel="noopener noreferrer"
            className="spn-action spn-action--primary"
            style={{ width: 'auto', padding: '10px 18px', fontSize: 12, textDecoration: 'none' }}
          >
            ⤓ Download
          </a>
        </div>
      </div>
    </>
  )
}

function BeforeAfterSlider({ beforeUrl, afterUrl, pos, setPos }: {
  beforeUrl: string; afterUrl: string; pos: number; setPos: (n: number) => void
}) {
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
    setPos(Math.max(0, Math.min(100, pct)))
  }

  return (
    <div
      ref={ref}
      onPointerDown={e => { setDragging(true); move(e.clientX); (e.target as Element).setPointerCapture(e.pointerId) }}
      onPointerMove={e => { if (dragging) move(e.clientX) }}
      onPointerUp={() => setDragging(false)}
      style={{
        position: 'relative', width: '100%',
        aspectRatio: '4 / 3', borderRadius: 12, overflow: 'hidden',
        background: 'var(--color-bg-elevated)', cursor: 'ew-resize',
        userSelect: 'none', touchAction: 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterUrl} alt="depois"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
      <div style={{ position: 'absolute', inset: 0, width: `${pos}%`, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeUrl} alt="antes"
          style={{ position: 'absolute', inset: 0, height: '100%', objectFit: 'contain', width: containerWidth ?? '100%' }} draggable={false} />
      </div>
      {/* Cortina */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: `${pos}%`,
        width: 2, background: '#fff', transform: 'translateX(-1px)',
        boxShadow: '0 0 12px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 28, height: 28, borderRadius: 999, background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: '#1a1a1a',
        }}>
          ◂▸
        </div>
      </div>
      <div style={{
        position: 'absolute', top: 12, left: 12,
        padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.55)',
        color: '#fff', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>antes</div>
      <div style={{
        position: 'absolute', top: 12, right: 12,
        padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.55)',
        color: '#fff', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>depois</div>
    </div>
  )
}

// ── Version strip ───────────────────────────────────────────
// Lista compacta horizontal das versões geradas na sessão. A versão ativa
// aparece com anel verde; click na thumb visualiza ela no comparador.
// Hover na thumb expõe um botão "Editar a partir" pra recomeçar com ela.

export function VersionStrip({ versions, activeId, onPick, onUseAsBase }: {
  versions:    EditVersion[]
  activeId:    string | null
  onPick:      (v: EditVersion) => void
  onUseAsBase: (v: EditVersion) => void
}) {
  return (
    <div style={{
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 12, padding: 12,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 8,
      }}>
        <PanelLabel>Histórico de versões</PanelLabel>
        <span style={{ fontSize: 10, color: 'var(--color-text-quaternary)' }}>
          {versions.length} {versions.length === 1 ? 'versão' : 'versões'}
        </span>
      </div>
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        paddingBottom: 4,
        scrollbarWidth: 'thin',
      }}>
        {versions.map(v => (
          <VersionThumb
            key={v.id}
            version={v}
            active={v.id === activeId}
            onPick={() => onPick(v)}
            onUseAsBase={() => onUseAsBase(v)}
          />
        ))}
      </div>
    </div>
  )
}

function VersionThumb({ version, active, onPick, onUseAsBase }: {
  version:     EditVersion
  active:      boolean
  onPick:      () => void
  onUseAsBase: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: 96,
        display: 'flex', flexDirection: 'column', gap: 5,
      }}
    >
      <button
        type="button"
        onClick={onPick}
        title={version.label}
        style={{
          position: 'relative', width: 96, height: 72,
          padding: 0, borderRadius: 8, overflow: 'hidden',
          background: 'var(--color-bg)',
          border: active ? '1.5px solid #1D9E75' : '0.5px solid var(--color-border-strong)',
          cursor: 'pointer',
          boxShadow: active ? '0 0 0 2px rgba(29,158,117,0.18)' : 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={version.url}
          alt={version.label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {version.isOriginal && (
          <span style={{
            position: 'absolute', top: 4, left: 4,
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(0,0,0,0.6)',
            fontSize: 8, fontWeight: 600, letterSpacing: '0.08em',
            color: '#fff', textTransform: 'uppercase',
          }}>
            Original
          </span>
        )}
        {!version.isOriginal && hover && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onUseAsBase() }}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(10,10,10,0.78)',
              color: 'var(--color-text-primary)',
              fontSize: 10, fontWeight: 500, letterSpacing: '-0.005em',
              cursor: 'pointer', border: 'none',
            }}
          >
            Editar a partir
          </button>
        )}
      </button>
      <div style={{
        fontSize: 10, color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        fontWeight: active ? 500 : 400,
        letterSpacing: '-0.005em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {version.label}
      </div>
    </div>
  )
}

// ── Helpers de painel ────────────────────────────────────────

export function PanelSection({ label, children }: {
  label:    string
  children: React.ReactNode
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PanelLabel>{label}</PanelLabel>
      {children}
    </section>
  )
}

export function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--color-text-tertiary)',
    }}>
      {children}
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0 4px',
  fontFamily: 'inherit',
  fontSize: 9,
  color: 'var(--color-text-tertiary)',
  background: 'var(--color-surface)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 3,
  letterSpacing: 0,
}
