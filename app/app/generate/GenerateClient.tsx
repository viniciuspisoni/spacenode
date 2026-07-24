'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ConstellationN } from '@/components/brand'
import {
  ProjectType, ProjectMaterials,
  getSegments, getEnvironments, getLighting, getBackgrounds, getSceneElements,
} from '@/lib/prompts'
import {
  ENGINES, ENGINE_ORDER, DEFAULT_ENGINE, DEFAULT_RESOLUTION,
  type EngineId, type Resolution,
  getNodesCost, isEngineId, isResolution, isValidCombination,
} from '@/lib/engines'
import { EngineIcon } from '@/components/icons/engines'
import InsufficientNodesCta from '@/components/app/InsufficientNodesCta'
import { consumeHandoff } from '@/components/nodi/actions-bus'

interface GenerateClientProps {
  initialCredits:    number
  initialMaterials?: ProjectMaterials
  initialConfig?:    ProjectConfig | null
  /** URL https de uma render existente a pré-carregar como input (ex.: "Reutilizar" no dashboard). */
  initialSourceUrl?: string
}

// Persisted last-used render config (profiles.project_config — JSONB).
// Type-strict fields (projectType / fidelityLevel / engine / resolution) are
// validated on load; free-text taxonomy strings flow through as-is.
interface ProjectConfig {
  projectType?:        ProjectType
  segment?:            string
  environment?:        string
  lighting?:           string
  background?:         string
  sceneElements?:      string[]
  fidelityLevel?:      FidelityLevel
  selectedEngine?:     EngineId
  selectedResolution?: Resolution
}

interface GenerateResult {
  outputUrl: string
  renderId?: string | null
  credits:   number
  prompt?:   string
  error?:    string
}

const LOADING_TEXTS = [
  'Analisando composição...',
  'Ajustando iluminação...',
  'Refinando materiais...',
  'Aplicando fotorrealismo...',
  'Gerando versão final...',
]

type FidelityLevel = 'maximum' | 'balanced' | 'creative'

const FIDELITY_LEVELS: { id: FidelityLevel; label: string; desc: string }[] = [
  { id: 'maximum',  label: 'Máxima',     desc: 'Preserva tudo do projeto'           },
  { id: 'balanced', label: 'Equilibrado',desc: 'Pequenas melhorias permitidas'      },
  { id: 'creative', label: 'Criativo',   desc: 'Mais liberdade estética'            },
]

const RESOLUTION_DESC: Record<Resolution, string> = {
  hd: 'Rápido para testes',
  '2k': 'Ideal para apresentação',
  '4k': 'Máxima definição',
}

const EMPTY_MATERIALS: ProjectMaterials = {
  fachada: '', piso: '', esquadrias: '',
  paredes: '', teto: '', marcenaria: '', bancadas: '',
  elementos: '', outros: '',
}

// Campos de materiais por tipo de projeto. A lista usada na UI é escolhida em
// runtime conforme projectType — campos que não fazem sentido no contexto não
// aparecem (ex: "Revestimento de fachada" some quando o user troca pra interior).
type MaterialField = {
  field:       keyof ProjectMaterials
  label:       string
  placeholder: string
}

const MATERIAL_FIELDS_INTERIOR: readonly MaterialField[] = [
  { field: 'piso',       label: 'Piso',                    placeholder: 'ex: porcelanato 90×90 cinza claro, taco de madeira freijó' },
  { field: 'paredes',    label: 'Paredes / Revestimentos', placeholder: 'ex: pintura branco fosco, painel ripado de carvalho' },
  { field: 'teto',       label: 'Teto',                    placeholder: 'ex: gesso liso branco, sanca com fita LED' },
  { field: 'marcenaria', label: 'Marcenaria',              placeholder: 'ex: armários laqueados off-white, painéis de freijó' },
  { field: 'bancadas',   label: 'Bancadas',                placeholder: 'ex: quartzo branco 2cm, mármore Calacatta' },
  { field: 'esquadrias', label: 'Portas e caixilhos',      placeholder: 'ex: portas de correr em alumínio preto fosco' },
  { field: 'elementos',  label: 'Elementos especiais',     placeholder: 'ex: lareira a gás, pé-direito duplo, escada flutuante' },
  { field: 'outros',     label: 'Observações adicionais',  placeholder: 'ex: tapete grande na sala, cortinas até o chão' },
]

const MATERIAL_FIELDS_EXTERIOR: readonly MaterialField[] = [
  { field: 'fachada',    label: 'Revestimento de fachada', placeholder: 'ex: placas cimentícias texturizadas, ACM preto' },
  { field: 'piso',       label: 'Piso externo / calçada',  placeholder: 'ex: porcelanato 90×90 cinza claro' },
  { field: 'esquadrias', label: 'Esquadrias / caixilhos',  placeholder: 'ex: alumínio preto fosco' },
  { field: 'elementos',  label: 'Elementos especiais',     placeholder: 'ex: painel de madeira ipê, brise metálico' },
  { field: 'outros',     label: 'Observações adicionais',  placeholder: 'ex: estrutura em concreto aparente, laje invertida' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function firstOf(arr: string[]): string { return arr[0] ?? '' }

// ── Compressão de imagem no client ────────────────────────────────────────────
//
// Aceita uploads de até 10 MB e devolve um JPEG normalizado em até maxSide px
// no maior lado. Garante que o payload base64 enviado pro /api/generate fique
// confortavelmente abaixo do limite de ~4.5 MB da Vercel, independente do que
// o usuário subir (foto de celular, PNG enorme, render exportado em alta).
async function compressImage(
  dataUrl: string,
  maxSide: number = 2048,
  quality: number = 0.92,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      const longest = Math.max(width, height)
      const scale   = longest > maxSide ? maxSide / longest : 1
      const targetW = Math.round(width * scale)
      const targetH = Math.round(height * scale)
      const canvas  = document.createElement('canvas')
      canvas.width  = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('CANVAS_UNSUPPORTED')); return }
      ctx.drawImage(img, 0, 0, targetW, targetH)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = dataUrl
  })
}

