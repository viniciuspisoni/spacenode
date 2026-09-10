'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ConstellationN } from '@/components/brand'
import {
  ProjectType, ProjectMaterials,
  getSegments, getEnvironments, getLighting, getBackgrounds, getSceneElements,
  PRESERVE, isPreserved,
} from '@/lib/prompts'
import {
  ENGINES, ENGINE_ORDER, DEFAULT_ENGINE, DEFAULT_RESOLUTION,
  type EngineId, type Resolution,
  getNodesCost, isEngineId, isResolution, isValidCombination,
} from '@/lib/engines'
import InsufficientNodesCta from '@/components/app/InsufficientNodesCta'
import { consumeHandoff } from '@/components/nodi/actions-bus'
import { uploadDirect } from '@/lib/storage/direct-upload-client'
import GenerateGuide, {
  GUIDE_START_EVENT, GUIDE_DISMISSED_KEY, type GuidePhase,
} from '@/components/app/GenerateGuide'
import {
  Sheet, SettingGroup, SettingRow, summarize,
  Segmented, PillGroup, MultiPillGroup, ChoiceGroup, RowIcon, useAmbient,
} from '@/components/app/glass'

interface GenerateClientProps {
  /** Saldo total da bolsa (mensais + extras) — mesmo pool que o débito consome. */
  initialCredits:    number
  initialMaterials?: ProjectMaterials
  initialConfig?:    ProjectConfig | null
  /** URL https de uma render existente a pré-carregar como input (ex.: "Reutilizar" no dashboard). */
  initialSourceUrl?: string
  /** 'spaces/new' = veio do fluxo Novo projeto sem renders — o CTA de resultado vira o caminho de volta. */
  returnTo?:         'spaces/new'
  /** true = a conta nunca gerou uma render — o Guia da primeira imagem abre sozinho. */
  firstRender?:      boolean
}

// Persisted last-used render config (profiles.project_config — JSONB).
// Type-strict fields (projectType / engine / resolution) are validated on
// load; free-text taxonomy strings flow through as-is. Configs antigas ainda
// podem trazer `fidelityLevel` — é ignorado: fidelidade é sempre máxima.
interface ProjectConfig {
  projectType?:        ProjectType
  segment?:            string
  environment?:        string
  lighting?:           string
  background?:         string
  sceneElements?:      string[]
  selectedEngine?:     EngineId
  selectedResolution?: Resolution
}

