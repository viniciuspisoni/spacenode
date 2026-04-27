#!/usr/bin/env bash
# fix-materials.sh
# Adiciona campos de materiais do projeto com salvamento no Supabase

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓${RESET} $1"; }
info() { echo -e "${YELLOW}→${RESET} $1"; }

echo ""
echo "  SpaceNode — Campos de Materiais do Projeto"
echo "  ============================================"
echo ""

# ── 1. SQL de migration ───────────────────────────────────────
info "Gerando migration SQL..."
cat > migration-materials.sql << 'SQL'
-- SpaceNode: adiciona coluna de materiais do projeto no perfil do usuário
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS project_materials JSONB DEFAULT '{}';

-- Índice para busca futura
CREATE INDEX IF NOT EXISTS profiles_materials_idx ON profiles USING gin(project_materials);
SQL
ok "migration-materials.sql gerado — execute no Supabase Dashboard antes de continuar"

# ── 2. lib/prompts.ts — adiciona suporte a materiais ─────────
info "Atualizando lib/prompts.ts..."
cat > lib/prompts.ts << 'EOF'
// lib/prompts.ts
export type Mode = 'externo' | 'interno' | 'planta' | 'multi' | 'paisagem' | 'prancha'

export interface ProjectMaterials {
  fachada?:    string  // ex: "placas cimentícias texturizadas, ACM preto"
  piso?:       string  // ex: "porcelanato 90x90 cinza claro"
  esquadrias?: string  // ex: "alumínio preto fosco"
  elementos?:  string  // ex: "painel de madeira ipê, brise metálico"
  outros?:     string  // ex: "estrutura em concreto aparente"
}

export interface GenerateOptions {
  mode: Mode
  condition?: string
  background?: string
  ambient?: string
  lighting?: string
  plantType?: string
  perspective?: string
  vegetation?: string
  lightCondition?: string
  geometryLock: number
  materials?: ProjectMaterials
}

const PHOTO_SUFFIX =
  ', captured with professional architectural camera, Canon R5, 24mm tilt-shift lens, f/4, ISO 100, Hasselblad aesthetic, hyperrealistic, 8K RAW photo, photorealistic architectural photography, not a render, not CGI, real life photo'

// ── Bloco de materiais injetado no prompt ─────────────────────
function buildMaterialsBlock(materials?: ProjectMaterials): string {
  if (!materials) return ''
  const lines = [
    materials.fachada    && `facade cladding: ${materials.fachada}`,
    materials.piso       && `floor and paving: ${materials.piso}`,
    materials.esquadrias && `window frames and doors: ${materials.esquadrias}`,
    materials.elementos  && `special architectural elements: ${materials.elementos}`,
    materials.outros     && `additional notes: ${materials.outros}`,
  ].filter(Boolean)
  if (lines.length === 0) return ''
  return (
    `EXACT PROJECT MATERIALS — reproduce these faithfully: ${lines.join('; ')}. `
  )
}

// ── Prefixo de geometry lock ──────────────────────────────────
function buildGeometryPrefix(geometryLock: number): string {
  if (geometryLock <= 25) return ''
  if (geometryLock <= 50)
    return 'Using the reference image as a base, maintaining the same general composition, building proportions and camera framing. '
  if (geometryLock <= 75)
    return 'Transform ONLY the materials, lighting and environment of this exact image. The camera angle, perspective, building geometry, architectural proportions and framing must remain exactly as in the reference image. Do not move the camera, do not change the viewing angle. '
  return 'GEOMETRY LOCKED: This is a material and lighting transformation ONLY. The camera position, viewing angle, perspective, horizon line, building silhouette, architectural geometry and all proportions must be PIXEL-PERFECT identical to the reference image. Do not reframe, do not rotate, do not zoom. Only surface materials, textures, lighting and background vegetation may change. '
}

const ATM: Record<string, string> = {
  Diurno:      'daytime, blue sky with sun and natural shadows',
  Entardecer:  'golden hour sunset, warm tones, long soft shadows',
  Noturno:     'night scene, warm white lighting on vegetation and building facade',
  Nublado:     'predominantly cloudy sky, diffuse light, no harsh shadows',
  Chuva:       'rainy atmosphere, wet surfaces, dark cloudy sky, rain streaks',
}

const BG: Record<string, string> = {
  'Urbano Arborizado':  'modern Brazilian residential houses with large ipê and jacarandá trees, lush tropical vegetation',
  'Bairro Planejado':   'gated community contemporary houses, landscaped gardens, coconut palms',
  'Suburbano c/ Mata':  'suburban houses with Atlantic forest native vegetation, dense greenery',
  Litorâneo:            'coastal beach houses, abundant coconut palms, restinga vegetation, distant sea',
  'Bairro Nobre':       'luxury mansions, centenary figueira trees, elaborate landscaping, wide avenues',
  'Parque Urbano':      'public urban park, large tipuana and oiti trees, lake with aquatic vegetation',
  Montanha:             'mountain houses on slopes, Atlantic forest, araucárias, light mist',
  'Cond. Ecológico':    'ecological condominium, native vegetation, natural lakes, flowering ipê trees',
  'Rural / Sítio':      'rural farmhouses, eucalyptus, cerrado vegetation, open fields',
  'Vila Residencial':   'colorful colonial and modern houses, flowering ornamental trees',
}

