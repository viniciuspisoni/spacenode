'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/Logo'
import {
  ProjectType, ProjectMaterials,
  getSegments, getEnvironments, getLighting, getBackgrounds, getSceneElements,
} from '@/lib/prompts'
import {
  ENGINES, ENGINE_ORDER, DEFAULT_ENGINE, DEFAULT_RESOLUTION,
  type EngineId, type Resolution,
  getNodesCost, isEngineId, isResolution, isValidCombination,
} from '@/lib/engines'

interface GenerateClientProps {
  initialCredits:    number
  initialMaterials?: ProjectMaterials
  initialConfig?:    ProjectConfig | null
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

// Timeout máximo da análise prévia. Se passar, segue pro /api/generate sem
// briefing (graceful degradation — geração continua, só sem o lock textual
// específico de objetos identificados na referência).
const ANALYZE_TIMEOUT_MS = 8_000

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

export function GenerateClient({ initialCredits, initialMaterials, initialConfig }: GenerateClientProps) {
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

  // ── Fidelity Engine — análise prévia da imagem (Claude vision via Fal).
  // Identifica objetos visíveis no input (cortinas, ventiladores, espelhos,
  // mobiliário) e devolve `briefing` + `inputUrl` (já no fal.storage).
  // O briefing entra no prompt como `preservationBlock` com lista textual
  // de "elementos_preservar", o que protege contra o modelo não-reconhecer
  // objetos do SketchUp (caso clássico: cortina virando parede de cimento).
  // Falha/timeout = segue pro /api/generate sem briefing — degradação graciosa.
  const runFidelityAnalysis = async (imageBase64: string) => {
    try {
      const ctrl  = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS)
      const res = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageBase64 }),
        signal:  ctrl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) return null
      return await res.json() as { inputUrl: string; briefing: unknown }
    } catch {
      return null
    }
  }

  // ── Geração
  const handleGenerate = async (resolutionOverride?: Resolution) => {
    if (!imagePreview) { setError('Faça upload de uma imagem primeiro.'); return }
    if (credits < nodeCost) { setError('Nodes insuficientes.'); return }
    setError(null); setLoading(true); startLoadingTexts()
    try {
      // Análise prévia ativa só em Máxima Fidelidade. Em Equilibrado e
      // Criativo o lock textual atrapalharia mais que ajudaria — o usuário
      // está pedindo liberdade estética. Em Máxima é onde a precisão de
      // identificar objetos ("cortina cinza à direita") tem mais valor.
      const useEngine = fidelityLevel === 'maximum'
      const analysis  = useEngine ? await runFidelityAnalysis(imagePreview) : null

      // Anchor: usa o último output como referência visual de materiais quando
      // o usuário regera a mesma imagem (ex: troca de iluminação) e o toggle
      // estiver ligado.
      const anchorUrl = useAnchor && outputUrl ? outputUrl : undefined

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Quando a análise sobe a imagem pro fal.storage, reusa o inputUrl
          // pra não pagar segundo upload no /api/generate.
          imageBase64:   analysis?.inputUrl ? undefined : imagePreview,
          inputUrl:      analysis?.inputUrl,
          briefing:      analysis?.briefing,
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

  const handleBuyCredits = async () => {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
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
    <div style={S.main}>

      {/* ── CONTROLES ── */}
      <div style={S.controls}>

        {/* Topbar */}
        <div style={S.topbar}>
          <span style={S.pageTitle}>GERAR</span>
          <div style={S.credits}>
            <span style={S.creditDot}/>
            <span style={S.creditNum}>{credits}</span>
            <span>Nodes</span>
            <button onClick={handleBuyCredits} style={S.buyBtn}>+ comprar Nodes</button>
          </div>
        </div>

        {/* 1 — Tipo de Projeto */}
        <div style={S.section}>
          <div style={S.label}>TIPO DE PROJETO</div>
          <div style={S.typeGrid}>
            {(['exterior', 'interior'] as const).map(type => (
              <div
                key={type}
                style={projectType === type ? {...S.typeCard, ...S.typeCardActive} : S.typeCard}
                onClick={() => handleProjectTypeChange(type)}
              >
                <div style={{...S.typeIcon, ...(projectType === type ? {color:'var(--color-bg)'} : {})}}>
                  {type === 'exterior' ? '☀' : '⬛'}
                </div>
                <div style={{...S.typeLabel, ...(projectType === type ? {color:'var(--color-bg)'} : {})}}>
                  {type === 'exterior' ? 'Ambiente Exterior' : 'Ambiente Interior'}
                </div>
              </div>
            ))}
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
                  style={{...S.motorOpt, ...(active ? S.motorOptActive : {})}}
                  onClick={() => {
                    setSelectedEngine(eid)
                    // Se a resolução atual não é suportada, cai pra 2K.
                    if (!e.resolutions.includes(selectedResolution)) {
                      setSelectedResolution('2k')
                    }
                  }}
                >
                  <div style={{...S.motorName, ...(active ? {color:'var(--color-bg)'} : {})}}>{e.name}</div>
                  <div style={{...S.motorDesc, ...(active ? {color:'var(--color-bg)', opacity:0.6} : {})}}>{e.tagline}</div>
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

        {/* 11 — Botão Gerar */}
        <button
          style={loading || !imagePreview || credits < nodeCost
            ? {...S.genBtn, opacity:0.6, cursor:'not-allowed'}
            : S.genBtn}
          onClick={() => handleGenerate()}
          disabled={loading || !imagePreview || credits < nodeCost}
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
      </div>

      {/* ── PREVIEW ── */}
      <div style={S.preview}>
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
              <div style={S.upsellNote}>
                Melhore para 2K ou 4K para apresentação profissional
              </div>
            )}
            <div style={S.postGenPrimary}>
              <button style={S.actionBtn} onClick={() => handleGenerate()}>
                Gerar nova variação
              </button>
              <button
                onClick={() => downloadImage(outputUrl, 'spacenode-render.jpg')}
                style={S.actionBtn}
              >
                Baixar imagem
              </button>
            </div>
            <div style={S.postGenSecondary}>
              <button style={S.actionBtnGhost} onClick={() => handleGenerate('2k')}>
                Melhorar qualidade (2K / 4K)
              </button>
              <button style={S.actionBtnGhost} onClick={handleNewRender}>
                Iniciar novo render
              </button>
            </div>
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
              <div style={{color:'#fafafa', animation:'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite'}}>
                <Logo size={40}/>
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
      {options.map(opt => (
        <button key={opt} style={selected === opt ? {...pill, ...pillActive} : pill} onClick={() => onChange(opt)}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function MultiPillGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map(opt => (
        <button key={opt} style={selected.includes(opt) ? {...pill, ...pillActive} : pill} onClick={() => onToggle(opt)}>
          {opt}
        </button>
      ))}
    </div>
  )
}

const pill: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 20,
  border: '0.5px solid var(--color-border-strong)',
  fontSize: 11, color: 'var(--color-text-tertiary)',
  cursor: 'pointer', background: 'var(--color-bg-elevated)',
  letterSpacing: '-0.005em', fontFamily: 'inherit',
}
const pillActive: React.CSSProperties = {
  background: 'var(--color-text-primary)',
  color: 'var(--color-bg)',
  border: '0.5px solid var(--color-text-primary)',
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  main:              { display:'grid', gridTemplateColumns:'480px 1fr', height:'100%', width:'100%', overflow:'hidden' },
  controls:          { padding:'28px 24px', borderRight:'0.5px solid var(--color-border)', background:'var(--color-bg)', overflowY:'auto', display:'flex', flexDirection:'column', gap:20 },
  preview:           { padding:28, background:'var(--color-bg)', display:'flex', flexDirection:'column', gap:18 },
  topbar:            { display:'flex', justifyContent:'space-between', alignItems:'center' },
  pageTitle:         { fontSize:10, letterSpacing:'0.22em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  credits:           { display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--color-text-tertiary)' },
  creditDot:         { width:5, height:5, borderRadius:'50%', background:'var(--color-accent-green)', boxShadow:'0 0 5px var(--color-accent-green-glow)', display:'inline-block' },
  creditNum:         { color:'var(--color-text-primary)', fontWeight:500, fontSize:12 },
  buyBtn:            { fontSize:'11px', color:'var(--color-text-tertiary)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', marginLeft:'6px', fontFamily:'inherit' },
  section:           { display:'flex', flexDirection:'column', gap:10 },
  label:             { fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  divider:           { height:'0.5px', background:'var(--color-border)' },
  typeGrid:          { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  typeCard:          { border:'0.5px solid var(--color-border-strong)', borderRadius:10, padding:'14px 12px', cursor:'pointer', textAlign:'center', background:'var(--color-bg-elevated)' },
  typeCardActive:    { border:'0.5px solid var(--color-text-primary)', background:'var(--color-text-primary)' },
  typeIcon:          { fontSize:18, marginBottom:5, color:'var(--color-text-tertiary)' },
  typeLabel:         { fontSize:11, fontWeight:500, color:'var(--color-text-primary)', lineHeight:1.3 },
  infoNote:          { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.6 },
  collapseBtn:       { display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:0, width:'100%', fontFamily:'inherit' },
  materiaisBadge:    { fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'rgba(48,180,108,0.12)', color:'var(--color-accent-green)', padding:'2px 7px', borderRadius:10 },
  materiaisGrid:     { display:'flex', flexDirection:'column', gap:10, paddingTop:4 },
  materialField:     { display:'flex', flexDirection:'column', gap:5 },
  materialLabel:     { fontSize:10, color:'var(--color-text-tertiary)', letterSpacing:'0.05em' },
  materialInput:     { padding:'8px 12px', border:'0.5px solid var(--color-border-strong)', borderRadius:8, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-bg-elevated)', fontFamily:'inherit', outline:'none' },
  sliderRow:         { display:'flex', alignItems:'center', gap:10 },
  sliderEnd:         { fontSize:11, color:'var(--color-text-tertiary)' },
  range:             { flex:1, accentColor:'var(--color-text-primary)', height:3 },
  sliderVal:         { fontSize:12, fontWeight:500, color:'var(--color-text-primary)', minWidth:34, textAlign:'right' },
  anchorRow:         { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', border:'0.5px solid var(--color-border-strong)', borderRadius:8, background:'var(--color-bg-elevated)', cursor:'pointer', fontFamily:'inherit', width:'100%' },
  refineBox:         { display:'flex', flexDirection:'column', gap:6, padding:'12px 14px', border:'0.5px solid var(--color-border-strong)', borderRadius:8, background:'var(--color-bg-elevated)' },
  refineLabel:       { fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  refineInput:       { padding:'8px 10px', border:'0.5px solid var(--color-border-strong)', borderRadius:6, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-bg)', fontFamily:'inherit', outline:'none', resize:'vertical', minHeight:36 },
  refineHint:        { fontSize:10, color:'var(--color-text-tertiary)', lineHeight:1.5 },
  fidelityGrid:      { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 },
  fidelityOpt:       { border:'0.5px solid var(--color-border-strong)', borderRadius:8, padding:'10px 8px', cursor:'pointer', background:'var(--color-bg-elevated)', textAlign:'center' as const },
  fidelityOptActive: { border:'0.5px solid var(--color-text-primary)', background:'var(--color-text-primary)' },
  fidelityName:      { fontSize:11, fontWeight:500, color:'var(--color-text-primary)', marginBottom:3 },
  motorGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 },
  motorOpt:          { border:'0.5px solid var(--color-border-strong)', borderRadius:8, padding:'10px 10px', cursor:'pointer', background:'var(--color-bg-elevated)' },
  motorOptActive:    { border:'0.5px solid var(--color-text-primary)', background:'var(--color-text-primary)' },
  motorName:         { fontSize:11, fontWeight:500, color:'var(--color-text-primary)', marginBottom:3 },
  motorTag:          { display:'inline-block', fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'var(--color-border-strong)', color:'var(--color-text-tertiary)', padding:'2px 6px', borderRadius:4 },
  motorDesc:         { fontSize:10, color:'var(--color-text-tertiary)', marginTop:4 },
  qualityGrid:       { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 },
  qualityOpt:        { border:'0.5px solid var(--color-border-strong)', borderRadius:8, padding:'10px 8px', cursor:'pointer', background:'var(--color-bg-elevated)', textAlign:'center' as const },
  qualityOptActive:  { border:'0.5px solid var(--color-text-primary)', background:'var(--color-text-primary)' },
  qualityRes:        { fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4, letterSpacing:'-0.02em' },
  errorBox:          { fontSize:12, color:'#c0392b', background:'rgba(192,57,43,0.08)', border:'0.5px solid rgba(192,57,43,0.2)', borderRadius:8, padding:'10px 14px' },
  genBtn:            { width:'100%', padding:'13px 16px', background:'var(--color-text-primary)', color:'var(--color-bg)', border:'none', borderRadius:10, fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit' },
  genBtnMeta:        { display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--color-text-tertiary)' },
  uploadZone:        { border:'0.5px dashed var(--color-border-strong)', borderRadius:12, padding:'48px 20px', textAlign:'center', cursor:'pointer', background:'var(--color-bg-elevated)', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, minHeight:300 },
  uploadIcon:        { width:44, height:44, borderRadius:10, background:'var(--color-surface)', display:'flex', alignItems:'center', justifyContent:'center' },
  uploadTitle:       { fontSize:15, fontWeight:500, color:'var(--color-text-primary)', letterSpacing:'-0.02em' },
  uploadSub:         { fontSize:12, color:'var(--color-text-tertiary)', marginTop:4 },
  uploadBtn:         { padding:'7px 18px', border:'0.5px solid var(--color-border-strong)', borderRadius:20, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-bg-elevated)', cursor:'pointer', fontFamily:'inherit' },
  compareWrap:       { position:'relative', borderRadius:12, overflow:'hidden', flex:1, minHeight:300, background:'var(--color-surface)', userSelect:'none', cursor:'ew-resize' },
  compareImg:        { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', pointerEvents:'none' },
  compareAfterWrap:  { position:'absolute', inset:0 },
  compareHandle:     { position:'absolute', top:0, bottom:0, width:2, background:'#ffffff', transform:'translateX(-50%)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  compareHandleCircle: { width:32, height:32, borderRadius:'50%', background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
  compareLabel:      { position:'absolute', bottom:12, fontSize:9, letterSpacing:'0.12em', color:'#fafafa', textTransform:'uppercase', fontWeight:500, textShadow:'0 1px 3px rgba(0,0,0,0.5)', pointerEvents:'none' },
  changeImageBtn:    { position:'absolute', top:12, right:14, padding:'5px 12px', border:'0.5px solid rgba(255,255,255,0.4)', borderRadius:20, fontSize:10, color:'#fafafa', background:'rgba(0,0,0,0.35)', cursor:'pointer', fontFamily:'inherit' },
  zoomBadge:         { position:'absolute', top:12, left:14, padding:'3px 9px', fontSize:9, letterSpacing:'0.1em', color:'#fafafa', background:'rgba(0,0,0,0.45)', borderRadius:10, fontWeight:500, pointerEvents:'none' },
  loadingOverlay:    { position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 },
  spinner:           { width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#ffffff', animation:'spin 0.8s linear infinite' },
  promptPreview:     { background:'var(--color-bg-elevated)', border:'0.5px solid var(--color-border)', borderRadius:10, padding:'14px 16px' },
  promptLabel:       { fontSize:9, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500, marginBottom:8 },
  promptText:        { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.65 },
  downloadLink:      { fontSize:11, color:'var(--color-text-tertiary)', textDecoration:'none' },
  postGen:           { display:'flex', flexDirection:'column', gap:8 },
  postGenPrimary:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  postGenSecondary:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  actionBtn:         { padding:'11px 16px', background:'var(--color-text-primary)', color:'var(--color-bg)', border:'none', borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit', textAlign:'center' as const, textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center' },
  actionBtnGhost:    { padding:'10px 14px', background:'none', border:'0.5px solid var(--color-border-strong)', borderRadius:8, fontSize:11, color:'var(--color-text-tertiary)', cursor:'pointer', fontFamily:'inherit', textAlign:'center' as const, textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center' },
  upsellNote:        { fontSize:10, color:'var(--color-text-tertiary)', textAlign:'center' as const, letterSpacing:'0.02em', padding:'7px 14px', background:'var(--color-bg-elevated)', border:'0.5px solid var(--color-border)', borderRadius:6, lineHeight:1.5 },
}

export default GenerateClient