// Download forçado via proxy do nosso próprio backend. /api/download faz
// fetch server-side da imagem e devolve com Content-Disposition: attachment,
// que faz o browser salvar em vez de abrir. Funciona independente de CORS
// no CDN.
function downloadImage(url: string, filename: string) {
  const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
  const a = document.createElement('a')
  a.href = proxyUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function deriveDefaults(projectType: ProjectType, segment: string) {
  const envs   = getEnvironments(projectType, segment)
  const lights = getLighting(projectType, segment)
  const bgs    = getBackgrounds(projectType)
  return {
    environment: firstOf(envs),
    lighting:    firstOf(lights),
    background:  firstOf(bgs),
  }
}

// Hidrata o estado inicial a partir do project_config persistido. Campos
// tipo-estrito caem pra default se a string salva for desconhecida (ex: engine
// removida). Combinação engine×resolução também é checada — saved Vega+HD
// passou a ser inválido depois de Pricing v2 e quebraria getNodesCost.
function resolveInitialConfig(cfg: ProjectConfig | null | undefined) {
  const projectType: ProjectType =
    cfg?.projectType === 'interior' || cfg?.projectType === 'exterior'
      ? cfg.projectType : 'exterior'
  const fidelityLevel: FidelityLevel =
    cfg?.fidelityLevel === 'balanced' || cfg?.fidelityLevel === 'creative'
      ? cfg.fidelityLevel : 'maximum'
  const engine: EngineId = isEngineId(cfg?.selectedEngine) ? cfg.selectedEngine : DEFAULT_ENGINE
  const rawRes: Resolution = isResolution(cfg?.selectedResolution) ? cfg.selectedResolution : DEFAULT_RESOLUTION
  const resolution: Resolution = isValidCombination(engine, rawRes) ? rawRes : ENGINES[engine].resolutions[0]
  const sceneElements: string[] = Array.isArray(cfg?.sceneElements)
    ? cfg.sceneElements.filter((x): x is string => typeof x === 'string')
    : []
  return {
    projectType,
    segment:            cfg?.segment     ?? 'Residencial',
    environment:        cfg?.environment ?? 'Fachada Residencial',
    lighting:           cfg?.lighting    ?? 'Preservar Original',
    background:         cfg?.background  ?? 'Preservar Original',
    sceneElements,
    fidelityLevel,
    selectedEngine:     engine,
    selectedResolution: resolution,
  }
}

function ProjectTypeGlyph({ type }: { type: ProjectType }) {
  if (type === 'exterior') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.55" />
        <path d="M12 3.8v2.1M12 18.1v2.1M20.2 12h-2.1M5.9 12H3.8M17.8 6.2l-1.5 1.5M7.7 16.3l-1.5 1.5M17.8 17.8l-1.5-1.5M7.7 7.7 6.2 6.2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5.3" y="5.3" width="13.4" height="13.4" rx="3" stroke="currentColor" strokeWidth="1.45" />
      <rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1.8" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

export function GenerateClient({ initialCredits, initialMaterials, initialConfig, initialSourceUrl }: GenerateClientProps) {
  const init = resolveInitialConfig(initialConfig)
  const supabase = createClient()

  // ── Global state
  const [credits,            setCredits]           = useState(initialCredits)
  const [loading,            setLoading]           = useState(false)
  const [loadingText,        setLoadingText]       = useState('')
  const [loadingTextVisible, setLoadingTextVisible] = useState(true)
  const [generationKey,      setGenerationKey]     = useState(0)
  const [error,              setError]             = useState<string | null>(null)

  // ── Tipo e Segmento
  const [projectType, setProjectType] = useState<ProjectType>(init.projectType)
  const [segment,     setSegment]     = useState<string>(init.segment)

  // ── Ambiente, Iluminação, Background
  const [environment, setEnvironment] = useState<string>(init.environment)
  const [lighting,    setLighting]    = useState<string>(init.lighting)
  const [background,  setBackground]  = useState<string>(init.background)

  // ── Elementos na Cena (múltipla seleção)
  const [sceneElements, setSceneElements] = useState<string[]>(init.sceneElements)

  // ── Parâmetros técnicos
  const geometryLock = 85
  const fidelityMode = 'strict' as const
  const [fidelityLevel,      setFidelityLevel]      = useState<FidelityLevel>(init.fidelityLevel)
  const [selectedEngine,     setSelectedEngine]     = useState<EngineId>(init.selectedEngine)
  const [selectedResolution, setSelectedResolution] = useState<Resolution>(init.selectedResolution)

  // ── Materiais
  const [materiaisAberto, setMateriaisAberto] = useState(false)
  const [elemAberto,      setElemAberto]      = useState(false)
  const [materials,       setMaterials]       = useState<ProjectMaterials>(initialMaterials ?? EMPTY_MATERIALS)
  const [salvando,        setSalvando]        = useState(false)
  const [salvoOk,         setSalvoOk]         = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Imagem e resultado
  const [imagePreview,      setImagePreview]      = useState<string | null>(null)
  const [outputUrl,         setOutputUrl]         = useState<string | null>(null)
  // Id da última render persistida — usado pelo CTA "Criar Space" pra
  // ligar o Space novo à render como Vista Mestre.
  const [lastRenderId,      setLastRenderId]      = useState<string | null>(null)
  const [sliderPos,         setSliderPos]         = useState(50)
  const [isDraggingSlider,  setIsDraggingSlider]  = useState(false)
  const [isDraggingFile,    setIsDraggingFile]    = useState(false)

  // ── Zoom + pan da imagem comparativa.
  //    Wheel (com cursor sobre a imagem) zooma com origem no cursor; drag
  //    passa a fazer pan quando scale > 1; duplo-clique reseta.
  const [scale,             setScale]             = useState(1)
  const [pan,               setPan]               = useState({ x: 0, y: 0 })
  const [isPanning,         setIsPanning]         = useState(false)

  // ── Âncora visual: render anterior usado pra manter consistência de
  //    materiais/texturas entre gerações sucessivas do mesmo input.
  //    Default true; usuário pode desligar pra começar do zero.
  const [useAnchor, setUseAnchor] = useState(true)

  // ── Refinar imagem: pedido cirúrgico pra alterar só uma coisa entre gerações.
  //    Só faz efeito quando há render anterior (anchor) — sem isso o modelo não
  //    tem referência fixa do "tudo o que deve ser preservado".
  const [refinementText, setRefinementText] = useState('')

  // ── Handoff do Nodi (ação confirmada no painel): pré-preenche engine,
  //    resolução e direção de refino. Aplicado pós-mount via rAF (sem mismatch
  //    de hidratação, sem setState síncrono em effect). O clique que gasta
  //    nodes continua sendo o botão Gerar.
  useEffect(() => {
    const handoff = consumeHandoff('renderizar')
    if (!handoff) return
    const raf = requestAnimationFrame(() => {
      const engine = handoff.settings?.engine
      const resolution = handoff.settings?.resolution
      if (isEngineId(engine)) {
        setSelectedEngine(engine)
        setSelectedResolution(
          isResolution(resolution) && isValidCombination(engine, resolution)
            ? resolution
            : ENGINES[engine].resolutions[0],
        )
      }
      if (handoff.prompt) setRefinementText(handoff.prompt)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const fileInputRef         = useRef<HTMLInputElement>(null)
  const compareRef           = useRef<HTMLDivElement>(null)
  const loadingTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const isDraggingSliderRef  = useRef(false)
  const isPanningRef         = useRef(false)
  const panStartRef          = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null)
  const zoomStateRef         = useRef({ scale: 1, panX: 0, panY: 0 })

  // ── Cascade: projectType → reset segment + children
  const handleProjectTypeChange = (type: ProjectType) => {
    const segs    = getSegments(type)
    const newSeg  = firstOf(segs)
    const defs    = deriveDefaults(type, newSeg)
    setProjectType(type)
    setSegment(newSeg)
    setEnvironment(defs.environment)
    setLighting(defs.lighting)
    setBackground(defs.background)
    setSceneElements([])
  }

  // ── Cascade: segment → reset environment + lighting + elements
  const handleSegmentChange = (seg: string) => {
    const defs = deriveDefaults(projectType, seg)
    setSegment(seg)
    setEnvironment(defs.environment)
    setLighting(defs.lighting)
    setSceneElements([])
  }

  // ── Toggle scene element
  const toggleElement = (el: string) => {
    setSceneElements(prev =>
      prev.includes(el) ? prev.filter(e => e !== el) : [...prev, el]
    )
  }

  // ── Loading texts
  const startLoadingTexts = () => {
    let i = 0
    setLoadingText(LOADING_TEXTS[0])
    setLoadingTextVisible(true)
    setGenerationKey(k => k + 1)
    loadingTimerRef.current = setInterval(() => {
      setLoadingTextVisible(false)
      setTimeout(() => {
        i = (i + 1) % LOADING_TEXTS.length
        setLoadingText(LOADING_TEXTS[i])
        setLoadingTextVisible(true)
      }, 220)
    }, 1500)
  }
  const stopLoadingTexts = () => {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }
  useEffect(() => () => stopLoadingTexts(), [])

  // ── Auto-save materiais (debounce 1.5s)
  const handleMaterialChange = (field: keyof ProjectMaterials, value: string) => {
    const updated = { ...materials, [field]: value }
    setMaterials(updated)
    setSalvoOk(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSalvando(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('profiles').update({ project_materials: updated }).eq('id', user.id)
          setSalvoOk(true)
          setTimeout(() => setSalvoOk(false), 2000)
        }
      } catch (e) { console.error('Erro ao salvar materiais:', e) }
      finally { setSalvando(false) }
    }, 1500)
  }

  // ── Auto-save da config (debounce 1.5s)
  // Persiste tipo/segmento/espaço/iluminação/entorno/elementos/fidelidade/
  // engine/resolução em profiles.project_config para hidratar a próxima visita.
  // Cascatas de troca (handleProjectTypeChange, handleSegmentChange) entram
  // como múltiplos setState no mesmo tick — o effect vê só o estado final
  // depois do batch, então salva uma vez por mudança real.
  const configSaveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstConfigSaveRef   = useRef(true)
  useEffect(() => {
    // Pula a primeira execução (hidratação inicial — nada mudou de fato).
    if (isFirstConfigSaveRef.current) {
      isFirstConfigSaveRef.current = false
      return
    }
    if (configSaveTimerRef.current) clearTimeout(configSaveTimerRef.current)
    configSaveTimerRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const config: ProjectConfig = {
          projectType, segment, environment, lighting, background,
          sceneElements, fidelityLevel, selectedEngine, selectedResolution,
        }
        await supabase.from('profiles').update({ project_config: config }).eq('id', user.id)
      } catch (e) { console.error('Erro ao salvar config:', e) }
    }, 1500)
  }, [
    projectType, segment, environment, lighting, background,
    sceneElements, fidelityLevel, selectedEngine, selectedResolution,
    supabase,
  ])

  // ── Upload — plain functions; React Compiler handles memoization
  const loadImage = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) { setError('Imagem muito grande. Máximo 10 MB.'); return }
    setOutputUrl(null); setError(null); setUseAnchor(true); setRefinementText('')
    setScale(1); setPan({ x: 0, y: 0 })
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const sourceUrl  = e.target?.result as string
        const compressed = await compressImage(sourceUrl, 2048, 0.92)
        setImagePreview(compressed)
      } catch {
        setError('Não foi possível processar essa imagem. Tente outro arquivo.')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]; if (file) loadImage(file)
  }

  // ── Pré-carga via ?source= (ex.: "Reutilizar" no dashboard). Busca a imagem
  //    hospedada (fal.media), converte em File e roda pelo mesmo loadImage do
  //    upload — passando pelo blob evitamos taint de canvas/CORS. Roda 1x.
  const sourceLoadedRef = useRef(false)
  useEffect(() => {
    if (sourceLoadedRef.current || !initialSourceUrl || imagePreview) return
    if (!/^https:\/\//i.test(initialSourceUrl)) return
    sourceLoadedRef.current = true
    ;(async () => {
      try {
        const res = await fetch(initialSourceUrl)
        if (!res.ok) throw new Error()
        const blob = await res.blob()
        if (!blob.type.startsWith('image/')) throw new Error()
        const ext = blob.type.split('/')[1] || 'jpg'
        loadImage(new File([blob], `reutilizar.${ext}`, { type: blob.type }))
      } catch {
        setError('Não foi possível carregar a imagem selecionada.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSourceUrl])

  // ── Geração
  const handleGenerate = async (resolutionOverride?: Resolution) => {
    if (!imagePreview) { setError('Faça upload de uma imagem primeiro.'); return }
    if (credits < nodeCost) { setError('Nodes insuficientes.'); return }
    setError(null); setLoading(true); startLoadingTexts()
    try {
      // Anchor: usa o último output como referência visual de materiais quando
      // o usuário regera a mesma imagem (ex: troca de iluminação) e o toggle
      // estiver ligado.
      const anchorUrl = useAnchor && outputUrl ? outputUrl : undefined

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64:   imagePreview,
          fidelityLevel,
          projectType,
          segment,
          environment,
          lighting,
          background,
          sceneElements,
          geometryLock,
          fidelityMode,
          engine:        selectedEngine,
          resolution:    resolutionOverride ?? selectedResolution,
          materials:     Object.values(materials).some(v => v) ? materials : undefined,
          anchorUrl,
          refinementText: refinementText.trim() || undefined,
        }),
      })
      const data: GenerateResult = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na geração')
      setOutputUrl(data.outputUrl); setCredits(data.credits); setSliderPos(50)
      setLastRenderId(data.renderId ?? null)
      setScale(1); setPan({ x: 0, y: 0 })
      if (refinementText.trim()) setRefinementText('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally { setLoading(false); stopLoadingTexts() }
  }

  // ── Slider BeforeAfter — ref keeps event handler stable, avoids re-subscribing
  useEffect(() => { isDraggingSliderRef.current = isDraggingSlider }, [isDraggingSlider])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingSliderRef.current || !compareRef.current) return
      const rect = compareRef.current.getBoundingClientRect()
      setSliderPos(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)))
    }
    const onUp = () => setIsDraggingSlider(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Zoom-state ref espelha o estado pra leituras síncronas dentro dos handlers
  // de evento (que são bound uma vez, com closure congelada).
  useEffect(() => { zoomStateRef.current = { scale, panX: pan.x, panY: pan.y } }, [scale, pan])
  useEffect(() => { isPanningRef.current = isPanning }, [isPanning])

  // ── Wheel zoom (não-passivo pra preventDefault funcionar).
  // Re-attach quando a comparativa monta/desmonta; nas outras views o
  // compareRef fica null e o effect só retorna early.
  useEffect(() => {
    const el = compareRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { scale: s, panX, panY } = zoomStateRef.current
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const newScale = Math.max(1, Math.min(4, s * Math.exp(-e.deltaY * 0.0015)))
      if (newScale === s) return
      const ratio = newScale / s
      // Mantém o ponto sob o cursor estacionário: tx' = cx - (cx - tx) * (s'/s).
      const newTx = cx - (cx - panX) * ratio
      const newTy = cy - (cy - panY) * ratio
      const minTx = rect.width  * (1 - newScale)
      const minTy = rect.height * (1 - newScale)
      setScale(newScale)
      setPan({
        x: Math.max(minTx, Math.min(0, newTx)),
        y: Math.max(minTy, Math.min(0, newTy)),
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [imagePreview, outputUrl])

  // ── Pan: window listeners ativos apenas via ref (sem re-bind a cada render).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isPanningRef.current || !compareRef.current || !panStartRef.current) return
      const { scale: s } = zoomStateRef.current
      const start = panStartRef.current
      const rect  = compareRef.current.getBoundingClientRect()
      const minTx = rect.width  * (1 - s)
      const minTy = rect.height * (1 - s)
      setPan({
        x: Math.max(minTx, Math.min(0, start.panX + (e.clientX - start.mouseX))),
        y: Math.max(minTy, Math.min(0, start.panY + (e.clientY - start.mouseY))),
      })
    }
    const onUp = () => { setIsPanning(false); panStartRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // A compra (plano ou Lumen) acontece no billing — a rota de checkout exige
  // payload tipado, então chamar direto daqui era um 400 silencioso.
  const handleBuyCredits = () => {
    window.location.href = '/app/billing'
  }

  // ── Reseta o estado da geração atual pra começar um render do zero
  //    com nova imagem. Mantém os parâmetros (segmento, ambiente etc.) —
  //    só limpa o que pertence ao ciclo da imagem atual.
  const handleNewRender = () => {
    setImagePreview(null)
    setOutputUrl(null)
    setRefinementText('')
    setUseAnchor(true)
    setError(null)
    setSliderPos(50)
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  // ── Computed
  // Considera apenas os campos visíveis no projectType atual. Sem isso, um
  // campo interior-only preenchido (ex: marcenaria) marcava o badge
  // "preenchido" mesmo depois de trocar pra exterior, onde ele nem aparece.
  const visibleMaterialFields = projectType === 'interior' ? MATERIAL_FIELDS_INTERIOR : MATERIAL_FIELDS_EXTERIOR
  const hasMaterials  = visibleMaterialFields.some(({ field }) => {
    const v = materials[field]
    return v && v.trim()
  })
  const currentEngine = ENGINES[selectedEngine]
  const nodeCost      = getNodesCost(selectedEngine, selectedResolution)
  const segments      = getSegments(projectType)
  const environments  = getEnvironments(projectType, segment)
  const lightingOpts  = getLighting(projectType, segment)
  const backgrounds   = getBackgrounds(projectType)
  const elementsOpts  = getSceneElements(projectType, segment)
  const bgTitle       = projectType === 'exterior' ? 'ENTORNO' : 'CONTEXTO VISUAL'
  const typeLabel     = projectType === 'exterior' ? 'Fotorrealismo Exterior' : 'Fotorrealismo Interior'
  const noNodes       = credits < nodeCost

  // Melhor combinação motor × resolução que ainda cabe no saldo — a saída
  // honesta pra quem está sem nodes: gerar com menos qualidade em vez de pagar.
  // "Melhor" = a mais cara dentro do orçamento (mais qualidade pelo que sobrou).
  const cheaperFit = !noNodes ? null : ENGINE_ORDER.flatMap(eid =>
    ENGINES[eid].resolutions
      .filter(res => isValidCombination(eid, res))
      .map(res => ({ engine: eid, res, cost: getNodesCost(eid, res) }))
  ).filter(o => o.cost <= credits)
   .sort((a, b) => b.cost - a.cost)[0] ?? null

  // ── Summary lines
  const summaryLine1 = `${typeLabel} · ${segment} · ${environment}`
  const summaryLine2 = [
    lighting   !== 'Preservar Original' ? lighting   : null,
    background !== 'Preservar Original' ? background : null,
    sceneElements.join(', '),
  ].filter(Boolean).join(' · ')
  const fidelityLabel = FIDELITY_LEVELS.find(l => l.id === fidelityLevel)?.label ?? 'Máxima'
  const summaryLine3  = `Fidelidade ${fidelityLabel} · ${currentEngine.name} · ${selectedResolution.toUpperCase()}`

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="spn-generate-shell" style={S.main}>

      {/* ── CONTROLES ── */}
      <div className="spn-generate-controls" style={S.controls}>

        {/* Topbar */}
        <div style={S.topbar}>
          <span style={S.pageTitle}>RENDERIZAR</span>
          <div style={S.credits}>
            <span style={S.creditDot}/>
            <span style={S.creditNum}>{credits}</span>
            <span>nodes</span>
            <button onClick={handleBuyCredits} style={S.buyBtn}>Recarregar</button>
          </div>
        </div>

        {/* 1 — Tipo de Projeto */}
        <div style={S.section}>
          <div style={S.label}>TIPO DE PROJETO</div>
          <div style={S.typeGrid}>
            {(['exterior', 'interior'] as const).map(type => {
              const active = projectType === type
              return (
                <button
                  key={type}
                  type="button"
                  className={active ? 'spn-type-card spn-type-card--active' : 'spn-type-card'}
                  aria-pressed={active}
                  style={active ? {...S.typeCard, ...S.typeCardActive} : S.typeCard}
                  onClick={() => handleProjectTypeChange(type)}
                >
                  <span style={{...S.typeIcon, ...(active ? S.typeIconActive : {})}}>
                    <ProjectTypeGlyph type={type} />
                  </span>
                  <span style={{...S.typeLabel, ...(active ? {color:'var(--color-bg)'} : {})}}>
                    {type === 'exterior' ? 'Ambiente Exterior' : 'Ambiente Interior'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={S.divider}/>

        {/* 2 — Segmento */}
        <div style={S.section}>
          <div style={S.label}>SEGMENTO</div>
          <PillGroup options={segments} selected={segment} onChange={handleSegmentChange}/>
        </div>

        <div style={S.divider}/>

        {/* 5 — Espaço */}
        <div style={S.section}>
          <div style={S.label}>ESPAÇO</div>
          <PillGroup options={environments} selected={environment} onChange={setEnvironment}/>
        </div>

        <div style={S.divider}/>

        {/* 6 — Iluminação */}
        <div style={S.section}>
          <div style={S.label}>ILUMINAÇÃO</div>
          <PillGroup options={lightingOpts} selected={lighting} onChange={setLighting}/>
        </div>

        <div style={S.divider}/>

        {/* 7 — Entorno / Contexto Visual */}
        <div style={S.section}>
          <div style={S.label}>{bgTitle}</div>
          <PillGroup options={backgrounds} selected={background} onChange={setBackground}/>
        </div>

        <div style={S.divider}/>

        {/* 8 — Materiais do Projeto */}
        <div style={S.section}>
          <button style={S.collapseBtn} onClick={() => setMateriaisAberto(!materiaisAberto)}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={S.label}>MATERIAIS DO PROJETO</span>
              {hasMaterials && <span style={S.materiaisBadge}>preenchido</span>}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              {salvando && <span style={{fontSize:9, color:'var(--color-text-tertiary)'}}>salvando...</span>}
              {salvoOk  && <span style={{fontSize:9, color:'var(--color-accent-green)'}}>salvo ✓</span>}
              <span style={{fontSize:14, color:'var(--color-text-tertiary)', transform: materiaisAberto ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform 0.2s'}}>▾</span>
            </div>
          </button>
          {materiaisAberto && (
            <div style={S.materiaisGrid}>
              {(projectType === 'interior' ? MATERIAL_FIELDS_INTERIOR : MATERIAL_FIELDS_EXTERIOR).map(({ field, label, placeholder }) => (
                <div key={field} style={S.materialField}>
                  <div style={S.materialLabel}>{label}</div>
                  <input
                    type="text"
                    value={materials[field] ?? ''}
                    placeholder={placeholder}
                    onChange={e => handleMaterialChange(field, e.target.value)}
                    style={S.materialInput}
                  />
                </div>
              ))}
              <p style={S.infoNote}>
                Preencha apenas pra <strong>alterar</strong> materiais específicos. Em branco = preserva todos do original. Salvo automaticamente.
              </p>
            </div>
          )}
        </div>

        <div style={S.divider}/>

        {/* 9 — Avançado */}
        <div style={S.section}>
          <button style={S.collapseBtn} onClick={() => setElemAberto(!elemAberto)}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={S.label}>AVANÇADO</span>
              {sceneElements.length > 0 && <span style={S.materiaisBadge}>{sceneElements.length} elemento{sceneElements.length > 1 ? 's' : ''}</span>}
            </div>
            <span style={{fontSize:14, color:'var(--color-text-tertiary)', transform: elemAberto ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform 0.2s'}}>▾</span>
          </button>
          {elemAberto && (
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              <div style={S.label}>ELEMENTOS NA CENA</div>
              <MultiPillGroup options={elementsOpts} selected={sceneElements} onToggle={toggleElement}/>
              {sceneElements.length > 0 && (
                <button
                  style={{...S.buyBtn, fontSize:10, marginTop:4, textDecoration:'none', color:'var(--color-text-tertiary)'}}
                  onClick={() => setSceneElements([])}
                >
                  limpar seleção
                </button>
              )}
            </div>
          )}
        </div>

        <div style={S.divider}/>

        {/* 10 — Fidelidade ao Projeto */}
        <div style={S.section}>
          <div style={S.label}>FIDELIDADE AO PROJETO</div>
          <div style={S.fidelityGrid}>
            {FIDELITY_LEVELS.map(lvl => (
              <div
                key={lvl.id}
                style={{...S.fidelityOpt, ...(fidelityLevel === lvl.id ? S.fidelityOptActive : {})}}
                onClick={() => setFidelityLevel(lvl.id)}
              >
                <div style={{...S.fidelityName, ...(fidelityLevel === lvl.id ? {color:'var(--color-bg)'} : {})}}>{lvl.label}</div>
                <div style={{...S.motorDesc, ...(fidelityLevel === lvl.id ? {color:'var(--color-bg)', opacity:0.6} : {})}}>{lvl.desc}</div>
              </div>
            ))}
          </div>
          <p style={S.infoNote}>
            {fidelityLevel === 'maximum'  && 'Preserva tudo da imagem (materiais, móveis, decoração, câmera). Só altera o que você pedir explicitamente.'}
            {fidelityLevel === 'balanced' && 'Preserva arquitetura e câmera, com pequenas melhorias de composição e ambientação permitidas.'}
            {fidelityLevel === 'creative' && 'Mais liberdade estética. Preserva apenas o essencial do projeto.'}
          </p>
        </div>

        <div style={S.divider}/>

        {/* 11 — Motor de IA */}
        <div style={S.section}>
          <div style={S.label}>MOTOR DE IA</div>
          <div style={S.motorGrid}>
            {ENGINE_ORDER.map(eid => {
              const e = ENGINES[eid]
              const active = selectedEngine === eid
              return (
                <div key={eid}
                  role="button"
                  aria-pressed={active}
                  aria-label={`Motor ${e.name} · ${e.tagline}`}
                  style={{...S.motorOpt, ...(active ? S.motorOptActive : {})}}
                  onClick={() => {
                    setSelectedEngine(eid)
                    // Se a resolução atual não é suportada, cai pra 2K.
                    if (!e.resolutions.includes(selectedResolution)) {
                      setSelectedResolution('2k')
                    }
                  }}
                >
                  <EngineIcon engine={eid} style={{width:22, height:22, flexShrink:0}} />
                  <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
                    <div style={{...S.motorName, ...(active ? {color:'var(--color-bg)'} : {})}}>{e.name}</div>
                    <div style={{...S.motorDesc, ...(active ? {color:'var(--color-bg)', opacity:0.6} : {})}}>{e.tagline}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 12 — Qualidade de Saída */}
        <div style={S.section}>
          <div style={S.label}>QUALIDADE DE SAÍDA</div>
          <div style={S.qualityGrid}>
            {currentEngine.resolutions.map(res => {
              const active = selectedResolution === res
              const cost   = currentEngine.nodes[res]!
              return (
                <div key={res}
                  style={{...S.qualityOpt, ...(active ? S.qualityOptActive : {})}}
                  onClick={() => setSelectedResolution(res)}
                >
                  <div style={{...S.qualityRes, ...(active ? {color:'var(--color-bg)'} : {})}}>{res.toUpperCase()}</div>
                  <div style={{...S.motorDesc, ...(active ? {color:'var(--color-bg)', opacity:0.6} : {})}}>{cost} Nodes por imagem</div>
                  <div style={{...S.motorDesc, ...(active ? {color:'var(--color-bg)', opacity:0.6} : {})}}>{RESOLUTION_DESC[res]}</div>
                </div>
              )
            })}
          </div>
        </div>

        {error && <div style={S.errorBox}>{error}</div>}

        {/* Anchor toggle — só aparece depois da primeira geração */}
        {outputUrl && (
          <button
            style={S.anchorRow}
            onClick={() => setUseAnchor(v => !v)}
            title={useAnchor
              ? 'Desligar pra gerar do zero, sem ancorar nos materiais do render anterior'
              : 'Ligar pra manter os materiais e texturas do render anterior'}
          >
            <span style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={{
                width:14, height:14, borderRadius:4,
                border:'0.5px solid var(--color-border-strong)',
                background: useAnchor ? 'var(--color-text-primary)' : 'var(--color-bg-elevated)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--color-bg)', fontSize:9, fontWeight:600,
              }}>{useAnchor ? '✓' : ''}</span>
              <span style={{fontSize:11, color:'var(--color-text-primary)', fontWeight:500}}>
                Manter materiais do render anterior
              </span>
            </span>
            <span style={{fontSize:10, color:'var(--color-text-tertiary)'}}>
              {useAnchor ? 'ancorado' : 'do zero'}
            </span>
          </button>
        )}

        {/* Refinar — só faz sentido com âncora ativa (precisa da #1 como referência) */}
        {outputUrl && useAnchor && (
          <div style={S.refineBox}>
            <div style={S.refineLabel}>REFINAR IMAGEM (opcional)</div>
            <textarea
              value={refinementText}
              onChange={e => setRefinementText(e.target.value)}
              placeholder="ex: trocar o piso para porcelanato cinza claro, mantendo todo o resto"
              rows={2}
              style={S.refineInput}
            />
            <div style={S.refineHint}>
              Deixe em branco pra apenas regerar com novos parâmetros. Preencha pra pedir uma alteração específica.
            </div>
          </div>
        )}

        {/* 11 — Botão Gerar · sem saldo, o CTA vira caminho pros planos */}
        {noNodes ? (
          <InsufficientNodesCta
            needed={nodeCost}
            available={credits}
            alternative={cheaperFit ? {
              label: `gere em ${ENGINES[cheaperFit.engine].name} · ${cheaperFit.res.toUpperCase()} por ${cheaperFit.cost} nodes`,
              onClick: () => {
                setSelectedEngine(cheaperFit.engine)
                setSelectedResolution(cheaperFit.res)
              },
            } : undefined}
          />
        ) : (
          <button
            style={loading || !imagePreview
              ? {...S.genBtn, opacity:0.6, cursor:'not-allowed'}
              : S.genBtn}
            onClick={() => handleGenerate()}
            disabled={loading || !imagePreview}
          >
            <span>{loading
              ? 'gerando…'
              : (refinementText.trim() && outputUrl && useAnchor
                  ? 'aplicar refinamento'
                  : (outputUrl && useAnchor ? 'gerar variação' : 'gerar render'))
            }</span>
            <span style={S.genBtnMeta}>
              <span>{nodeCost} Nodes por render</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="1.5">
                <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        )}
      </div>

      {/* ── PREVIEW ── */}
      <div className="spn-generate-preview" style={S.preview}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>ANTES / DEPOIS</span>
          {outputUrl && (
            <button
              onClick={() => downloadImage(outputUrl, 'spacenode-render.jpg')}
              style={{...S.downloadLink, background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:'inherit'}}
            >
              baixar render ↓
            </button>
          )}
        </div>

        {!imagePreview && (
          <div
            className={isDraggingFile ? 'spn-upload-zone spn-upload-zone--dragging' : 'spn-upload-zone'}
            style={isDraggingFile ? {...S.uploadZone, borderColor:'var(--color-text-primary)', background:'var(--color-surface)'} : S.uploadZone}
            onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={S.uploadIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.3">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={S.uploadTitle}>arraste sua imagem aqui</div>
              <div style={S.uploadSub}>SketchUp · Render · 3D · JPG · PNG · até 10 MB</div>
            </div>
            <button style={S.uploadBtn} onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
              escolher arquivo
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}}
              onChange={e => { const f = e.target.files?.[0]; if (f) loadImage(f) }}/>
          </div>
        )}

        {imagePreview && outputUrl && (
          <div
            ref={compareRef}
            style={{
              ...S.compareWrap,
              cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'ew-resize',
            }}
            onMouseDown={(e) => {
              if (scale > 1) {
                panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y }
                setIsPanning(true)
              } else {
                setIsDraggingSlider(true)
              }
            }}
            onDoubleClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }}
          >
            {/* Antes — dentro do wrapper transformável */}
            <div style={{
              position:'absolute', inset:0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin:'0 0',
              pointerEvents:'none',
            }}>
              <img src={imagePreview} alt="Antes" style={S.compareImg} draggable={false}/>
            </div>
            {/* Depois — clip em coords do container, transform aplicado dentro do clip */}
            <div style={{...S.compareAfterWrap, clipPath:`inset(0 ${100-sliderPos}% 0 0)`, pointerEvents:'none'}}>
              <div style={{
                position:'absolute', inset:0,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin:'0 0',
              }}>
                <img src={outputUrl} alt="Depois" style={S.compareImg} draggable={false}/>
              </div>
            </div>
            {/* Handle do slider em coords do container; ativa pointerEvents só no círculo
                pra continuar arrastável quando zoomado (parent passa a iniciar pan). */}
            <div style={{...S.compareHandle, left:`${sliderPos}%`}}>
              <div
                style={{...S.compareHandleCircle, pointerEvents:'auto', cursor:'ew-resize'}}
                onMouseDown={(e) => { e.stopPropagation(); setIsDraggingSlider(true) }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2">
                  <path d="M8 5l-5 7 5 7M16 5l5 7-5 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <span style={{...S.compareLabel, left:14}}>ANTES</span>
            <span style={{...S.compareLabel, right:14}}>DEPOIS</span>
            {scale > 1 && (
              <div style={S.zoomBadge}>{Math.round(scale * 100)}%</div>
            )}
          </div>
        )}

        {/* ── POST-GENERATION ACTIONS ── */}
        {imagePreview && outputUrl && !loading && (
          <div style={S.postGen}>
            {selectedResolution === 'hd' && (
              <div className="spn-upsell-note">
                Melhore para 2K ou 4K para apresentação profissional
              </div>
            )}

            {/* CTA Spaces — induz o próximo passo natural após a render. */}
            {lastRenderId && (
              <a
                href={`/app/spaces/new/from-render?render_id=${lastRenderId}`}
                className="render-to-space-cta"
              >
                <span className="render-to-space-cta__icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
                  </svg>
                </span>
                <span className="render-to-space-cta__body">
                  <span className="render-to-space-cta__title">Criar Space a partir desta render</span>
                  <span className="render-to-space-cta__sub">Trave o DNA e gere variações coerentes — iluminação, ângulo, horário</span>
                </span>
                <span className="render-to-space-cta__arrow" aria-hidden="true">→</span>
              </a>
            )}

            <div style={S.postGenPrimary}>
              <button className="spn-action spn-action--primary" onClick={() => handleGenerate()}>
                Gerar nova variação
              </button>
              <button
                className="spn-action spn-action--primary"
                onClick={() => downloadImage(outputUrl, 'spacenode-render.jpg')}
              >
                Baixar imagem
              </button>
            </div>
            <div style={S.postGenSecondary}>
              <button className="spn-action spn-action--ghost" onClick={() => handleGenerate('2k')}>
                Melhorar qualidade (2K / 4K)
              </button>
              <button className="spn-action spn-action--ghost" onClick={handleNewRender}>
                Iniciar novo render
              </button>
            </div>

            <style jsx>{`
              .render-to-space-cta {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 14px 18px;
                border-radius: 12px;
                background: linear-gradient(135deg, var(--color-accent-green-bg) 0%, transparent 100%);
                border: 0.5px solid var(--color-accent-green-border);
                color: var(--color-text-primary);
                text-decoration: none;
                transition: transform 0.18s, border-color 0.18s, background 0.18s, box-shadow 0.18s;
                position: relative;
                overflow: hidden;
              }
              .render-to-space-cta::before {
                content: '';
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at 100% 50%, var(--color-accent-green-bg) 0%, transparent 60%);
                opacity: 0;
                transition: opacity 0.25s;
                pointer-events: none;
              }
              .render-to-space-cta:hover {
                transform: translateY(-1px);
                border-color: var(--color-accent-green);
                box-shadow: 0 8px 24px var(--color-accent-green-bg);
              }
              .render-to-space-cta:hover::before { opacity: 1; }
              .render-to-space-cta__icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                flex-shrink: 0;
                border-radius: 10px;
                background: var(--color-accent-green-bg);
                color: var(--color-accent-green);
              }
              .render-to-space-cta__body {
                display: flex;
                flex-direction: column;
                gap: 3px;
                flex: 1;
                min-width: 0;
              }
              .render-to-space-cta__title {
                font-size: 13px;
                font-weight: 500;
                color: var(--color-text-primary);
                letter-spacing: -0.01em;
              }
              .render-to-space-cta__sub {
                font-size: 11px;
                color: var(--color-text-tertiary);
                letter-spacing: -0.005em;
                line-height: 1.45;
              }
              .render-to-space-cta__arrow {
                color: var(--color-accent-green);
                font-size: 16px;
                flex-shrink: 0;
                transition: transform 0.18s;
              }
              .render-to-space-cta:hover .render-to-space-cta__arrow {
                transform: translateX(3px);
              }
              @media (prefers-reduced-motion: reduce) {
                .render-to-space-cta,
                .render-to-space-cta__arrow,
                .render-to-space-cta::before { transition: none; animation: none; }
                .render-to-space-cta:hover { transform: none; }
                .render-to-space-cta:hover .render-to-space-cta__arrow { transform: none; }
              }
            `}</style>
          </div>
        )}

        {imagePreview && !outputUrl && !loading && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={S.compareImg}/>
            <span style={{...S.compareLabel, left:14}}>ANTES</span>
            <button style={S.changeImageBtn} onClick={() => { setImagePreview(null); setOutputUrl(null) }}>
              trocar imagem
            </button>
          </div>
        )}

        {loading && imagePreview && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={{...S.compareImg, opacity:0.12, filter:'blur(6px)'}}/>
            <div style={S.loadingOverlay}>
              <div className="constellation-loading" style={{color:'#fafafa'}}>
                <ConstellationN size={40} />
              </div>
              <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
                <span style={{
                  fontSize: 12,
                  color: '#fafafa',
                  letterSpacing: '0.06em',
                  fontWeight: 500,
                  opacity: loadingTextVisible ? 1 : 0,
                  transition: 'opacity 0.22s ease',
                }}>
                  {loadingText}
                </span>
                <div style={{width:100, height:1, background:'rgba(255,255,255,0.1)', borderRadius:1, overflow:'hidden'}}>
                  <div key={generationKey} style={{height:'100%', background:'rgba(255,255,255,0.45)', borderRadius:1, animation:'loadProgress 40s cubic-bezier(0.05,0,0.2,1) forwards'}}/>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 11 — Resumo da Geração */}
        <div style={S.promptPreview}>
          <div style={S.promptLabel}>RESUMO DA GERAÇÃO</div>
          <div style={S.promptText}>
            <span style={{color:'var(--color-text-primary)', fontWeight:500}}>{summaryLine1}</span>
            {hasMaterials && <span style={{color:'var(--color-accent-green)', fontSize:10, marginLeft:6}}>+ materiais</span>}
            <br/>
            <span style={{color:'var(--color-text-tertiary)'}}>{summaryLine2}</span>
            <br/>
            <span style={{color:'var(--color-text-tertiary)'}}>{summaryLine3}</span>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Pill components ────────────────────────────────────────────────────────────

function PillGroup({ options, selected, onChange }: { options: string[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map(opt => {
        const active = selected === opt
        return (
          <button
            key={opt}
            className={active ? 'spn-pill spn-pill--active' : 'spn-pill'}
            style={active ? {...pill, ...pillActive} : pill}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function MultiPillGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map(opt => {
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            className={active ? 'spn-pill spn-pill--active' : 'spn-pill'}
            style={active ? {...pill, ...pillActive} : pill}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

const pill: React.CSSProperties = {
  padding: '6px 13px', borderRadius: 999,
  border: '0.5px solid var(--color-border-strong)',
  fontSize: 11, color: 'var(--color-text-secondary)',
  cursor: 'pointer', background: 'var(--color-chip)',
  letterSpacing: '-0.005em', fontFamily: 'inherit',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
}
const pillActive: React.CSSProperties = {
  background: 'var(--color-chip-active)',
  color: 'var(--color-chip-active-foreground)',
  border: '0.5px solid var(--color-chip-active)',
  boxShadow: 'var(--shadow-sm)',
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  main:              { display:'grid', gridTemplateColumns:'minmax(430px, 500px) minmax(0, 1fr)', height:'100%', width:'100%', overflow:'hidden', background:'var(--color-bg)' },
  controls:          { padding:'28px 24px 30px', borderRight:'0.5px solid var(--color-border)', background:'var(--color-bg)', overflowY:'auto', display:'flex', flexDirection:'column', gap:18 },
  preview:           { padding:'28px 28px 24px', background:'var(--color-bg)', display:'flex', flexDirection:'column', gap:18, minWidth:0 },
  topbar:            { display:'flex', justifyContent:'space-between', alignItems:'center' },
  pageTitle:         { fontSize:10, letterSpacing:'0.24em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:600 },
  credits:           { display:'flex', alignItems:'center', gap:7, fontSize:11, color:'var(--color-text-secondary)', padding:'7px 9px', border:'0.5px solid var(--color-border)', borderRadius:999, background:'var(--color-chip)' },
  creditDot:         { width:5, height:5, borderRadius:'50%', background:'var(--color-accent-green)', boxShadow:'0 0 9px var(--color-accent-green-glow)', display:'inline-block' },
  creditNum:         { color:'var(--color-text-primary)', fontWeight:650, fontSize:12 },
  buyBtn:            { fontSize:'11px', color:'var(--color-text-tertiary)', background:'none', border:'none', cursor:'pointer', textDecoration:'none', marginLeft:'4px', fontFamily:'inherit' },
  section:           { display:'flex', flexDirection:'column', gap:11 },
  label:             { fontSize:10, letterSpacing:'0.17em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:600 },
  divider:           { height:'0.5px', background:'var(--color-border)' },
  typeGrid:          { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  typeCard:          { border:'0.5px solid var(--color-border-strong)', borderRadius:14, padding:'13px 12px', minHeight:78, cursor:'pointer', textAlign:'center', background:'linear-gradient(180deg, var(--color-surface), var(--color-surface-subtle))', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, transition:'transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease' },
  typeCardActive:    { border:'0.5px solid var(--color-chip-active)', background:'var(--color-chip-active)', boxShadow:'var(--shadow-md)' },
  typeIcon:          { width:30, height:30, borderRadius:10, color:'var(--color-text-secondary)', background:'var(--color-surface)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 0 0 0.5px var(--color-border)' },
  typeIconActive:    { color:'var(--color-bg)', background:'rgba(0,0,0,0.06)', boxShadow:'none' },
  typeLabel:         { fontSize:11, fontWeight:560, color:'var(--color-text-primary)', lineHeight:1.3 },
  infoNote:          { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.6 },
  collapseBtn:       { display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:0, width:'100%', fontFamily:'inherit' },
  materiaisBadge:    { fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'var(--color-accent-green-bg)', color:'var(--color-accent-green)', padding:'2px 7px', borderRadius:10 },
  materiaisGrid:     { display:'flex', flexDirection:'column', gap:10, paddingTop:4 },
  materialField:     { display:'flex', flexDirection:'column', gap:5 },
  materialLabel:     { fontSize:10, color:'var(--color-text-tertiary)', letterSpacing:'0.05em' },
  materialInput:     { padding:'9px 12px', border:'0.5px solid var(--color-input-border)', borderRadius:10, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-input)', fontFamily:'inherit', outline:'none' },
  sliderRow:         { display:'flex', alignItems:'center', gap:10 },
  sliderEnd:         { fontSize:11, color:'var(--color-text-tertiary)' },
  range:             { flex:1, accentColor:'var(--color-text-primary)', height:3 },
  sliderVal:         { fontSize:12, fontWeight:500, color:'var(--color-text-primary)', minWidth:34, textAlign:'right' },
  anchorRow:         { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', border:'0.5px solid var(--color-border-strong)', borderRadius:12, background:'var(--color-surface)', cursor:'pointer', fontFamily:'inherit', width:'100%' },
  refineBox:         { display:'flex', flexDirection:'column', gap:7, padding:'13px 14px', border:'0.5px solid var(--color-border-strong)', borderRadius:12, background:'var(--color-surface)' },
  refineLabel:       { fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  refineInput:       { padding:'9px 11px', border:'0.5px solid var(--color-input-border)', borderRadius:9, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-input)', fontFamily:'inherit', outline:'none', resize:'vertical', minHeight:38 },
  refineHint:        { fontSize:10, color:'var(--color-text-tertiary)', lineHeight:1.5 },
  fidelityGrid:      { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7 },
  fidelityOpt:       { border:'0.5px solid var(--color-border-strong)', borderRadius:12, padding:'11px 9px', cursor:'pointer', background:'var(--color-surface)', textAlign:'center' as const, transition:'background 0.18s ease, border-color 0.18s ease' },
  fidelityOptActive: { border:'0.5px solid var(--color-chip-active)', background:'var(--color-chip-active)' },
  fidelityName:      { fontSize:11, fontWeight:560, color:'var(--color-text-primary)', marginBottom:3 },
  motorGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7 },
  motorOpt:          { display:'flex', alignItems:'center', gap:10, border:'0.5px solid var(--color-border-strong)', borderRadius:12, padding:'11px 10px', cursor:'pointer', background:'var(--color-surface)', color:'var(--color-text-primary)', transition:'background 0.18s ease, border-color 0.18s ease' },
  motorOptActive:    { border:'0.5px solid var(--color-chip-active)', background:'var(--color-chip-active)', color:'var(--color-chip-active-foreground)' },
  motorName:         { fontSize:11, fontWeight:560, color:'var(--color-text-primary)', marginBottom:3 },
  motorTag:          { display:'inline-block', fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'var(--color-border-strong)', color:'var(--color-text-tertiary)', padding:'2px 6px', borderRadius:4 },
  motorDesc:         { fontSize:10, color:'var(--color-text-tertiary)', marginTop:4 },
  qualityGrid:       { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7 },
  qualityOpt:        { border:'0.5px solid var(--color-border-strong)', borderRadius:12, padding:'11px 8px', cursor:'pointer', background:'var(--color-surface)', textAlign:'center' as const, transition:'background 0.18s ease, border-color 0.18s ease' },
  qualityOptActive:  { border:'0.5px solid var(--color-chip-active)', background:'var(--color-chip-active)' },
  qualityRes:        { fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4, letterSpacing:'-0.02em' },
  errorBox:          { fontSize:12, color:'var(--color-error)', background:'var(--color-error-bg)', border:'0.5px solid var(--color-error-border)', borderRadius:12, padding:'10px 14px' },
  genBtn:            { width:'100%', padding:'14px 17px', background:'var(--color-inverse)', color:'var(--color-inverse-foreground)', border:'none', borderRadius:12, fontSize:13, fontWeight:650, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit', boxShadow:'var(--shadow-md)', transition:'opacity 0.18s ease, transform 0.12s ease' },
  genBtnMeta:        { display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--color-text-tertiary)' },
  uploadZone:        { border:'0.5px dashed var(--color-border-strong)', borderRadius:18, padding:'50px 20px', textAlign:'center', cursor:'pointer', background:'var(--color-upload-area)', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, minHeight:300, boxShadow:'var(--shadow-lg)', transition:'background 0.18s ease, border-color 0.18s ease, transform 0.18s ease' },
  uploadIcon:        { width:44, height:44, borderRadius:14, background:'var(--color-surface)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 0 0 0.5px var(--color-border)' },
  uploadTitle:       { fontSize:15, fontWeight:500, color:'var(--color-text-primary)', letterSpacing:'-0.02em' },
  uploadSub:         { fontSize:12, color:'var(--color-text-tertiary)', marginTop:4 },
  uploadBtn:         { padding:'8px 18px', border:'0.5px solid var(--color-border-strong)', borderRadius:999, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-surface)', cursor:'pointer', fontFamily:'inherit' },
  compareWrap:       { position:'relative', borderRadius:18, overflow:'hidden', flex:1, minHeight:300, background:'var(--color-preview-bg)', border:'0.5px solid var(--color-border)', boxShadow:'var(--shadow-lg)', userSelect:'none', cursor:'ew-resize' },
  compareImg:        { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', pointerEvents:'none' },
  compareAfterWrap:  { position:'absolute', inset:0 },
  compareHandle:     { position:'absolute', top:0, bottom:0, width:2, background:'#ffffff', transform:'translateX(-50%)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  compareHandleCircle: { width:34, height:34, borderRadius:'50%', background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 22px rgba(0,0,0,0.26)' },
  compareLabel:      { position:'absolute', bottom:12, fontSize:9, letterSpacing:'0.12em', color:'#fafafa', textTransform:'uppercase', fontWeight:500, textShadow:'0 1px 3px rgba(0,0,0,0.5)', pointerEvents:'none' },
  changeImageBtn:    { position:'absolute', top:12, right:14, padding:'6px 12px', border:'0.5px solid rgba(255,255,255,0.28)', borderRadius:999, fontSize:10, color:'#fafafa', background:'var(--color-scrim)', cursor:'pointer', fontFamily:'inherit', backdropFilter:'blur(10px)' },
  zoomBadge:         { position:'absolute', top:12, left:14, padding:'3px 9px', fontSize:9, letterSpacing:'0.1em', color:'#fafafa', background:'var(--color-scrim)', borderRadius:10, fontWeight:500, pointerEvents:'none' },
  loadingOverlay:    { position:'absolute', inset:0, background:'var(--color-scrim)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 },
  spinner:           { width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#ffffff', animation:'spin 0.8s linear infinite' },
  promptPreview:     { background:'var(--color-surface-subtle)', border:'0.5px solid var(--color-border)', borderRadius:16, padding:'15px 17px' },
  promptLabel:       { fontSize:9, letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:600, marginBottom:8 },
  promptText:        { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.65 },
  downloadLink:      { fontSize:11, color:'var(--color-text-tertiary)', textDecoration:'none' },
  postGen:           { display:'flex', flexDirection:'column', gap:8 },
  postGenPrimary:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  postGenSecondary:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
}

export default GenerateClient