const AMB: Record<string, string> = {
  'Sala de Estar':    'living room with sofa, TV rack, large-format porcelain floor, textured walls, natural light through floor-to-ceiling windows',
  'Cozinha Gourmet':  'kitchen with custom cabinetry, granite countertop, gas cooktop, stainless hood and refrigerator, porcelain floor',
  'Suíte Master':     'master bedroom with king-size bed, upholstered headboard, built-in wardrobe in wood veneer, wood laminate floor',
  Banheiro:           'bathroom with frameless glass shower, floating vanity, marble countertop, chrome fixtures, large-format ceramic tiles',
  'Área de Serviço':  'laundry room with washing machine, utility sink, overhead cabinets, anti-slip porcelain floor',
  'Home Office':      'home office with solid wood desk, ergonomic chair, built-in bookshelves, wood laminate floor',
  'Varanda Gourmet':  'gourmet balcony with masonry barbecue, stone countertop, dining table with rattan chairs, composite wood deck',
  'Sala de Jantar':   'dining room with 6-seat wooden table, upholstered chairs, buffet cabinet, pendant chandelier, porcelain floor',
  'Quarto Infantil':  "children's bedroom with bed, white lacquer wardrobe, study desk, floating shelves, laminate floor",
  'Piscina e Lazer':  'outdoor leisure area with masonry pool, mosaic tiles, composite wood deck, sun loungers',
}

const LUZ: Record<string, string> = {
  'Clara e Natural':   'Extremely bright, clean, airy interior with abundant natural daylight. No dark areas. Global illumination, natural light bounce. 5500K.',
  'Entardecer Quente': 'Warm golden afternoon light at low angle, soft long shadows, warm color temperature 3200K.',
  'Noturna Iluminada': 'Nighttime with warm white LED lighting 3000K. Recessed ceiling lights, LED strips, pendant lights. No harsh spots.',
}

const PLT: Record<string, string> = {
  'Top View Realista': "Top view bird's-eye photograph of humanized architectural floor plan. Preserving 100% of original geometry. Realistic materials. Wall tops in solid black. Natural daytime lighting.",
  'Isometria 3D':      'Isometric 3D photorealistic view. Walls cut at 1.20m height. Real doors, windows, complete furniture. Soft shadows, ambient occlusion, PBR materials.',
}

const PERSP: Record<string, string> = {
  'Frontal 1 ponto':  'Generate a 2x2 Architectural Contact Sheet: (1) Reference wider shot, (2) 45° counter-angle, (3) Aerial top-down, (4) Low-angle ground. Ultra-realistic 4K.',
  'Angular 2 pontos': 'Generate a 2x2 Architectural Contact Sheet: (1) Reference wider shot, (2) Flat frontal elevation, (3) Aerial top-down, (4) Low-angle diagonal. Ultra-realistic 4K.',
}

const VEG: Record<string, string> = {
  'Tropical c/ Palmeiras': 'tropical Brazilian garden with imperial palms, coconut palms, emerald grass, decorative stones',
  Frutíferas:              'Brazilian fruit garden with jabuticabeira, mango, lemon, banana trees, tropical flowers',
  'Bromélias e Tropicais': 'tropical garden with bromeliads, heliconias, peace lilies, monstera, philodendrons',
  'Jardim Vertical':       'vertical garden with bougainvillea, yellow alamanda, jasmine, hanging ferns',
  Ornamental:              'ornamental garden with pleomele, dracena, agave, yucca, black ornamental grass, volcanic rocks',
  'Flores Brasileiras':    'flowering garden with ixoras, roses, azaleas, hibiscus, colorful bougainvillea',
  Nativas:                 'garden with yellow ipê, jacarandá, sibipiruna, quaresmeira, native plants',
  'Suculentas e Cactos':   'succulent garden with mandacaru, ball cactus, echeveria, sedum, decorative stones',
  'Forrações e Gramas':    'mixed grasses (esmeralda, são carlos), black ornamental grass, irregular stepping stones',
}

const PRANCHA_PREMIUM =
  'Ultra-detailed premium architectural presentation board. Swiss grid layout. (1) Hero cinematic render — realistic materials, global illumination, ambient occlusion, depth of field; (2) Humanized site plan; (3) Longitudinal section with human silhouettes; (4) Facade elevation; (5) Exploded axonometric; (6) Bubble diagram. Text in Portuguese. Off-white background, muted earth palette. --ar 9:16 --style raw --v 6'