interface GenerateResult {
  outputUrl: string
  renderId?: string | null
  /** URL do input hospedado pelo servidor — reusada nas regenerações
   *  (sem re-upload; ativa o cache de briefing por input_url). */
  originalUrl?: string | null
  /** Saldo do plano pós-débito (backward compat). */
  credits:   number
  /** Saldo total pós-débito (mensais + extras) — preferir este. */
  totalBalance?: number
  /** Geometry score da entrega (0..1) — só no nível Máxima com gate ativo. */
  fidelityScore?:   number | null
  /** true quando o score final ficou abaixo do limite mesmo após retries. */
  fidelityWarning?: boolean
  /** true quando a auditoria de visão (volumetria/aberturas/câmera/materiais)
   *  apontou desvio de projeto. */
  semanticWarning?: boolean
  /** Seed usada na geração (caminho GCP) — reenviada no "Corrigir drift". */
  seed?: number
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

const RESOLUTION_DESC: Record<Resolution, string> = {
  hd: 'Rápido para testes',
  '2k': 'Ideal para apresentação',
  '4k': 'Máxima definição',
}

// O eixo que reconfigura tudo o mais fica na superfície (contrato do vidro,
// §3.4). Tipado aqui em cima porque o <Segmented> infere T dos itens: um
// array literal solto viraria `string` e o onChange deixaria de casar com
// handleProjectTypeChange.
const PROJECT_TYPE_ITEMS: ReadonlyArray<{ value: ProjectType; label: string }> = [
  { value: 'exterior', label: 'Ambiente Exterior' },
  { value: 'interior', label: 'Ambiente Interior' },
]

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

/** As quatro famílias da coluna de config. Cada uma é uma linha + uma folha. */
type SheetId = 'cena' | 'luz' | 'materiais' | 'saida'

// ── Helpers ────────────────────────────────────────────────────────────────────

function firstOf(arr: string[]): string { return arr[0] ?? '' }

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// ── Conversão de imagem no client (só formatos fora do upload direto) ─────────
//
// HISTÓRICO: até 2026-08 esta função era o caminho de TODO upload — reduzia
// qualquer imagem a 2048 px/JPEG 0.92 pra caber no body de 4,5 MB da Vercel,
// destruindo resolução antes do modelo ver o projeto. O fluxo principal agora
// é upload direto browser → Storage (uploadDirect, área render-source) com o
// arquivo ORIGINAL; esta função ficou só como conversor de formatos que o
// upload direto não aceita (ex.: HEIC/AVIF → JPEG), em resolução cheia.
async function compressImage(
  dataUrl: string,
  maxSide: number = 8192,
  quality: number = 0.95,
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
// Extensão real do output no nome do download (o caminho GCP re-hospeda PNG;
// a FAL passa a entregar PNG com o master lossless — .jpg fixo mentia o tipo).
function outputFilename(url: string): string {
  const m = url.split('?')[0].match(/\.(png|jpe?g|webp)$/i)
  const ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
  return `spacenode-render.${ext}`
}

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
// Config salva sempre vence; o default do catálogo só entra quando não há
// valor persistido válido.
//
// Até 2026-09-10 havia um default econômico só para conta sem assinatura
// (Pulsar + HD, 10 nodes). Ele saiu: o Quasar passou a ser o padrão para
// todo mundo, e manter um fork com os dois ramos apontando para o mesmo
// motor seria código que mente. O trial de 80 nodes rende 4 renders.
function resolveInitialConfig(cfg: ProjectConfig | null | undefined) {
  const projectType: ProjectType =
    cfg?.projectType === 'interior' || cfg?.projectType === 'exterior'
      ? cfg.projectType : 'exterior'
  const engine: EngineId = isEngineId(cfg?.selectedEngine) ? cfg.selectedEngine : DEFAULT_ENGINE
  const rawRes: Resolution = isResolution(cfg?.selectedResolution) ? cfg.selectedResolution : DEFAULT_RESOLUTION
  const resolution: Resolution = isValidCombination(engine, rawRes) ? rawRes : ENGINES[engine].resolutions[0]
  const sceneElements: string[] = Array.isArray(cfg?.sceneElements)
    ? cfg.sceneElements.filter((x): x is string => typeof x === 'string')
    : []
  return {
    projectType,
    // Os quatro nascem preservando: quem não abrir a folha não impõe nada
    // ao modelo. Config salva continua vencendo.
    segment:            cfg?.segment     ?? PRESERVE,
    environment:        cfg?.environment ?? PRESERVE,
    lighting:           cfg?.lighting    ?? PRESERVE,
    background:         cfg?.background  ?? PRESERVE,
    sceneElements,
    selectedEngine:     engine,
    selectedResolution: resolution,
  }
}

export function GenerateClient({ initialCredits, initialMaterials, initialConfig, initialSourceUrl, returnTo, firstRender = false }: GenerateClientProps) {
  const init = resolveInitialConfig(initialConfig)
  const fromSpacesNew = returnTo === 'spaces/new'
  const supabase = createClient()

  // ── Global state
  const [credits,            setCredits]           = useState(initialCredits)
  const [loading,            setLoading]           = useState(false)
  const [loadingText,        setLoadingText]       = useState('')
  const [loadingTextVisible, setLoadingTextVisible] = useState(true)
  const [generationKey,      setGenerationKey]     = useState(0)
  const [error,              setError]             = useState<string | null>(null)

  // ── Qual folha está aberta. Uma de cada vez: as quatro famílias são
  //    excludentes e o scrim é único.
  const [sheet, setSheet] = useState<SheetId | null>(null)

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
  const [selectedEngine,     setSelectedEngine]     = useState<EngineId>(init.selectedEngine)
  const [selectedResolution, setSelectedResolution] = useState<Resolution>(init.selectedResolution)

  // ── Materiais
  const [materials,       setMaterials]       = useState<ProjectMaterials>(initialMaterials ?? EMPTY_MATERIALS)
  const [salvando,        setSalvando]        = useState(false)
  const [salvoOk,         setSalvoOk]         = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Imagem e resultado
  const [imagePreview,      setImagePreview]      = useState<string | null>(null)
  const [outputUrl,         setOutputUrl]         = useState<string | null>(null)
  // Arquivo original selecionado (sobe INTEIRO via upload direto no Gerar) e
  // URL do input já hospedado pelo servidor (regenerações reusam sem re-upload).
  const [sourceFile,        setSourceFile]        = useState<File | null>(null)
  const [serverInputUrl,    setServerInputUrl]    = useState<string | null>(null)
  // Amostras visuais de material (field → URL pública). Viram imagens de
  // referência rotuladas na geração — o modelo reproduz o produto real em vez
  // de inventar veio/paginação a partir do texto. Sessão-only (não persiste).
  const [materialRefs,      setMaterialRefs]      = useState<Partial<Record<keyof ProjectMaterials, string>>>({})
  const [uploadingRef,      setUploadingRef]      = useState<keyof ProjectMaterials | null>(null)
  // Erro da amostra tem estado PRÓPRIO. O único gatilho dele vive dentro da
  // folha Materiais, e a folha é um portal em z-index 161 sobre um scrim de
  // 160 — a caixa de erro do dock (z-index 40) fica atrás do scrim, então
  // recusar um arquivo ali não produzia sinal visível nenhum pro usuário.
  const [sampleError,       setSampleError]       = useState<string | null>(null)
  // Verificação estrutural do render_only (a API compara o resultado com o
  // original e devolve o veredito — mesmo papel do preservation_warning do
  // Spaces). null = sem verificação (nível != Máxima ou gate desligado).
  const [fidelityScore,     setFidelityScore]     = useState<number | null>(null)
  const [fidelityWarning,   setFidelityWarning]   = useState(false)
  // Overlay do mapa de diferenças estruturais (/api/renders/[id]/diff).
  const [showDiff,          setShowDiff]          = useState(false)
  // Seed do último render — o "Corrigir drift" reusa pra manter a amostra.
  const [lastSeed,          setLastSeed]          = useState<number | null>(null)
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

  // ── Palco do comparador: o antes/depois é desenhado num retângulo com o
  //    aspecto do ORIGINAL (contain dentro da área flex), e as duas imagens
  //    preenchem esse MESMO retângulo. Sem isso, motor que devolve aspecto
  //    diferente do input fazia cada imagem letterboxar por conta própria
  //    (objectFit:contain numa caixa de aspecto arbitrário) e o render
  //    aparecia menor, flutuando sobreposto ao original.
  const [beforeAspect,      setBeforeAspect]      = useState<number | null>(null)
  const [compareArea,       setCompareArea]       = useState<{ w: number; h: number } | null>(null)

  // ── Âncora visual: render anterior usado pra manter consistência de
  //    materiais/texturas entre gerações sucessivas do mesmo input.
  //    Default true; usuário pode desligar pra começar do zero.
  const [useAnchor, setUseAnchor] = useState(true)

  // ── Refinar imagem: pedido cirúrgico pra alterar só uma coisa entre gerações.
  //    Só faz efeito quando há render anterior (anchor) — sem isso o modelo não
  //    tem referência fixa do "tudo o que deve ser preservado".
  const [refinementText, setRefinementText] = useState('')

  // A imagem em foco vira o papel de parede do app: é o que faz o painel de
  // vidro assumir a paleta do projeto, como no plugin. Enquanto não há
  // resultado, o papel é a própria referência que o usuário enviou.
  useAmbient(outputUrl ?? imagePreview)

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

  // ── Guia da primeira imagem: abre sozinho pra conta que nunca gerou (e não
  //    dispensou); manual via /app/generate#guia ou "Como usar" da sidebar.
  //    Estado inicia fechado e abre em effect — sem mismatch de hidratação.
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    // Pós-mount via rAF, mesmo padrão do handoff do Nodi acima (sem setState
    // síncrono em effect, sem mismatch de hidratação).
    const raf = requestAnimationFrame(() => {
      if (window.location.hash === '#guia') {
        // Limpa o hash (refresh não força reabrir) e abre mesmo já tendo renders.
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        setGuideOpen(true)
        return
      }
      try {
        if (firstRender && localStorage.getItem(GUIDE_DISMISSED_KEY) !== '1') setGuideOpen(true)
      } catch {
        if (firstRender) setGuideOpen(true)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [firstRender])

  // "Como usar" com o Renderizar já aberto: reabre o guia sem navegar.
  useEffect(() => {
    const onStart = () => setGuideOpen(true)
    window.addEventListener(GUIDE_START_EVENT, onStart)
    return () => window.removeEventListener(GUIDE_START_EVENT, onStart)
  }, [])

  const dismissGuide = () => {
    setGuideOpen(false)
    try { localStorage.setItem(GUIDE_DISMISSED_KEY, '1') } catch {}
  }

  const fileInputRef         = useRef<HTMLInputElement>(null)
  const compareRef           = useRef<HTMLDivElement>(null)
  const compareOuterRef      = useRef<HTMLDivElement>(null)
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

  // ── Cascade: engine → resolução suportada
  const handleEngineChange = (eid: EngineId) => {
    setSelectedEngine(eid)
    // Se a resolução atual não é suportada, cai pra 2K.
    if (!ENGINES[eid].resolutions.includes(selectedResolution)) {
      setSelectedResolution('2k')
    }
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
          sceneElements, selectedEngine, selectedResolution,
        }
        await supabase.from('profiles').update({ project_config: config }).eq('id', user.id)
      } catch (e) { console.error('Erro ao salvar config:', e) }
    }, 1500)
  }, [
    projectType, segment, environment, lighting, background,
    sceneElements, selectedEngine, selectedResolution,
    supabase,
  ])

  // ── Upload — plain functions; React Compiler handles memoization
  //
  // Preview via objectURL (resolução cheia, sem cópia base64 em memória);
  // revogado ao trocar de imagem e no unmount.
  const previewObjectUrlRef = useRef<string | null>(null)
  const setPreviewFromFile = (file: File) => {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current)
    const url = URL.createObjectURL(file)
    previewObjectUrlRef.current = url
    setImagePreview(url)
  }
  useEffect(() => () => {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current)
  }, [])

  // MIMEs que a área render-source aceita (lib/storage/direct-upload).
  const DIRECT_UPLOAD_MIMES = ['image/jpeg', 'image/png', 'image/webp']

  const loadImage = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 15 * 1024 * 1024) { setError('Imagem muito grande. Máximo 15 MB.'); return }
    setOutputUrl(null); setError(null); setUseAnchor(true); setRefinementText('')
    setFidelityScore(null); setFidelityWarning(false); setShowDiff(false)
    setServerInputUrl(null); setBeforeAspect(null)
    setScale(1); setPan({ x: 0, y: 0 })
    if (DIRECT_UPLOAD_MIMES.includes(file.type)) {
      // Caminho principal: o arquivo ORIGINAL sobe inteiro no Gerar (upload
      // direto). Nada de canvas/downscale no client.
      setSourceFile(file)
      setPreviewFromFile(file)
      return
    }
    // Formato fora do upload direto (ex.: HEIC/AVIF quando o browser decoda):
    // converte pra JPEG em resolução cheia (teto 8192) — nunca mais o
    // downscale de 2048 px que este fluxo aplicava a todo upload.
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const dataUrl = await compressImage(e.target?.result as string, 8192, 0.95)
        const blob = await (await fetch(dataUrl)).blob()
        const converted = new File([blob], 'input.jpg', { type: 'image/jpeg' })
        setSourceFile(converted)
        setPreviewFromFile(converted)
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

  // ── Amostra de material: upload direto → URL pública ─────────────────────
  const handleMaterialRefUpload = async (field: keyof ProjectMaterials, file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSampleError('Amostra deve ser JPG, PNG ou WebP.'); return
    }
    if (file.size > 8 * 1024 * 1024) { setSampleError('Amostra muito grande. Máximo 8 MB.'); return }
    setUploadingRef(field); setSampleError(null)
    try {
      const { url } = await uploadDirect(file, 'render-material', {}, { confirm: true })
      if (url) setMaterialRefs(prev => ({ ...prev, [field]: url }))
    } catch (e) {
      setSampleError(e instanceof Error ? e.message : 'Falha ao enviar a amostra.')
    } finally {
      setUploadingRef(null)
    }
  }

  // ── Geração
  const handleGenerate = async (
    resolutionOverride?: Resolution,
    opts?: { structuralBoost?: boolean },
  ) => {
    if (!imagePreview || (!sourceFile && !serverInputUrl)) { setError('Faça upload de uma imagem primeiro.'); return }
    if (credits < nodeCost) { setError('Nodes insuficientes.'); return }
    setError(null); setLoading(true); startLoadingTexts()
    try {
      // Anchor: usa o último output como referência visual de materiais quando
      // o usuário regera a mesma imagem (ex: troca de iluminação) e o toggle
      // estiver ligado. No "Corrigir drift" a âncora fica de fora — ela seria
      // exatamente o output com o drift que estamos corrigindo.
      const anchorUrl = !opts?.structuralBoost && useAnchor && outputUrl ? outputUrl : undefined

      // Primeira geração desta imagem: sobe o arquivo ORIGINAL direto pro
      // Storage (browser → bucket, sem passar pela Vercel) e envia só a key.
      // Regenerações reusam a URL que o servidor já hospedou — sem re-upload
      // e com cache de briefing por input_url na rota.
      const sourceParams: Record<string, string> = {}
      if (serverInputUrl) {
        sourceParams.inputUrl = serverInputUrl
      } else {
        const { key } = await uploadDirect(sourceFile!, 'render-source', {}, { confirm: false })
        sourceParams.sourceKey = key
      }

      // Amostras só dos campos visíveis no tipo de projeto atual (mesma regra
      // do texto de materiais — campo interior não vaza pro exterior).
      const fieldsNow = projectType === 'interior' ? MATERIAL_FIELDS_INTERIOR : MATERIAL_FIELDS_EXTERIOR
      const materialRefEntries = fieldsNow
        .filter(({ field }) => materialRefs[field])
        .map(({ field }) => ({ field, url: materialRefs[field]! }))

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sourceParams,
          // Fidelidade é sempre máxima: os níveis "Equilibrado"/"Criativo"
          // foram descontinuados (deixavam a IA alucinar no projeto).
          fidelityLevel: 'maximum',
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
          materialRefs:  materialRefEntries.length > 0 ? materialRefEntries : undefined,
          anchorUrl,
          refinementText: refinementText.trim() || undefined,
          ...(opts?.structuralBoost
            ? { structuralBoost: true, ...(lastSeed !== null ? { seed: lastSeed } : {}) }
            : {}),
        }),
      })
      const data: GenerateResult = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na geração')
      setOutputUrl(data.outputUrl); setCredits(data.totalBalance ?? data.credits); setSliderPos(50)
      setLastRenderId(data.renderId ?? null)
      setShowDiff(false)
      setServerInputUrl(data.originalUrl ?? serverInputUrl ?? null)
      setFidelityScore(typeof data.fidelityScore === 'number' ? data.fidelityScore : null)
      setFidelityWarning(Boolean(data.fidelityWarning) || Boolean(data.semanticWarning))
      setLastSeed(typeof data.seed === 'number' ? data.seed : null)
      setScale(1); setPan({ x: 0, y: 0 })
      if (refinementText.trim()) setRefinementText('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally { setLoading(false); stopLoadingTexts() }
  }

  // Aspecto natural do input — alimenta o palco do comparador. Vem do onLoad
  // dos <img> de preview (cobre upload direto e fonte via URL do histórico);
  // naturalWidth/Height já consideram a orientação EXIF nos browsers atuais,
  // então bate com o que o servidor normaliza e manda ao modelo.
  const readBeforeAspect = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) setBeforeAspect(naturalWidth / naturalHeight)
  }

  // Área flex disponível pro comparador (ResizeObserver acompanha resize de
  // janela/coluna). O palco deriva no render: contain(área, beforeAspect).
  useEffect(() => {
    const el = compareOuterRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r && r.width > 0 && r.height > 0) setCompareArea({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [imagePreview, outputUrl])

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

  // ── Reseta o estado da geração atual pra começar um render do zero
  //    com nova imagem. Mantém os parâmetros (segmento, ambiente etc.) —
  //    só limpa o que pertence ao ciclo da imagem atual.
  const handleNewRender = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
    setImagePreview(null)
    setOutputUrl(null)
    setSourceFile(null)
    setServerInputUrl(null)
    setRefinementText('')
    setUseAnchor(true)
    setError(null)
    setFidelityScore(null)
    setFidelityWarning(false)
    setShowDiff(false)
    setSliderPos(50)
    setScale(1)
    setPan({ x: 0, y: 0 })
    setBeforeAspect(null)
  }

  // Palco do comparador: retângulo com o aspecto do original, contido na área
  // disponível. Fallback 100% no primeiro frame (antes de imagem/área medirem).
  let stageBox: React.CSSProperties = { width: '100%', height: '100%' }
  if (beforeAspect && compareArea) {
    const stageW = Math.min(compareArea.w, compareArea.h * beforeAspect)
    stageBox = { width: stageW, height: stageW / beforeAspect }
  }

  // ── Computed
  // Considera apenas os campos visíveis no projectType atual. Sem isso, um
  // campo interior-only preenchido (ex: marcenaria) contaria no resumo mesmo
  // depois de trocar pra exterior, onde ele nem aparece.
  const visibleMaterialFields = projectType === 'interior' ? MATERIAL_FIELDS_INTERIOR : MATERIAL_FIELDS_EXTERIOR
  const filledMaterials = visibleMaterialFields.filter(({ field }) => {
    const v = materials[field]
    return !!(v && v.trim())
  }).length
  const materialSamples = visibleMaterialFields.filter(({ field }) => materialRefs[field]).length
  const currentEngine = ENGINES[selectedEngine]
  const nodeCost      = getNodesCost(selectedEngine, selectedResolution)
  const segments      = getSegments(projectType)
  const environments  = getEnvironments(projectType, segment)
  const lightingOpts  = getLighting(projectType, segment)
  const backgrounds   = getBackgrounds(projectType)
  const elementsOpts  = getSceneElements(projectType, segment)
  const bgTitle       = projectType === 'exterior' ? 'Entorno' : 'Contexto visual'
  const noNodes       = credits < nodeCost
  // Quantos renders o saldo total cobre na config atual — recalcula client-side
  // a cada troca de motor/qualidade e após cada geração (credits é estado).
  const rendersAfford = Math.floor(credits / nodeCost)

  // Melhor combinação motor × resolução que ainda cabe no saldo — a saída
  // honesta pra quem está sem nodes: gerar com menos qualidade em vez de pagar.
  // "Melhor" = a mais cara dentro do orçamento (mais qualidade pelo que sobrou).
  const cheaperFit = !noNodes ? null : ENGINE_ORDER.flatMap(eid =>
    ENGINES[eid].resolutions
      .filter(res => isValidCombination(eid, res))
      .map(res => ({ engine: eid, res, cost: getNodesCost(eid, res) }))
  ).filter(o => o.cost <= credits)
   .sort((a, b) => b.cost - a.cost)[0] ?? null

  // ── Resumos das quatro linhas ────────────────────────────────────────────
  // Regra do contrato: entra o que o usuário ESCOLHEU. "Preservar Original"
  // só aparece quando é a única coisa a dizer — senão é ruído ocupando a
  // largura de uma linha de 44px.
  // O resumo mostra o que o usuário ESCOLHEU. Preservado não é escolha —
  // sai da linha. Com os quatro preservados a linha ficaria vazia, e aí o
  // texto assume o lugar: dizer "Preservar original" é mais honesto do que
  // uma linha muda, porque essa É a configuração.
  const cenaEscolhas = summarize([
    isPreserved(segment)     ? '' : segment,
    isPreserved(environment) ? '' : environment,
    isPreserved(background)  ? '' : background,
    sceneElements.length ? plural(sceneElements.length, 'elemento', 'elementos') : '',
  ])
  const cenaSummary = cenaEscolhas || 'Preservar original'
  const luzSummary = isPreserved(lighting) ? 'Preservar original' : lighting
  const materiaisSummary = filledMaterials === 0 && materialSamples === 0
    ? 'Preservar do original'
    : summarize([
        filledMaterials ? plural(filledMaterials, 'superfície', 'superfícies') : '',
        materialSamples ? plural(materialSamples, 'amostra', 'amostras') : '',
      ])
  const saidaSummary = summarize([
    currentEngine.name,
    selectedResolution.toUpperCase(),
    `${nodeCost} nodes`,
  ])

  // Rótulo do CTA: a mesma ação muda de nome conforme o que já existe na tela.
  const ctaLabel = loading
    ? 'Gerando…'
    : refinementText.trim() && outputUrl && useAnchor ? 'Aplicar refinamento'
    : outputUrl && useAnchor ? 'Gerar variação'
    : 'Gerar render'

  // ── Render ─────────────────────────────────────────────────────────────────

  // Fase do Guia da primeira imagem — deriva do estado real da página, sem
  // estado próprio: enviar referência → montar cenário → gerar → resultado.
  const guidePhase: GuidePhase =
    loading ? 'generating'
    : outputUrl ? 'done'
    : imagePreview ? 'configure'
    : 'upload'

  const closeSheet = () => setSheet(null)

  return (
    <div className="spn-tool">

      {/* ── CONFIGURAÇÃO ──
          Painel com scroll próprio e dock colado embaixo: o CTA não depende
          mais de o usuário chegar ao fim da coluna. */}
      <div className="spn-tool-panel spn-glass">
        <div className="spn-tool-panel-body" style={S.panelBody}>

          <div style={S.topbar}>
            <span style={S.pageTitle}>RENDERIZAR</span>
            <Link href="/app/billing" className="spn-balance spn-glass spn-glass--raised"
                  style={{ textDecoration: 'none' }} title="Recarregar nodes">
              <span className="spn-balance-dot" aria-hidden />
              <b>{credits}</b> nodes
            </Link>
          </div>

          {/* Único controle que fica na superfície: é o eixo que reconfigura
              segmento, espaço, luz, entorno, elementos e campos de material. */}
          <Segmented
            label="Tipo de projeto"
            value={projectType}
            onChange={handleProjectTypeChange}
            items={PROJECT_TYPE_ITEMS}
          />

          <SettingGroup>
            <SettingRow icon={<RowIcon name="scene" />}     title="Cena"      value={cenaSummary}      onOpen={() => setSheet('cena')} />
            <SettingRow icon={<RowIcon name="light" />}     title="Luz"       value={luzSummary}       onOpen={() => setSheet('luz')} />
            <SettingRow icon={<RowIcon name="materials" />} title="Materiais" value={materiaisSummary} onOpen={() => setSheet('materiais')} />
            <SettingRow icon={<RowIcon name="output" />}    title="Saída"     value={saidaSummary}     onOpen={() => setSheet('saida')} />
          </SettingGroup>

          <p className="spn-hint">
            Tudo já vem decidido. O que você não pedir aqui é preservado do jeito
            que está no seu modelo.
          </p>
        </div>

        {/* Dock: o CTA nunca some no scroll. */}
        <div className="spn-dock spn-glass spn-glass--chrome">
          {error && <div className="spn-error" style={{ marginBottom: 10 }}>{error}</div>}

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
            <div className="spn-cost">
              <div className="spn-cost-figures">
                <div className="spn-cost-main">{nodeCost} nodes</div>
                <div className="spn-cost-sub">
                  {imagePreview
                    ? `saldo para ~${rendersAfford} render${rendersAfford === 1 ? '' : 's'}`
                    : 'envie uma imagem para começar'}
                </div>
              </div>
              <button
                type="button"
                className="spn-cta"
                onClick={() => handleGenerate()}
                disabled={loading || !imagePreview}
              >
                {ctaLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── PALCO ── */}
      <div className="spn-glass" style={S.stage}>
        <div style={S.stageBody}>

          {guideOpen && (
            <div style={S.guideSlot}>
              <GenerateGuide
                phase={guidePhase}
                fromSpacesNew={fromSpacesNew}
                onDismiss={dismissGuide}
              />
            </div>
          )}

          <div style={S.topbar}>
            <span style={S.pageTitle}>{outputUrl ? 'ANTES / DEPOIS' : 'REFERÊNCIA'}</span>
            {outputUrl && (
              <button
                type="button"
                onClick={() => downloadImage(outputUrl, outputFilename(outputUrl))}
                style={S.linkBtn}
              >
                baixar render ↓
              </button>
            )}
          </div>

          {!imagePreview && (
            <div
              className="spn-empty spn-glass"
              style={{
                ...S.uploadZone,
                ...(isDraggingFile ? { borderColor: 'var(--color-text-primary)' } : null),
              }}
              onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={S.uploadIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={S.uploadTitle}>arraste sua imagem aqui</div>
                <div style={S.uploadSub}>SketchUp · Render · 3D · JPG · PNG · até 15 MB</div>
              </div>
              <button type="button" className="spn-ghost" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
                escolher arquivo
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) loadImage(f) }}/>
            </div>
          )}

          {imagePreview && outputUrl && (
            <div ref={compareOuterRef} style={S.compareOuter}>
              {/* Palco com o aspecto do original: antes, depois e diff preenchem
                  o MESMO retângulo (objectFit:fill). Aspecto igual (caso comum,
                  pino de formato) = idêntico ao contain; quando o motor devolve
                  formato diferente, o depois é mapeado no quadro do antes e a
                  cortina segue alinhada — nada de render menor flutuando. */}
              <div
                ref={compareRef}
                style={{
                  ...S.compareStage,
                  ...stageBox,
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
                  <img src={imagePreview} alt="Antes" style={S.stageImg} draggable={false} onLoad={readBeforeAspect}/>
                </div>
                {/* Depois — clip em coords do palco, transform aplicado dentro do clip */}
                <div style={{...S.compareAfterWrap, clipPath:`inset(0 ${100-sliderPos}% 0 0)`, pointerEvents:'none'}}>
                  <div style={{
                    position:'absolute', inset:0,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin:'0 0',
                  }}>
                    <img src={outputUrl} alt="Depois" style={S.stageImg} draggable={false}/>
                  </div>
                </div>
                {/* Handle do slider em coords do palco; ativa pointerEvents só no círculo
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
                {/* Overlay do mapa de diferenças estruturais — cobre o comparador
                    inteiro (acompanha zoom/pan) e não captura eventos. */}
                {showDiff && lastRenderId && (
                  <div style={{
                    position:'absolute', inset:0,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin:'0 0',
                    pointerEvents:'none',
                    opacity:0.92,
                  }}>
                    <img
                      src={`/api/renders/${lastRenderId}/diff`}
                      alt="Mapa de diferenças estruturais"
                      style={S.stageImg}
                      draggable={false}
                    />
                  </div>
                )}
                {scale > 1 && (
                  <div style={S.zoomBadge}>{Math.round(scale * 100)}%</div>
                )}
              </div>
            </div>
          )}

          {imagePreview && outputUrl && showDiff && (
            <p className="spn-hint" style={{ marginTop: 0 }}>
              <span style={{ color: 'var(--color-error)' }}>Vermelho</span>: bordas
              estruturais do projeto original não encontradas no render — confira se
              são mudanças pedidas ou desvios.
            </p>
          )}

          {/* ── POST-GENERATION ACTIONS ──
              Âncora e refino são CONTEXTUAIS: só existem depois do primeiro
              resultado. Por isso vivem aqui, junto dele, e não como uma quinta
              linha permanente na coluna de config. */}
          {imagePreview && outputUrl && !loading && (
            <div style={S.postGen}>
              {/* Veredito da verificação estrutural (gate render_only): aviso
                  quando o score da entrega ficou abaixo do limite; selo discreto
                  quando a estrutura foi verificada com folga (≥ 0.8). */}
              {fidelityWarning ? (
                <div className="spn-error">
                  A verificação estrutural detectou possíveis diferenças em relação ao
                  projeto original.
                  {/* Corrigir drift: re-gera com a MESMA seed, condicionamento
                      estrutural máximo (edge map + temperatura mínima) e sem
                      âncora — muda o condicionamento, não a amostra. */}
                  <button
                    type="button"
                    className="spn-ghost"
                    style={{ display: 'block', marginTop: 8 }}
                    onClick={() => handleGenerate(undefined, { structuralBoost: true })}
                  >
                    Corrigir automaticamente ({nodeCost} nodes)
                  </button>
                </div>
              ) : fidelityScore !== null && fidelityScore >= 0.8 ? (
                <div style={S.fidelityOk}>✓ Estrutura verificada contra o projeto original</div>
              ) : null}

              {/* Âncora: pílula de ESTADO (role=switch), não um campo de config. */}
              <div className="spn-pills">
                <button
                  type="button"
                  role="switch"
                  className="spn-pill"
                  aria-checked={useAnchor}
                  onClick={() => setUseAnchor(v => !v)}
                  title={useAnchor
                    ? 'Desligar pra gerar do zero, sem ancorar nos materiais do render anterior'
                    : 'Ligar pra manter os materiais e texturas do render anterior'}
                >
                  Manter materiais do render anterior
                </button>
              </div>
              {/* A pílula sozinha comunica o estado só pelo preenchimento —
                  numa pílula ÚNICA (sem irmã pra comparar) isso é ambíguo, e
                  o rótulo não muda. O original dizia "ancorado"/"do zero" ao
                  lado do check; a linha abaixo devolve essa palavra. */}
              <p className="spn-hint" style={{ marginTop: -4 }}>
                {useAnchor
                  ? 'Ligado — a próxima geração parte dos materiais do render atual.'
                  : 'Desligado — a próxima geração começa do zero.'}
              </p>

              {/* Refinar — só faz sentido com âncora ativa (precisa da #1 como referência) */}
              {useAnchor && (
                <div className="spn-field" style={{ marginBottom: 0 }}>
                  <span className="spn-field-label">Refinar imagem (opcional)</span>
                  <textarea
                    className="spn-textarea"
                    value={refinementText}
                    onChange={e => setRefinementText(e.target.value)}
                    placeholder="ex: trocar o piso para porcelanato cinza claro, mantendo todo o resto"
                    rows={2}
                  />
                  <p className="spn-hint">
                    Em branco, o botão só regera com os parâmetros atuais. Preenchido,
                    ele pede a alteração específica.
                  </p>
                </div>
              )}

              {selectedResolution === 'hd' && (
                <div className="spn-upsell-note">
                  Melhore para 2K ou 4K para apresentação profissional
                </div>
              )}

              {/* Próximo passo natural depois da render. Sem verde: verde é
                  estado, nunca ação (contrato do vidro, §2.3). */}
              {lastRenderId && (
                <Link
                  href={`/app/spaces/new/from-render?render_id=${lastRenderId}`}
                  className="spn-glass spn-glass--raised"
                  style={S.nextStep}
                >
                  <span style={S.nextStepIcon} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
                    </svg>
                  </span>
                  <span style={S.nextStepBody}>
                    <span style={S.nextStepTitle}>
                      {fromSpacesNew
                        ? 'Render pronta. Continuar criando o projeto'
                        : 'Criar projeto a partir desta render'}
                    </span>
                    <span style={S.nextStepSub}>
                      {fromSpacesNew
                        ? 'Volte pro novo projeto com esta render já selecionada como Vista Mestre'
                        : 'Trave o DNA e gere variações coerentes — iluminação, ângulo, horário'}
                    </span>
                  </span>
                  <span style={S.nextStepArrow} aria-hidden="true">→</span>
                </Link>
              )}

              {/* O primário da tela é o do dock. Aqui tudo é secundário. */}
              <div style={S.postGenGrid}>
                <button type="button" className="spn-ghost" onClick={() => downloadImage(outputUrl, outputFilename(outputUrl))}>
                  Baixar imagem
                </button>
                <button type="button" className="spn-ghost" onClick={() => handleGenerate('2k')}>
                  Melhorar qualidade (2K)
                </button>
                <a
                  className="spn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  href={`/app/editar?source=${encodeURIComponent(outputUrl)}&source_type=render${lastRenderId ? `&source_id=${lastRenderId}` : ''}`}
                >
                  Editar imagem
                </a>
                <button type="button" className="spn-ghost" onClick={handleNewRender}>
                  Iniciar novo render
                </button>
                {/* Transparência de fidelidade: overlay com as bordas do original
                    que não foram encontradas no render (endpoint /diff). */}
                {lastRenderId && (
                  <button type="button" className="spn-ghost" onClick={() => setShowDiff(v => !v)}>
                    {showDiff ? 'Ocultar diferenças' : 'Ver diferenças'}
                  </button>
                )}
              </div>
            </div>
          )}

          {imagePreview && !outputUrl && !loading && (
            <div style={S.compareWrap}>
              <img src={imagePreview} alt="Input" style={S.compareImg} onLoad={readBeforeAspect}/>
              <span style={{...S.compareLabel, left:14}}>ANTES</span>
              <button
                type="button"
                className="spn-ghost"
                style={S.changeImageBtn}
                onClick={() => { setImagePreview(null); setOutputUrl(null); setSourceFile(null); setServerInputUrl(null); setBeforeAspect(null) }}
              >
                trocar imagem
              </button>
            </div>
          )}

          {loading && imagePreview && (
            <div style={S.compareWrap}>
              <img src={imagePreview} alt="Input" style={{...S.compareImg, opacity:0.12, filter:'blur(6px)'}}/>
              <div className="spn-overlay">
                <div className="constellation-loading" style={{color:'#fafafa'}}>
                  <ConstellationN size={40} />
                </div>
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
                  <span style={{
                    fontSize: 12,
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
        </div>
      </div>

      {/* ── FOLHAS ────────────────────────────────────────────────────────────
          A cascata (tipo → segmento → espaço/luz/elementos) continua inteira:
          trocar segmento aqui dentro ainda reescreve espaço, luz e elementos,
          e o auto-save de 1,5 s continua vendo só o estado final do batch. */}

      <Sheet open={sheet === 'cena'} title="Cena" onClose={closeSheet}>
        <div className="spn-field">
          <span className="spn-field-label">Segmento</span>
          <PillGroup label="Segmento" options={segments} value={segment} onChange={handleSegmentChange} />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Espaço</span>
          <PillGroup label="Espaço" options={environments} value={environment} onChange={setEnvironment} />
          {/* Com o segmento preservado a lista tem uma pílula só, e sem esta
              linha ela parece um grupo morto — o usuário não descobre que é
              o segmento que a acorda. */}
          {isPreserved(segment) && (
            <p className="spn-hint">Escolha um segmento acima para listar os espaços.</p>
          )}
        </div>
        <div className="spn-field">
          <span className="spn-field-label">{bgTitle}</span>
          <PillGroup label={bgTitle} options={backgrounds} value={background} onChange={setBackground} />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Elementos na cena</span>
          <MultiPillGroup label="Elementos na cena" options={elementsOpts} values={sceneElements} onChange={setSceneElements} />
          <p className="spn-hint">
            Só o que você marcar entra na cena. Nada marcado = a cena fica como está no modelo.
          </p>
          {sceneElements.length > 0 && (
            <button type="button" className="spn-ghost" style={{ marginTop: 10 }} onClick={() => setSceneElements([])}>
              Limpar seleção
            </button>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === 'luz'} title="Luz" onClose={closeSheet}>
        <div className="spn-field">
          <span className="spn-field-label">Iluminação</span>
          <PillGroup label="Iluminação" options={lightingOpts} value={lighting} onChange={setLighting} />
          <p className="spn-hint">
            &quot;Preservar Original&quot; mantém exatamente a luz que já está no seu modelo.
          </p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'materiais'} title="Materiais" onClose={closeSheet}>
        <p className="spn-hint" style={{ marginTop: 0, marginBottom: 16 }}>
          Preencha apenas pra <strong>alterar</strong> materiais específicos. Em branco =
          preserva todos do original. Anexe uma <strong>amostra</strong> (foto do produto)
          pro material ser reproduzido com exatidão.
        </p>
        {/* A recusa da amostra tem de aparecer AQUI: o dock fica atrás do
            scrim enquanto a folha está aberta. */}
        {sampleError && (
          <div className="spn-error" role="alert" style={{ marginBottom: 16 }}>{sampleError}</div>
        )}
        {visibleMaterialFields.map(({ field, label, placeholder }) => (
          <div key={field} className="spn-field">
            <div style={S.materialHead}>
              <span className="spn-field-label" style={{ marginBottom: 0 }}>{label}</span>
              {/* Amostra visual: foto do produto real reproduzida fielmente
                  na superfície — muito mais preciso que o texto sozinho. */}
              {materialRefs[field] ? (
                <span style={S.matRefChip}>
                  <img src={materialRefs[field]} alt={`Amostra de ${label}`} style={S.matRefThumb}/>
                  <button
                    type="button"
                    style={S.matRefRemove}
                    aria-label={`Remover amostra de ${label}`}
                    onClick={() => setMaterialRefs(prev => { const next = { ...prev }; delete next[field]; return next })}
                  >×</button>
                </span>
              ) : (
                <label className="spn-pill" style={{ ...S.matRefAdd, ...(uploadingRef !== null ? { opacity: 0.5, cursor: 'wait' } : null) }}>
                  {uploadingRef === field ? 'enviando…' : '+ amostra'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    disabled={uploadingRef !== null}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleMaterialRefUpload(field, f); e.target.value = '' }}
                  />
                </label>
              )}
            </div>
            <input
              className="spn-input"
              type="text"
              value={materials[field] ?? ''}
              placeholder={placeholder}
              onChange={e => handleMaterialChange(field, e.target.value)}
            />
          </div>
        ))}
        <p className="spn-hint" aria-live="polite">
          {salvando ? 'salvando…' : salvoOk ? 'salvo ✓' : 'salvo automaticamente'}
        </p>
      </Sheet>

      <Sheet open={sheet === 'saida'} title="Saída" onClose={closeSheet}>
        <div className="spn-field">
          <span className="spn-field-label">Motor</span>
          <ChoiceGroup
            label="Motor"
            cols={3}
            value={selectedEngine}
            onChange={handleEngineChange}
            options={ENGINE_ORDER.map(eid => ({
              value: eid,
              title: ENGINES[eid].name,
            }))}
          />
          <p className="spn-hint">{currentEngine.description}</p>
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Qualidade</span>
          {/* Motor de resolução única (é o caso do Quasar, que só entrega 2K):
              um cartão sozinho e sempre marcado é um controle que não se
              opera — vira ruído com aparência de escolha. A informação
              continua na tela, como linha. */}
          {currentEngine.resolutions.length === 1 ? (
            <p className="spn-hint" style={{ marginTop: 0 }}>
              <b style={{ color: 'var(--color-text-primary)', fontWeight: 560 }}>
                {selectedResolution.toUpperCase()} · {currentEngine.nodes[selectedResolution] ?? 0} nodes
              </b>
              {' — '}{RESOLUTION_DESC[selectedResolution]}
              {' · única resolução do '}{currentEngine.name}
            </p>
          ) : (
            <>
              <ChoiceGroup
                label="Qualidade"
                cols={currentEngine.resolutions.length >= 3 ? 3 : 2}
                value={selectedResolution}
                onChange={setSelectedResolution}
                options={currentEngine.resolutions.map(res => ({
                  value: res,
                  title: res.toUpperCase(),
                  note:  `${currentEngine.nodes[res] ?? 0} nodes`,
                }))}
              />
              <p className="spn-hint">{RESOLUTION_DESC[selectedResolution]}</p>
            </>
          )}
        </div>
      </Sheet>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
//
// O que sobrou de inline é geometria (posição, grade, tamanho de imagem) e
// tipografia de rótulo. Material, raio, sombra e curva vêm dos tokens — nada
// de `borderRadius: 18` ou sombra literal (contrato do vidro, §1).

const S: Record<string, React.CSSProperties> = {
  panelBody:         { display:'flex', flexDirection:'column', gap:16 },
  stage:             { minHeight:0, borderRadius:'var(--r-card)', overflow:'hidden', display:'flex', flexDirection:'column' },
  stageBody:         { flex:1, minHeight:0, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:14 },
  // O guia e o bloco pós-resultado NÃO encolhem: numa coluna flex, quem
  // encolhe primeiro é quem tem altura automática, e aí o cartão do guia
  // ficaria com o texto cortado em vez de a coluna rolar.
  guideSlot:         { flex:'0 0 auto' },
  topbar:            { display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexShrink:0 },
  pageTitle:         { fontSize:10, letterSpacing:'0.24em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:600 },
  linkBtn:           { fontSize:11, color:'var(--color-text-tertiary)', background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:'inherit' },

  uploadZone:        { flex:1, minHeight:300, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, cursor:'pointer' },
  uploadIcon:        { width:44, height:44, borderRadius:'var(--r-inner)', color:'var(--color-text-tertiary)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 0 0 0.5px var(--glass-line-strong)' },
  uploadTitle:       { fontSize:15, fontWeight:500, color:'var(--color-text-primary)', letterSpacing:'-0.02em' },
  uploadSub:         { fontSize:12, color:'var(--color-text-tertiary)', marginTop:4 },

  compareWrap:       { position:'relative', borderRadius:'var(--r-card)', overflow:'hidden', flex:1, minHeight:300, background:'var(--color-preview-bg)', border:'0.5px solid var(--glass-line)', boxShadow:'var(--shadow-float)', userSelect:'none', cursor:'ew-resize' },
  compareImg:        { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', pointerEvents:'none' },
  // Área flex do comparador (sem moldura) + palco dimensionado pelo aspecto do
  // original. As imagens do palco usam fill: o retângulo JÁ tem o aspecto do
  // antes, e o depois é esticado pra alinhar com a cortina quando o motor
  // devolve formato levemente diferente (drift grande vira aviso de fidelidade).
  compareOuter:      { position:'relative', flex:1, minHeight:300, minWidth:0, display:'flex', alignItems:'center', justifyContent:'center' },
  compareStage:      { position:'relative', borderRadius:'var(--r-card)', overflow:'hidden', maxWidth:'100%', maxHeight:'100%', background:'var(--color-preview-bg)', border:'0.5px solid var(--glass-line)', boxShadow:'var(--shadow-float)', userSelect:'none' },
  stageImg:          { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'fill', pointerEvents:'none' },
  compareAfterWrap:  { position:'absolute', inset:0 },
  compareHandle:     { position:'absolute', top:0, bottom:0, width:2, background:'#ffffff', transform:'translateX(-50%)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  compareHandleCircle: { width:34, height:34, borderRadius:'50%', background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 22px rgba(0,0,0,0.26)' },
  compareLabel:      { position:'absolute', bottom:12, fontSize:9, letterSpacing:'0.12em', color:'#fafafa', textTransform:'uppercase', fontWeight:500, textShadow:'0 1px 3px rgba(0,0,0,0.5)', pointerEvents:'none' },
  changeImageBtn:    { position:'absolute', top:12, right:14, zIndex:6 },
  zoomBadge:         { position:'absolute', top:12, left:14, padding:'3px 9px', fontSize:9, letterSpacing:'0.1em', color:'#fafafa', background:'var(--color-scrim)', borderRadius:10, fontWeight:500, pointerEvents:'none' },

  postGen:           { display:'flex', flexDirection:'column', gap:12, flexShrink:0 },
  postGenGrid:       { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  fidelityOk:        { fontSize:11, color:'var(--color-accent-green)', display:'flex', alignItems:'center', gap:6 },

  nextStep:          { display:'flex', alignItems:'center', gap:12, padding:'13px 14px', borderRadius:'var(--r-inner)', textDecoration:'none' },
  nextStepIcon:      { width:32, height:32, flex:'0 0 32px', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--color-text-secondary)' },
  nextStepBody:      { display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:0 },
  nextStepTitle:     { fontSize:12.5, fontWeight:560, color:'var(--color-text-primary)', letterSpacing:'-0.01em' },
  nextStepSub:       { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.45 },
  nextStepArrow:     { flex:'0 0 auto', fontSize:15, color:'var(--color-text-quaternary)' },

  materialHead:      { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8 },
  matRefAdd:         { fontSize:10, padding:'3px 9px', whiteSpace:'nowrap', cursor:'pointer' },
  matRefChip:        { display:'inline-flex', alignItems:'center', gap:4 },
  matRefThumb:       { width:22, height:22, borderRadius:4, objectFit:'cover', border:'0.5px solid var(--glass-line-strong)' },
  matRefRemove:      { fontSize:12, color:'var(--color-text-tertiary)', background:'none', border:'none', cursor:'pointer', padding:0, lineHeight:1 },
}

export default GenerateClient