export function buildPrompt(options: GenerateOptions): string {
  const { mode, condition, background, ambient, lighting, plantType,
          perspective, vegetation, lightCondition, geometryLock, materials } = options

  const geoPrefix  = buildGeometryPrefix(geometryLock)
  const matBlock   = buildMaterialsBlock(materials)

  switch (mode) {
    case 'externo': {
      const atmText = ATM[condition ?? 'Diurno'] ?? ATM['Diurno']
      const bgText  = BG[background ?? 'Urbano Arborizado'] ?? BG['Urbano Arborizado']
      return (
        geoPrefix + matBlock +
        `Make this image as a real photograph with all real materials, ultra-realistic 4K, ` +
        `captured by an architectural photographer. ` +
        `${atmText}. On the horizon, tropical landscaping with ${bgText}. ` +
        `Preserve all architectural elements, signage and proportions exactly as shown.` +
        PHOTO_SUFFIX
      )
    }
    case 'interno': {
      const luzText = LUZ[lighting ?? 'Clara e Natural'] ?? LUZ['Clara e Natural']
      const ambText = AMB[ambient ?? 'Sala de Estar'] ?? AMB['Sala de Estar']
      return (
        geoPrefix + matBlock +
        `Transform this 3D preview into an ultra-realistic professional interior photograph in 4K. ` +
        `${luzText} ${ambText}. ` +
        `Faithfully reproduce ALL original materials. PRESERVE exactly all proportions, geometry and layout.` +
        PHOTO_SUFFIX
      )
    }
    case 'planta':
      return geoPrefix + matBlock + (PLT[plantType ?? 'Top View Realista'] ?? PLT['Top View Realista']) + PHOTO_SUFFIX
    case 'multi':
      return geoPrefix + (PERSP[perspective ?? 'Frontal 1 ponto'] ?? PERSP['Frontal 1 ponto']) + PHOTO_SUFFIX
    case 'paisagem': {
      const vegText = VEG[vegetation ?? 'Tropical c/ Palmeiras'] ?? VEG['Tropical c/ Palmeiras']
      const luzCond = lightCondition ?? 'Diurno'
      return (
        geoPrefix + matBlock +
        `Professional landscape photography in ${luzCond === 'Nublado' ? 'cloudy diffuse' : 'natural daylight'} light. ` +
        `${vegText}. Add Brazilian residential houses on the horizon. Do not alter the architecture.` +
        PHOTO_SUFFIX
      )
    }
    case 'prancha':
      return geoPrefix + matBlock + PRANCHA_PREMIUM + PHOTO_SUFFIX
    default:
      return geoPrefix + matBlock + `Make this image photorealistic architectural photography.` + PHOTO_SUFFIX
  }
}

export const MODE_LABELS: Record<Mode, string> = {
  externo:  'Fotorrealismo Externo',
  interno:  'Ambientes Internos',
  planta:   'Planta Humanizada',
  multi:    'Multiperspectiva',
  paisagem: 'Paisagismo',
  prancha:  'Prancha de Conceito',
}

export const ATM_OPTIONS   = Object.keys(ATM)
export const BG_OPTIONS    = Object.keys(BG)
export const AMB_OPTIONS   = Object.keys(AMB)
export const LUZ_OPTIONS   = Object.keys(LUZ)
export const PLT_OPTIONS   = Object.keys(PLT)
export const PERSP_OPTIONS = Object.keys(PERSP)
export const VEG_OPTIONS   = Object.keys(VEG)
EOF
ok "lib/prompts.ts atualizado"

# ── 3. route.ts — passa materials para buildPrompt ───────────
info "Atualizando app/api/generate/route.ts..."
cat > app/api/generate/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPrompt, GenerateOptions, Mode, ProjectMaterials } from '@/lib/prompts'

const FAL_MODELS: Record<string, string> = {
  'nano-banana-pro': 'fal-ai/nano-banana-pro/edit',
  'nano-banana':     'fal-ai/nano-banana/edit',
  'flux-dev':        'fal-ai/flux/dev/image-to-image',
  'flux-krea':       'fal-ai/flux/krea/image-to-image',
  'canny':           'fal-ai/flux-control-lora-canny/image-to-image',
  'depth':           'fal-ai/flux-control-lora-depth/image-to-image',
  'flux-general':    'fal-ai/flux-general/image-to-image',
}

const NANO_BANANA_MODELS = new Set([
  'fal-ai/nano-banana-pro/edit',
  'fal-ai/nano-banana/edit',
])

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      imageBase64, mode = 'externo', condition, background,
      ambient, lighting, plantType, perspective,
      vegetation, lightCondition, geometryLock = 30,
      model = 'nano-banana-pro', materials,
    } = body

    if (!imageBase64) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const prompt = buildPrompt({
      mode: mode as Mode, condition, background, ambient, lighting,
      plantType, perspective, vegetation, lightCondition,
      geometryLock: Number(geometryLock),
      materials: materials as ProjectMaterials | undefined,
    } as GenerateOptions)

    const blob = base64ToBlob(imageBase64)
    const falImageUrl = await fal.storage.upload(blob)
    const falModel = FAL_MODELS[model] ?? FAL_MODELS['nano-banana-pro']
    const isNanoBanana = NANO_BANANA_MODELS.has(falModel)

    console.log('[generate] mode:', mode, '| model:', falModel)
    console.log('[generate] prompt:', prompt.substring(0, 150) + '...')

    let result: { data: { images?: Array<{ url: string }>; image?: { url: string } } }

    if (isNanoBanana) {
      result = await fal.subscribe(falModel, {
        input: {
          prompt,
          image_urls: [falImageUrl],
          num_images: 1,
          aspect_ratio: 'auto',
          output_format: 'jpeg',
          resolution: '1K',
        },
      }) as typeof result
    } else {
      const strength = Math.max(0.05, Math.min(0.95, 1 - Number(geometryLock) / 100))
      result = await fal.subscribe(falModel, {
        input: {
          image_url: falImageUrl,
          prompt, strength,
          num_inference_steps: 40,
          guidance_scale: 3.5,
          seed: Math.floor(Math.random() * 999_999),
        },
      }) as typeof result
    }

    const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url
    if (!outputUrl) {
      return NextResponse.json({ error: 'Fal.ai não retornou imagem' }, { status: 500 })
    }

    const admin = createAdminClient()

    const { error: creditError } = await admin.rpc('consume_credit', { user_id_input: user.id })
    if (creditError) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    const { data: render } = await admin.from('renders').insert({
      user_id: user.id, input_url: falImageUrl, output_url: outputUrl,
      prompt, mode, model: falModel,
      geometry_lock: Number(geometryLock),
      strength: isNanoBanana ? null : Math.max(0.05, Math.min(0.95, 1 - Number(geometryLock) / 100)),
    }).select('id').single()

    const { data: profile } = await admin
      .from('profiles').select('credits').eq('id', user.id).single()

    return NextResponse.json({
      success: true, outputUrl,
      renderId: render?.id ?? null,
      credits: profile?.credits ?? 0,
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[generate] Erro:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
EOF
ok "route.ts atualizado"

# ── 4. GenerateClient.tsx — seção colapsável de materiais ─────
info "Atualizando app/app/generate/GenerateClient.tsx..."
cat > app/app/generate/GenerateClient.tsx << 'EOF'
'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Mode, MODE_LABELS, ProjectMaterials,
  ATM_OPTIONS, BG_OPTIONS, AMB_OPTIONS, LUZ_OPTIONS,
  PLT_OPTIONS, PERSP_OPTIONS, VEG_OPTIONS,
} from '@/lib/prompts'

interface GenerateClientProps {
  initialCredits: number
  userName: string
  initialMaterials?: ProjectMaterials
}

interface GenerateResult {
  outputUrl: string
  renderId: string | null
  credits: number
  error?: string
}

const LOADING_TEXTS = [
  'analisando geometria...',
  'aplicando materiais reais...',
  'ajustando iluminação...',
  'renderizando fotorrealismo...',
  'finalizando detalhes...',
]

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'externo',  label: 'Fotorrealismo Externo', icon: '☀' },
  { id: 'interno',  label: 'Ambientes Internos',    icon: '⬛' },
  { id: 'planta',   label: 'Planta Humanizada',     icon: '⊞' },
  { id: 'multi',    label: 'Multiperspectiva',      icon: '⊟' },
  { id: 'paisagem', label: 'Paisagismo',            icon: '✿' },
  { id: 'prancha',  label: 'Prancha de Conceito',   icon: '▦' },
]

const FAL_MODELS = [
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', tag: 'PADRÃO',       wide: false },
  { id: 'nano-banana',     name: 'Nano Banana',     tag: 'RÁPIDO',       wide: false },
  { id: 'flux-dev',        name: 'Flux Dev',        tag: 'FLUX',         wide: false },
  { id: 'flux-krea',       name: 'Flux Krea',       tag: 'CRIATIVO',     wide: false },
  { id: 'flux-general',    name: 'Flux General',    tag: 'EXPERIMENTAL', wide: true  },
]

const EMPTY_MATERIALS: ProjectMaterials = {
  fachada: '', piso: '', esquadrias: '', elementos: '', outros: '',
}

export function GenerateClient({ initialCredits, initialMaterials }: GenerateClientProps) {
  const supabase = createClient()

  // ── Estado global
  const [credits, setCredits]         = useState(initialCredits)
  const [loading, setLoading]         = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [error, setError]             = useState<string | null>(null)

  // ── Modo e opções
  const [mode, setMode]                       = useState<Mode>('externo')
  const [condition, setCondition]             = useState('Diurno')
  const [background, setBackground]           = useState('Urbano Arborizado')
  const [ambient, setAmbient]                 = useState('Sala de Estar')
  const [lighting, setLighting]               = useState('Clara e Natural')
  const [plantType, setPlantType]             = useState('Top View Realista')
  const [perspective, setPerspective]         = useState('Frontal 1 ponto')
  const [vegetation, setVegetation]           = useState('Tropical c/ Palmeiras')
  const [lightCondition, setLightCondition]   = useState('Diurno')
  const [geometryLock, setGeometryLock]       = useState(85)
  const [selectedModel, setSelectedModel]     = useState('nano-banana-pro')

  // ── Materiais do projeto
  const [materiaisAberto, setMateriaisAberto] = useState(false)
  const [materials, setMaterials]             = useState<ProjectMaterials>(initialMaterials ?? EMPTY_MATERIALS)
  const [salvando, setSalvando]               = useState(false)
  const [salvoOk, setSalvoOk]                 = useState(false)
  const saveTimerRef                          = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Imagem e resultado
  const [imagePreview, setImagePreview]         = useState<string | null>(null)
  const [outputUrl, setOutputUrl]               = useState<string | null>(null)
  const [sliderPos, setSliderPos]               = useState(50)
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const [isDraggingFile, setIsDraggingFile]     = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const compareRef      = useRef<HTMLDivElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Loading texts
  const startLoadingTexts = () => {
    let i = 0; setLoadingText(LOADING_TEXTS[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length; setLoadingText(LOADING_TEXTS[i])
    }, 1800)
  }
  const stopLoadingTexts = () => {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }
  useEffect(() => () => stopLoadingTexts(), [])

  // ── Auto-save materiais com debounce 1.5s
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
          await supabase.from('profiles')
            .update({ project_materials: updated })
            .eq('id', user.id)
          setSalvoOk(true)
          setTimeout(() => setSalvoOk(false), 2000)
        }
      } catch (e) { console.error('Erro ao salvar materiais:', e) }
      finally { setSalvando(false) }
    }, 1500)
  }

  // ── Upload
  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setOutputUrl(null); setError(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]; if (file) loadImage(file)
  }, [loadImage])

  // ── Geração
  const handleGenerate = async () => {
    if (!imagePreview) { setError('Faça upload de uma imagem primeiro.'); return }
    if (credits <= 0)  { setError('Créditos insuficientes.'); return }
    setError(null); setLoading(true); startLoadingTexts()
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview, mode, condition, background,
          ambient, lighting, plantType, perspective, vegetation,
          lightCondition, geometryLock, model: selectedModel,
          materials: Object.values(materials).some(v => v) ? materials : undefined,
        }),
      })
      const data: GenerateResult = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na geração')
      setOutputUrl(data.outputUrl); setCredits(data.credits); setSliderPos(50)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally { setLoading(false); stopLoadingTexts() }
  }

  // ── Slider BeforeAfter
  const handleCompareMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSlider || !compareRef.current) return
    const rect = compareRef.current.getBoundingClientRect()
    setSliderPos(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)))
  }, [isDraggingSlider])

  useEffect(() => {
    window.addEventListener('mousemove', handleCompareMove)
    window.addEventListener('mouseup', () => setIsDraggingSlider(false))
    return () => { window.removeEventListener('mousemove', handleCompareMove) }
  }, [handleCompareMove])

  const getPromptLabel = () => {
    switch (mode) {
      case 'externo':  return `${MODE_LABELS[mode]} · ${condition} · ${background}`
      case 'interno':  return `${MODE_LABELS[mode]} · ${ambient} · ${lighting}`
      case 'planta':   return `${MODE_LABELS[mode]} · ${plantType}`
      case 'multi':    return `${MODE_LABELS[mode]} · ${perspective}`
      case 'paisagem': return `${MODE_LABELS[mode]} · ${vegetation} · ${lightCondition}`
      case 'prancha':  return `${MODE_LABELS[mode]} · Premium`
      default:         return MODE_LABELS[mode]
    }
  }

  const hasMaterials = Object.values(materials).some(v => v && v.trim())

  return (
    <div style={S.main}>
      {/* ── CONTROLES ── */}
      <div style={S.controls}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>GERAR</span>
          <div style={S.credits}><span style={S.creditDot}/><span style={S.creditNum}>{credits}</span><span>créditos</span></div>
        </div>

        {/* Modos */}
        <div style={S.section}>
          <div style={S.label}>MODO DE OUTPUT</div>
          <div style={S.modesGrid}>
            {MODES.map(m => (
              <div key={m.id}
                style={mode === m.id ? {...S.modeCard, ...S.modeCardActive} : S.modeCard}
                onClick={() => setMode(m.id)}>
                <div style={{...S.modeIcon, ...(mode === m.id ? {color:'#fafafa'} : {})}}>{m.icon}</div>
                <div style={{...S.modeLabel, ...(mode === m.id ? {color:'#fafafa'} : {})}}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.divider}/>

        {/* Opções dinâmicas */}
        {mode === 'externo' && <>
          <div style={S.section}><div style={S.label}>CONDIÇÃO ATMOSFÉRICA</div><PillGroup options={ATM_OPTIONS} selected={condition} onChange={setCondition}/></div>
          <div style={S.section}><div style={S.label}>BACKGROUND / PAISAGEM</div><PillGroup options={BG_OPTIONS} selected={background} onChange={setBackground}/></div>
        </>}
        {mode === 'interno' && <>
          <div style={S.section}><div style={S.label}>AMBIENTE</div><PillGroup options={AMB_OPTIONS} selected={ambient} onChange={setAmbient}/></div>
          <div style={S.section}><div style={S.label}>ILUMINAÇÃO</div><PillGroup options={LUZ_OPTIONS} selected={lighting} onChange={setLighting}/></div>
        </>}
        {mode === 'planta'   && <div style={S.section}><div style={S.label}>TIPO DE PLANTA</div><PillGroup options={PLT_OPTIONS} selected={plantType} onChange={setPlantType}/></div>}
        {mode === 'multi'    && <div style={S.section}><div style={S.label}>PERSPECTIVA DO INPUT</div><PillGroup options={PERSP_OPTIONS} selected={perspective} onChange={setPerspective}/><p style={S.infoNote}>Gera 4 ângulos: referência, contra-ângulo, aéreo e perspectiva baixa.</p></div>}
        {mode === 'paisagem' && <>
          <div style={S.section}><div style={S.label}>TIPO DE VEGETAÇÃO</div><PillGroup options={VEG_OPTIONS} selected={vegetation} onChange={setVegetation}/></div>
          <div style={S.section}><div style={S.label}>CONDIÇÃO DE LUZ</div><PillGroup options={['Diurno','Nublado']} selected={lightCondition} onChange={setLightCondition}/></div>
        </>}
        {mode === 'prancha' && <div style={S.section}><div style={S.label}>TIPO DE PRANCHA</div><PillGroup options={['Prancha Premium']} selected="Prancha Premium" onChange={() => {}}/><p style={S.infoNote}>Hero render + implantação + corte + fachada + axonometria + diagramas.</p></div>}

        <div style={S.divider}/>

        {/* ── MATERIAIS DO PROJETO (colapsável) ── */}
        <div style={S.section}>
          <button style={S.collapseBtn} onClick={() => setMateriaisAberto(!materiaisAberto)}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={S.label}>MATERIAIS DO PROJETO</span>
              {hasMaterials && <span style={S.materiaisBadge}>preenchido</span>}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              {salvando && <span style={{fontSize:9, color:'#86868b'}}>salvando...</span>}
              {salvoOk  && <span style={{fontSize:9, color:'#30b46c'}}>salvo ✓</span>}
              <span style={{fontSize:14, color:'#86868b', transform: materiaisAberto ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform 0.2s'}}>▾</span>
            </div>
          </button>

          {materiaisAberto && (
            <div style={S.materiaisGrid}>
              {[
                { field: 'fachada'    as const, label: 'Revestimento de fachada', placeholder: 'ex: placas cimentícias texturizadas, ACM preto' },
                { field: 'piso'       as const, label: 'Piso externo / calçada',  placeholder: 'ex: porcelanato 90×90 cinza claro' },
                { field: 'esquadrias' as const, label: 'Esquadrias / caixilhos',  placeholder: 'ex: alumínio preto fosco' },
                { field: 'elementos'  as const, label: 'Elementos especiais',     placeholder: 'ex: painel de madeira ipê, brise metálico' },
                { field: 'outros'     as const, label: 'Observações adicionais',  placeholder: 'ex: estrutura em concreto aparente, laje invertida' },
              ].map(({ field, label, placeholder }) => (
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
              <p style={S.infoNote}>Salvo automaticamente. Usado em todas as gerações para manter fidelidade aos materiais do projeto.</p>
            </div>
          )}
        </div>

        <div style={S.divider}/>

        {/* Geometry Lock */}
        <div style={S.section}>
          <div style={S.label}>GEOMETRY LOCK</div>
          <div style={S.sliderRow}>
            <span style={S.sliderEnd}>Livre</span>
            <input type="range" min={0} max={100} value={geometryLock} onChange={e => setGeometryLock(Number(e.target.value))} style={S.range}/>
            <span style={S.sliderEnd}>Fiel</span>
            <span style={S.sliderVal}>{geometryLock}%</span>
          </div>
          <p style={S.infoNote}>{geometryLock >= 76 ? 'Apenas materiais e luz mudam' : geometryLock >= 51 ? 'Câmera e proporções travadas' : geometryLock >= 26 ? 'Composição geral mantida' : 'Liberdade criativa'}</p>
        </div>

        {/* Motor */}
        <div style={S.section}>
          <div style={S.label}>MOTOR DE IA</div>
          <div style={S.motorGrid}>
            {FAL_MODELS.map(m => (
              <div key={m.id}
                style={{...S.motorOpt, ...(m.wide ? S.motorWide : {}), ...(selectedModel === m.id ? S.motorOptActive : {})}}
                onClick={() => setSelectedModel(m.id)}>
                <div style={{...S.motorName, ...(selectedModel === m.id ? {color:'#fafafa'} : {})}}>{m.name}</div>
                <span style={{...S.motorTag, ...(selectedModel === m.id ? {background:'rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.6)'} : {})}}>{m.tag}</span>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={S.errorBox}>{error}</div>}

        <button style={loading ? {...S.genBtn, opacity:0.7, cursor:'not-allowed'} : S.genBtn} onClick={handleGenerate} disabled={loading}>
          <span>{loading ? loadingText : 'gerar render'}</span>
          <span style={S.genBtnMeta}>
            <span>~6s · 1 crédito</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fafafa" strokeWidth="1.5"><path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </button>
      </div>

      {/* ── PREVIEW ── */}
      <div style={S.preview}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>ANTES / DEPOIS</span>
          {outputUrl && <a href={outputUrl} download="spacenode-render.jpg" target="_blank" rel="noopener noreferrer" style={S.downloadLink}>baixar render ↓</a>}
        </div>

        {!imagePreview && (
          <div style={isDraggingFile ? {...S.uploadZone, borderColor:'#1a1a1a', background:'#f5f5f5'} : S.uploadZone}
            onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}>
            <div style={S.uploadIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.3">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={S.uploadTitle}>arraste sua imagem aqui</div>
              <div style={S.uploadSub}>SketchUp · Render · 3D · JPG · PNG</div>
            </div>
            <button style={S.uploadBtn} onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>escolher arquivo</button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => { const f = e.target.files?.[0]; if (f) loadImage(f) }}/>
          </div>
        )}

        {imagePreview && outputUrl && (
          <div ref={compareRef} style={S.compareWrap} onMouseDown={() => setIsDraggingSlider(true)}>
            <img src={imagePreview} alt="Antes" style={S.compareImg} draggable={false}/>
            <div style={{...S.compareAfterWrap, clipPath:`inset(0 ${100-sliderPos}% 0 0)`}}>
              <img src={outputUrl} alt="Depois" style={S.compareImg} draggable={false}/>
            </div>
            <div style={{...S.compareHandle, left:`${sliderPos}%`}}>
              <div style={S.compareHandleCircle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><path d="M8 5l-5 7 5 7M16 5l5 7-5 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            <span style={{...S.compareLabel, left:14}}>ANTES</span>
            <span style={{...S.compareLabel, right:14}}>DEPOIS</span>
          </div>
        )}

        {imagePreview && !outputUrl && !loading && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={S.compareImg}/>
            <span style={{...S.compareLabel, left:14}}>ANTES</span>
            <button style={S.changeImageBtn} onClick={() => { setImagePreview(null); setOutputUrl(null) }}>trocar imagem</button>
          </div>
        )}

        {loading && imagePreview && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={{...S.compareImg, opacity:0.4}}/>
            <div style={S.loadingOverlay}>
              <div style={S.spinner}/>
              <span style={{fontSize:12, color:'#fafafa', letterSpacing:'0.05em'}}>{loadingText}</span>
            </div>
          </div>
        )}

        <div style={S.promptPreview}>
          <div style={S.promptLabel}>PROMPT GERADO</div>
          <div style={S.promptText}>
            <strong style={{color:'#1a1a1a', fontWeight:500}}>{getPromptLabel()}</strong>
            {hasMaterials && <span style={{color:'#30b46c', fontSize:10, marginLeft:6}}>+ materiais do projeto</span>}
            <br/>
            <span style={{color:'#86868b'}}>geometry: {geometryLock}% · {FAL_MODELS.find(m => m.id === selectedModel)?.name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PillGroup({ options, selected, onChange }: { options: string[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map(opt => (
        <button key={opt} style={selected === opt ? {...pill, ...pillActive} : pill} onClick={() => onChange(opt)}>{opt}</button>
      ))}
    </div>
  )
}

const pill: React.CSSProperties = { padding:'5px 12px', borderRadius:20, border:'0.5px solid rgba(0,0,0,0.1)', fontSize:11, color:'#86868b', cursor:'pointer', background:'#fafafa', letterSpacing:'-0.005em', fontFamily:'inherit' }
const pillActive: React.CSSProperties = { background:'#1a1a1a', color:'#fafafa', borderColor:'#1a1a1a' }

const S: Record<string, React.CSSProperties> = {
  main:              { display:'grid', gridTemplateColumns:'390px 1fr', minHeight:'100%', overflow:'hidden' },
  controls:          { padding:'28px 24px', borderRight:'0.5px solid rgba(0,0,0,0.06)', background:'#ffffff', overflowY:'auto', display:'flex', flexDirection:'column', gap:20 },
  preview:           { padding:28, background:'#fafafa', display:'flex', flexDirection:'column', gap:18 },
  topbar:            { display:'flex', justifyContent:'space-between', alignItems:'center' },
  pageTitle:         { fontSize:10, letterSpacing:'0.22em', textTransform:'uppercase', color:'#86868b', fontWeight:500 },
  credits:           { display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#86868b' },
  creditDot:         { width:5, height:5, borderRadius:'50%', background:'#30b46c', boxShadow:'0 0 5px rgba(48,180,108,0.4)', display:'inline-block' },
  creditNum:         { color:'#1a1a1a', fontWeight:500, fontSize:12 },
  section:           { display:'flex', flexDirection:'column', gap:10 },
  label:             { fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'#86868b', fontWeight:500 },
  divider:           { height:'0.5px', background:'rgba(0,0,0,0.06)' },
  modesGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 },
  modeCard:          { border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'12px 10px', cursor:'pointer', textAlign:'center', background:'#fafafa' },
  modeCardActive:    { borderColor:'#1a1a1a', background:'#1a1a1a' },
  modeIcon:          { fontSize:16, marginBottom:4, color:'#86868b' },
  modeLabel:         { fontSize:10, fontWeight:500, color:'#1a1a1a', lineHeight:1.3 },
  infoNote:          { fontSize:11, color:'#86868b', lineHeight:1.6 },
  collapseBtn:       { display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:0, width:'100%', fontFamily:'inherit' },
  materiaisBadge:    { fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'rgba(48,180,108,0.1)', color:'#30b46c', padding:'2px 7px', borderRadius:10 },
  materiaisGrid:     { display:'flex', flexDirection:'column', gap:10, paddingTop:4 },
  materialField:     { display:'flex', flexDirection:'column', gap:5 },
  materialLabel:     { fontSize:10, color:'#86868b', letterSpacing:'0.05em' },
  materialInput:     { padding:'8px 12px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:8, fontSize:11, color:'#1a1a1a', background:'#fafafa', fontFamily:'inherit', outline:'none' },
  sliderRow:         { display:'flex', alignItems:'center', gap:10 },
  sliderEnd:         { fontSize:11, color:'#86868b' },
  range:             { flex:1, accentColor:'#1a1a1a', height:3 },
  sliderVal:         { fontSize:12, fontWeight:500, color:'#1a1a1a', minWidth:34, textAlign:'right' },
  motorGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  motorOpt:          { border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:8, padding:'8px 10px', cursor:'pointer', background:'#fafafa' },
  motorOptActive:    { borderColor:'#1a1a1a', background:'#1a1a1a' },
  motorWide:         { gridColumn:'span 2' },
  motorName:         { fontSize:11, fontWeight:500, color:'#1a1a1a', marginBottom:3 },
  motorTag:          { display:'inline-block', fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'rgba(0,0,0,0.05)', color:'#86868b', padding:'2px 6px', borderRadius:4 },
  errorBox:          { fontSize:12, color:'#c0392b', background:'#fff5f5', border:'0.5px solid rgba(192,57,43,0.2)', borderRadius:8, padding:'10px 14px' },
  genBtn:            { width:'100%', padding:'13px 16px', background:'#1a1a1a', color:'#fafafa', border:'none', borderRadius:10, fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit' },
  genBtnMeta:        { display:'flex', alignItems:'center', gap:8, fontSize:11, color:'#86868b' },
  uploadZone:        { border:'0.5px dashed rgba(0,0,0,0.2)', borderRadius:12, padding:'48px 20px', textAlign:'center', cursor:'pointer', background:'#ffffff', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, minHeight:300 },
  uploadIcon:        { width:44, height:44, borderRadius:10, background:'rgba(0,0,0,0.04)', display:'flex', alignItems:'center', justifyContent:'center' },
  uploadTitle:       { fontSize:15, fontWeight:500, color:'#1a1a1a', letterSpacing:'-0.02em' },
  uploadSub:         { fontSize:12, color:'#86868b', marginTop:4 },
  uploadBtn:         { padding:'7px 18px', border:'0.5px solid rgba(0,0,0,0.15)', borderRadius:20, fontSize:11, color:'#1a1a1a', background:'#fafafa', cursor:'pointer', fontFamily:'inherit' },
  compareWrap:       { position:'relative', borderRadius:12, overflow:'hidden', flex:1, minHeight:300, background:'#e8e8e8', userSelect:'none', cursor:'ew-resize' },
  compareImg:        { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', pointerEvents:'none' },
  compareAfterWrap:  { position:'absolute', inset:0 },
  compareHandle:     { position:'absolute', top:0, bottom:0, width:2, background:'#ffffff', transform:'translateX(-50%)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  compareHandleCircle: { width:32, height:32, borderRadius:'50%', background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
  compareLabel:      { position:'absolute', bottom:12, fontSize:9, letterSpacing:'0.12em', color:'#fafafa', textTransform:'uppercase', fontWeight:500, textShadow:'0 1px 3px rgba(0,0,0,0.5)', pointerEvents:'none' },
  changeImageBtn:    { position:'absolute', top:12, right:14, padding:'5px 12px', border:'0.5px solid rgba(255,255,255,0.4)', borderRadius:20, fontSize:10, color:'#fafafa', background:'rgba(0,0,0,0.35)', cursor:'pointer', fontFamily:'inherit' },
  loadingOverlay:    { position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 },
  spinner:           { width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#ffffff', animation:'spin 0.8s linear infinite' },
  promptPreview:     { background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.06)', borderRadius:10, padding:'14px 16px' },
  promptLabel:       { fontSize:9, letterSpacing:'0.15em', textTransform:'uppercase', color:'#86868b', fontWeight:500, marginBottom:8 },
  promptText:        { fontSize:11, color:'#86868b', lineHeight:1.65 },
  downloadLink:      { fontSize:11, color:'#86868b', textDecoration:'none' },
}

export default GenerateClient
EOF
ok "GenerateClient.tsx atualizado com seção de materiais"

# ── 5. Atualizar page.tsx para passar initialMaterials ───────
info "Verificando page.tsx..."
PAGE_FILE="app/app/generate/page.tsx"
if [ -f "$PAGE_FILE" ]; then
  # Verifica se já tem project_materials no select
  if ! grep -q "project_materials" "$PAGE_FILE"; then
    sed -i "s/.select('credits')/.select('credits, project_materials')/" "$PAGE_FILE" 2>/dev/null || true
    sed -i "s/initialCredits={profile?.credits ?? 0}/initialCredits={profile?.credits ?? 0} initialMaterials={profile?.project_materials ?? {}}/" "$PAGE_FILE" 2>/dev/null || true
    ok "page.tsx atualizado para passar materials"
  else
    ok "page.tsx já tem project_materials"
  fi
else
  echo ""
  echo -e "${YELLOW}  ⚠ page.tsx não encontrado em $PAGE_FILE${RESET}"
  echo "  Adicione manualmente em page.tsx:"
  echo "    .select('credits, project_materials')"
  echo "    initialMaterials={profile?.project_materials ?? {}}"
fi

echo ""
echo "  ─────────────────────────────────────────────────"
echo -e "  ${YELLOW}AÇÃO NECESSÁRIA — SQL no Supabase Dashboard:${RESET}"
echo "  ─────────────────────────────────────────────────"
cat migration-materials.sql
echo "  ─────────────────────────────────────────────────"
echo ""
echo "  Passos:"
echo "    1. Execute o SQL acima no Supabase Dashboard"
echo "    2. npm run dev"
echo "    3. Abra MATERIAIS DO PROJETO na UI e preencha"
echo "    4. Gere um render — os materiais serão injetados"
echo ""
