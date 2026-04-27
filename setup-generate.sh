#!/usr/bin/env bash
# =============================================================
# SpaceNode — Setup Automatizado do Motor de Geração
# Execute via Claude Code ou Git Bash na raiz do projeto:
#   bash setup-generate.sh
# =============================================================

set -e  # Para no primeiro erro

# ── Cores para output legível ────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓${RESET} $1"; }
info() { echo -e "${YELLOW}→${RESET} $1"; }
err()  { echo -e "${RED}✗${RESET} $1"; exit 1; }

echo ""
echo "  SpaceNode — Motor de Geração v2"
echo "  ================================"
echo ""

# ── 1. Validar que estamos na raiz do projeto ────────────────
if [ ! -f "package.json" ]; then
  err "Execute este script na raiz do projeto (onde está o package.json)"
fi
if ! grep -q "spacenode\|next" package.json 2>/dev/null; then
  info "Aviso: package.json não parece ser o projeto SpaceNode. Continuando..."
fi
ok "Diretório do projeto validado"

# ── 2. Criar estrutura de pastas necessária ──────────────────
mkdir -p lib
mkdir -p app/api/generate
mkdir -p app/app/generate
ok "Estrutura de pastas verificada"

# ── 3. lib/prompts.ts ────────────────────────────────────────
info "Criando lib/prompts.ts..."
cat > lib/prompts.ts << 'PROMPTS_EOF'
// lib/prompts.ts
// SpaceNode — Biblioteca de Prompts Arquitetônicos
// 6 modos com materiais e condições extraídos do Document_1.pdf

export type Mode =
  | 'externo'
  | 'interno'
  | 'planta'
  | 'multi'
  | 'paisagem'
  | 'prancha'

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
}

const PHOTO_SUFFIX =
  ', captured with professional architectural camera, Canon R5, 24mm tilt-shift lens, f/4, ISO 100, Hasselblad aesthetic, hyperrealistic, 8K RAW photo, photorealistic architectural photography, not a render, not CGI, real life photo'

const ATM: Record<string, string> = {
  Diurno: 'daytime, blue sky with sun and natural shadows',
  Entardecer: 'golden hour sunset, warm tones, long soft shadows',
  Noturno: 'night scene, warm white lighting on vegetation and building facade, warm LED illumination on landscape',
  Nublado: 'predominantly cloudy sky, diffuse light, no harsh shadows',
  Chuva: 'rainy atmosphere, wet surfaces, dark cloudy sky, rain streaks, reflections on ground',
}

const BG: Record<string, string> = {
  'Urbano Arborizado': 'modern Brazilian residential houses with large ipê and jacarandá trees, lush tropical vegetation, tree-lined streets',
  'Bairro Planejado': 'gated community contemporary houses, landscaped gardens, coconut palms, tropical vegetation, fruit trees',
  'Suburbano c/ Mata': 'suburban houses with Atlantic forest native vegetation, pau-brasil, sibipiruna, dense greenery, morros suaves',
  Litorâneo: 'coastal beach houses, abundant coconut palms, restinga vegetation, amendoeiras, cajueiros, distant sea',
  'Bairro Nobre': 'luxury mansions, centenary figueira and jequitibá trees, elaborate professional landscaping, palmeiras reais, wide tree-lined avenues',
  'Parque Urbano': 'public urban park, large tipuana and oiti trees, dense grove, lake with aquatic vegetation, ciclovia arborizada',
  Montanha: 'mountain houses on slopes, Atlantic forest, araucárias, pinheiros do paraná, light mist between hills',
  'Cond. Ecológico': 'ecological condominium, native vegetation preserved, natural lakes, flowering ipê trees in multiple colors, bromélias',
  'Rural / Sítio': 'rural farmhouses, eucalyptus, cerrado vegetation, pinheiros, open fields, araucárias ao longe',
  'Vila Residencial': 'colorful colonial and modern houses, flowering resedá and quaresmeira trees, tropical garden fronts, cercas vivas',
}

const AMB: Record<string, string> = {
  'Sala de Estar': 'living room with sofa, TV rack unit, large-format porcelain tile floor, textured or smooth-painted walls, natural light through floor-to-ceiling windows with residential landscape view, decorative rugs, indoor plants',
  'Cozinha Gourmet': 'kitchen with custom Fenix or lacquered cabinetry, granite or quartz countertop with veining, 5-burner gas cooktop, professional stainless steel hood, french-door refrigerator, large-format porcelain tile floor, pendant lighting',
  'Suíte Master': 'master bedroom with king-size bed with upholstered headboard, matching nightstands with table lamps, full built-in wardrobe in wood veneer, wide-plank wood laminate or marble-look porcelain floor, blackout curtains with sheer',
  Banheiro: 'bathroom with frameless glass shower box, vessel or undermount basin on floating vanity, Calacatta marble or granite countertop, matte black or chrome fixtures, large-format ceramic wall tiles, LED strip under vanity',
  'Área de Serviço': 'laundry room with front-load washing machine and dryer, stainless steel utility sink, overhead white cabinets, retractable clothesline, anti-slip porcelain floor in cement look, window with natural light',
  'Home Office': 'home office with solid wood work desk, ergonomic chair in mesh, built-in bookshelves, floating shelves with books and plants, natural wood laminate or concrete-look porcelain floor, soft directional lighting',
  'Varanda Gourmet': 'gourmet covered balcony with masonry barbecue in stainless steel finish, stone or porcelain countertop, stainless sink, upper and lower cabinets, 6-seat wooden dining table with rattan chairs, composite wood deck or large-format porcelain, pendant lighting',
  'Sala de Jantar': 'dining room with 6-seat solid wood table, upholstered dining chairs in linen or velvet, buffet cabinet in wood veneer, decorative pendant chandelier, large-format porcelain floor, accent wall in wood cladding or textured paint',
  'Quarto Infantil': "children's bedroom with single or bunk bed, built-in wardrobe in white lacquer, study desk with ergonomic chair, wall niches, floating shelves with books and toys, wide-plank laminate floor, colorful wall accent",
  'Piscina e Lazer': 'outdoor leisure area with masonry rectangular pool finished with small mosaic tiles in blue or gray, wide composite wood or large-format porcelain deck, sun loungers with cushions, parasol, landscape planting around pool edges',
}

const LUZ: Record<string, string> = {
  'Clara e Natural': 'Extremely bright, clean, airy interior lighting with abundant natural daylight. Luminous atmosphere on all surfaces, no dark areas, soft diffuse shadows. Physically accurate global illumination with natural light bounce from white walls. Perfect exposure, neutral white balance 5500K.',
  'Entardecer Quente': 'Warm golden afternoon light entering through windows at low angle, casting soft long shadows across the floor. Warm color temperature 3200K, atmospheric haze, rich warm tones on wood and stone surfaces.',
  'Noturna Iluminada': 'Nighttime scene with bright warm white LED lighting at 3000K. Recessed ceiling lights, LED strips under cabinets and vanities, pendant lighting accented on surfaces. No harsh spots. Warm glow on vegetation visible through windows.',
}

const PLT: Record<string, string> = {
  'Top View Realista': "Top view bird's-eye photograph of humanized architectural floor plan. Hyper-realistic aerial render preserving 100% of original geometry, layout, dimensions, proportions and positions — absolutely no design changes. Apply realistic high-resolution materials: wood-grain flooring, concrete, marble, ceramic tiles, fabric upholstery, strictly faithful to the original. Render wall tops in solid black with clean precise edges. Natural daytime lighting with realistic sunlight from above, soft coherent shadows, balanced contrast and professional photographic realism.",
  'Isometria 3D': 'Isometric 3D photorealistic architectural view of the floor plan. Walls extruded and cut horizontally at 1.20m height (maquete model effect), clean sharp cut edges. Insert real doors and windows (frames + glass with reflections) without altering positions or proportions. Complete realistic furniture (not simplified): sofas, beds, tables, kitchen appliances. High-quality photorealistic render, soft shadows, realistic contrast, ambient occlusion (AO), subtle reflections, PBR materials. Natural soft daylight. Do not alter original layout, do not create new rooms, do not modify proportions or dimensions.',
}

const PERSP: Record<string, string> = {
  'Frontal 1 ponto': "Analyze the input image as a Senior Architectural Photographer. Input is frontal 1-point perspective. Generate a cohesive 2x2 Architectural Contact Sheet with 4 distinct photorealistic shots: (1) Reference Shot — similar to input with wider context and more sky, (2) Counter-Angle — camera shifted 45° to the side revealing the corner of the building, (3) Aerial Top-Down — bird's-eye view revealing the roof volume and landscaping, (4) Low-Angle Ground — dramatic upward perspective from street level. Avoid repetitive angles. Each shot must reveal different architectural qualities. Ultra-realistic 4K photography.",
  'Angular 2 pontos': "Analyze the input image as a Senior Architectural Photographer. Input is 2-point corner/angular perspective. Generate a cohesive 2x2 Architectural Contact Sheet with 4 distinct photorealistic shots: (1) Reference Shot — similar to input with wider context, (2) Flat Frontal Elevation — orthogonal frontal view of main facade, (3) Aerial Top-Down — bird's-eye view showing roof and site, (4) Low-Angle Diagonal — dramatic ground-level corner shot. Each shot must reveal different architectural qualities. Ultra-realistic 4K photography.",
}

const VEG: Record<string, string> = {
  'Tropical c/ Palmeiras': 'tropical Brazilian garden with imperial palms (palmeira imperial), phoenix palms, coconut palms (coqueiros), emerald grass (grama esmeralda) as ground cover, decorative stones, intense natural light with sharp tropical shadows',
  Frutíferas: 'Brazilian fruit tree garden with jabuticabeira (Myrciaria cauliflora), mango tree (mangueira), lemon tree (limoeiro), banana tree (bananeira), acerola, são carlos grass as ground cover, canteiros with colorful tropical flowers',
  'Bromélias e Tropicais': 'tropical garden with colorful bromeliads, heliconias, peace lilies (lírio da paz), costela de adão (monstera deliciosa), philodendrons, ivy forração, white decorative gravel, lush dense planting',
  'Jardim Vertical': 'vertical garden wall with bougainvillea (primavera) in fuchsia and orange, yellow alamanda, white jasmine (jasmim dos poetas), hanging ferns (samambaias pendentes), metal or hardwood trellis support structure',
  Ornamental: 'contemporary ornamental garden with pleomele, red dracena, agave americana, yucca, espada de são jorge, pandan, black ornamental grass (grama preta), volcanic lava decorative rocks, modern clean aesthetic',
  'Flores Brasileiras': 'flowering garden with red and yellow ixoras, mini roses, azaleas, hibiscus, colorful bougainvillea, maria-sem-vergonha (Impatiens), petunias, batatais ground cover grass, vibrant colors',
  Nativas: 'garden with flowering yellow ipê (Tabebuia chrysotricha), pau-brasil, jacarandá mimoso in purple bloom, sibipiruna, quaresmeira roxa, native forrações, rustic natural stones, amendoim ground cover grass',
  'Suculentas e Cactos': 'Brazilian desert-modern garden with mandacaru cactus, ball cactus (coroa de frade), rose stone (rosa de pedra), echeveria rosettes, sedum, white and gray decorative stones, decomposed granite gravel, architectural planting',
  'Forrações e Gramas': 'landscaping with mixed grass types (grama esmeralda, são carlos, santo agostinho), ornamental black grass (grama preta), zoysia, pingo de ouro, lambari, dinheiro-em-penca, irregular natural stone stepping pavers, organic design',
}

const PRANCHA_PREMIUM =
  'Ultra-detailed premium architectural presentation board combining conceptual design with hyper-realistic visualization. Refined editorial layout, clean Swiss grid system. Reinterpret and transform the provided image into a high-end architectural concept project maintaining its visual essence, composition and atmosphere. Board composition: (1) Main Hero Render — cinematic photorealistic render with realistic materials (concrete, wood cladding, glass curtain wall), global illumination + ambient occlusion, volumetric atmospheric lighting, depth of field; (2) Humanized Site Plan — semi-rendered top view with volumetric vegetation, terrain depth, realistic textures; (3) Longitudinal Section — realistic lighting, materials, human silhouettes at scale + furniture; (4) Facade Elevation — clean linework with material shading, glass reflections, subtle shadows; (5) Exploded Axonometric — real material appearance, ambient occlusion, connection between elements; (6) Bubble Diagram — glass transparency effect, soft color gradients, elegant flow arrows, sector labels in Portuguese. Text elements in Portuguese. Visual style: editorial architecture board, off-white background, muted earth palette. --ar 9:16 --style raw --v 6 --q 2'

export function buildPrompt(options: GenerateOptions): string {
  const { mode, condition, background, ambient, lighting, plantType, perspective, vegetation, lightCondition } = options

  switch (mode) {
    case 'externo': {
      const atmText = ATM[condition ?? 'Diurno'] ?? ATM['Diurno']
      const bgText = BG[background ?? 'Urbano Arborizado'] ?? BG['Urbano Arborizado']
      return `Make this image as a real photograph with all real materials, ultra-realistic 4K, captured by an architectural photographer with professional camera. ${atmText}. On the horizon, tropical landscaping with ${bgText}, maintaining exact framing and perspective of the attached image. Do not alter anything in the attached image — preserve all architectural elements, proportions and materials.${PHOTO_SUFFIX}`
    }
    case 'interno': {
      const luzText = LUZ[lighting ?? 'Clara e Natural'] ?? LUZ['Clara e Natural']
      const ambText = AMB[ambient ?? 'Sala de Estar'] ?? AMB['Sala de Estar']
      return `Transform this 3D preview into an ultra-realistic professional interior architectural photograph in 4K, indistinguishable from a real photo taken by a professional architectural photographer. ${luzText} ${ambText}. Faithfully reproduce ALL original materials exactly as shown (wood grain, concrete texture, porcelain tile pattern, glass reflections, metal finishes, fabric weave, plant species). ABSOLUTE DESIGN PRESERVATION: DO NOT modify the architectural project — preserve exactly all proportions, geometry, layout, furniture placement and composition. Convert appearance ONLY.${PHOTO_SUFFIX}`
    }
    case 'planta': {
      return (PLT[plantType ?? 'Top View Realista'] ?? PLT['Top View Realista']) + PHOTO_SUFFIX
    }
    case 'multi': {
      return (PERSP[perspective ?? 'Frontal 1 ponto'] ?? PERSP['Frontal 1 ponto']) + PHOTO_SUFFIX
    }
    case 'paisagem': {
      const vegText = VEG[vegetation ?? 'Tropical c/ Palmeiras'] ?? VEG['Tropical c/ Palmeiras']
      const luzCond = lightCondition ?? 'Diurno'
      return `Make this image as a real photograph, ultra-realistic 4K, professional landscape photography in ${luzCond === 'Nublado' ? 'cloudy diffuse' : 'daytime natural'} light. ${vegText}. On the horizon in the background, add Brazilian residential houses and more vegetation of the same style. Do not alter the architecture and project layout in the attached image.${PHOTO_SUFFIX}`
    }
    case 'prancha': {
      return PRANCHA_PREMIUM + PHOTO_SUFFIX
    }
    default: {
      return `Make this image photorealistic architectural photography.${PHOTO_SUFFIX}`
    }
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

export const ATM_OPTIONS  = Object.keys(ATM)
export const BG_OPTIONS   = Object.keys(BG)
export const AMB_OPTIONS  = Object.keys(AMB)
export const LUZ_OPTIONS  = Object.keys(LUZ)
export const PLT_OPTIONS  = Object.keys(PLT)
export const PERSP_OPTIONS = Object.keys(PERSP)
export const VEG_OPTIONS  = Object.keys(VEG)
PROMPTS_EOF
ok "lib/prompts.ts criado"

# ── 4. app/api/generate/route.ts ─────────────────────────────
info "Criando app/api/generate/route.ts..."
cat > app/api/generate/route.ts << 'ROUTE_EOF'
// app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as fal from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPrompt, GenerateOptions, Mode } from '@/lib/prompts'

fal.config({ credentials: process.env.FAL_KEY })

const FAL_MODELS: Record<string, string> = {
  'flux-dev':     'fal-ai/flux/dev/image-to-image',
  'flux-krea':    'fal-ai/flux/krea/image-to-image',
  'canny':        'fal-ai/flux-control-lora-canny/image-to-image',
  'depth':        'fal-ai/flux-control-lora-depth/image-to-image',
  'flux-general': 'fal-ai/flux-general/image-to-image',
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      imageBase64,
      mode         = 'externo' as Mode,
      condition,
      background,
      ambient,
      lighting,
      plantType,
      perspective,
      vegetation,
      lightCondition,
      geometryLock  = 30,
      model         = 'flux-dev',
    } = body

    if (!imageBase64) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const promptOptions: GenerateOptions = {
      mode: mode as Mode,
      condition, background, ambient, lighting,
      plantType, perspective, vegetation, lightCondition,
      geometryLock: Number(geometryLock),
    }
    const prompt = buildPrompt(promptOptions)

    // strength com clamp para evitar erro 422
    const rawStrength = 1 - Number(geometryLock) / 100
    const strength = Math.max(0.05, Math.min(0.95, rawStrength))

    const blob = base64ToBlob(imageBase64)
    const falImageUrl = await fal.storage.upload(blob)

    console.log('[generate] mode:', mode, '| model:', model, '| strength:', strength)
    console.log('[generate] prompt:', prompt.substring(0, 120) + '...')

    const falModel = FAL_MODELS[model] ?? FAL_MODELS['flux-dev']
    const result = await fal.run(falModel, {
      input: {
        image_url: falImageUrl,
        prompt,
        strength,
        num_inference_steps: 40,
        guidance_scale: 3.5,
        seed: Math.floor(Math.random() * 999_999),
      },
    }) as { images?: Array<{ url: string }>; image?: { url: string } }

    const outputUrl = result.images?.[0]?.url ?? result.image?.url
    if (!outputUrl) {
      return NextResponse.json({ error: 'Fal.ai não retornou imagem' }, { status: 500 })
    }

    const admin = createAdminClient()

    const { error: creditError } = await admin.rpc('consume_credit', {
      user_id_input: user.id,
    })
    if (creditError) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    const { data: render, error: renderError } = await admin
      .from('renders')
      .insert({
        user_id:       user.id,
        input_url:     falImageUrl,
        output_url:    outputUrl,
        prompt,
        mode,
        model:         falModel,
        geometry_lock: Number(geometryLock),
        strength,
      })
      .select('id')
      .single()

    if (renderError) {
      console.error('[generate] Erro ao salvar render:', renderError)
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      success:  true,
      outputUrl,
      renderId: render?.id ?? null,
      credits:  profile?.credits ?? 0,
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
ROUTE_EOF
ok "app/api/generate/route.ts criado"

# ── 5. app/app/generate/GenerateClient.tsx ───────────────────
info "Criando app/app/generate/GenerateClient.tsx..."
cat > app/app/generate/GenerateClient.tsx << 'CLIENT_EOF'
'use client'
// app/app/generate/GenerateClient.tsx

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Mode, MODE_LABELS,
  ATM_OPTIONS, BG_OPTIONS, AMB_OPTIONS, LUZ_OPTIONS,
  PLT_OPTIONS, PERSP_OPTIONS, VEG_OPTIONS,
} from '@/lib/prompts'

interface GenerateClientProps {
  initialCredits: number
  userName: string
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
  { id: 'flux-dev',     name: 'Flux Dev',     tag: 'PADRÃO',       wide: false },
  { id: 'flux-krea',    name: 'Flux Krea',    tag: 'CRIATIVO',     wide: false },
  { id: 'canny',        name: 'Canny Edge',   tag: 'LINHAS',       wide: false },
  { id: 'depth',        name: 'Depth Map',    tag: 'VOLUMES',      wide: false },
  { id: 'flux-general', name: 'Flux General', tag: 'EXPERIMENTAL', wide: true  },
]

export function GenerateClient({ initialCredits }: GenerateClientProps) {
  const [credits, setCredits]         = useState(initialCredits)
  const [loading, setLoading]         = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [error, setError]             = useState<string | null>(null)

  const [mode, setMode]                         = useState<Mode>('externo')
  const [condition, setCondition]               = useState('Diurno')
  const [background, setBackground]             = useState('Urbano Arborizado')
  const [ambient, setAmbient]                   = useState('Sala de Estar')
  const [lighting, setLighting]                 = useState('Clara e Natural')
  const [plantType, setPlantType]               = useState('Top View Realista')
  const [perspective, setPerspective]           = useState('Frontal 1 ponto')
  const [vegetation, setVegetation]             = useState('Tropical c/ Palmeiras')
  const [lightCondition, setLightCondition]     = useState('Diurno')
  const [geometryLock, setGeometryLock]         = useState(30)
  const [selectedModel, setSelectedModel]       = useState('flux-dev')

  const [imagePreview, setImagePreview]         = useState<string | null>(null)
  const [outputUrl, setOutputUrl]               = useState<string | null>(null)
  const [sliderPos, setSliderPos]               = useState(50)
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const [isDraggingFile, setIsDraggingFile]     = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const compareRef      = useRef<HTMLDivElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startLoadingTexts = () => {
    let i = 0
    setLoadingText(LOADING_TEXTS[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 1800)
  }
  const stopLoadingTexts = () => {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }
  useEffect(() => () => stopLoadingTexts(), [])

  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setOutputUrl(null)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]
    if (file) loadImage(file)
  }, [loadImage])

  const handleGenerate = async () => {
    if (!imagePreview) { setError('Faça upload de uma imagem primeiro.'); return }
    if (credits <= 0)  { setError('Créditos insuficientes.'); return }
    setError(null)
    setLoading(true)
    startLoadingTexts()
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview,
          mode, condition, background, ambient, lighting,
          plantType, perspective, vegetation, lightCondition,
          geometryLock, model: selectedModel,
        }),
      })
      const data: GenerateResult = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na geração')
      setOutputUrl(data.outputUrl)
      setCredits(data.credits)
      setSliderPos(50)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
      stopLoadingTexts()
    }
  }

  const handleCompareMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSlider || !compareRef.current) return
    const rect = compareRef.current.getBoundingClientRect()
    const pos = ((e.clientX - rect.left) / rect.width) * 100
    setSliderPos(Math.max(3, Math.min(97, pos)))
  }, [isDraggingSlider])

  const handleCompareMouseUp = useCallback(() => setIsDraggingSlider(false), [])

  useEffect(() => {
    window.addEventListener('mousemove', handleCompareMouseMove)
    window.addEventListener('mouseup', handleCompareMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleCompareMouseMove)
      window.removeEventListener('mouseup', handleCompareMouseUp)
    }
  }, [handleCompareMouseMove, handleCompareMouseUp])

  const getPromptLabel = (): string => {
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

  return (
    <div style={S.main}>
      {/* CONTROLES */}
      <div style={S.controls}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>GERAR</span>
          <div style={S.credits}>
            <span style={S.creditDot} />
            <span style={S.creditNum}>{credits}</span>
            <span>créditos</span>
          </div>
        </div>

        <div style={S.section}>
          <div style={S.label}>MODO DE OUTPUT</div>
          <div style={S.modesGrid}>
            {MODES.map((m) => (
              <div key={m.id}
                style={mode === m.id ? {...S.modeCard, ...S.modeCardActive} : S.modeCard}
                onClick={() => setMode(m.id)}>
                <div style={{...S.modeIcon, ...(mode === m.id ? {color:'#fafafa'} : {})}}>{m.icon}</div>
                <div style={{...S.modeLabel, ...(mode === m.id ? {color:'#fafafa'} : {})}}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.divider} />

        {mode === 'externo' && <>
          <div style={S.section}><div style={S.label}>CONDIÇÃO ATMOSFÉRICA</div><PillGroup options={ATM_OPTIONS} selected={condition} onChange={setCondition} /></div>
          <div style={S.section}><div style={S.label}>BACKGROUND / PAISAGEM</div><PillGroup options={BG_OPTIONS} selected={background} onChange={setBackground} /></div>
        </>}
        {mode === 'interno' && <>
          <div style={S.section}><div style={S.label}>AMBIENTE</div><PillGroup options={AMB_OPTIONS} selected={ambient} onChange={setAmbient} /></div>
          <div style={S.section}><div style={S.label}>ILUMINAÇÃO</div><PillGroup options={LUZ_OPTIONS} selected={lighting} onChange={setLighting} /></div>
        </>}
        {mode === 'planta' && <div style={S.section}><div style={S.label}>TIPO DE PLANTA</div><PillGroup options={PLT_OPTIONS} selected={plantType} onChange={setPlantType} /></div>}
        {mode === 'multi' && <div style={S.section}><div style={S.label}>PERSPECTIVA DO INPUT</div><PillGroup options={PERSP_OPTIONS} selected={perspective} onChange={setPerspective} /><p style={S.infoNote}>Gera 4 ângulos: referência, contra-ângulo, aéreo e perspectiva baixa.</p></div>}
        {mode === 'paisagem' && <>
          <div style={S.section}><div style={S.label}>TIPO DE VEGETAÇÃO</div><PillGroup options={VEG_OPTIONS} selected={vegetation} onChange={setVegetation} /></div>
          <div style={S.section}><div style={S.label}>CONDIÇÃO DE LUZ</div><PillGroup options={['Diurno','Nublado']} selected={lightCondition} onChange={setLightCondition} /></div>
        </>}
        {mode === 'prancha' && <div style={S.section}><div style={S.label}>TIPO DE PRANCHA</div><PillGroup options={['Prancha Premium']} selected="Prancha Premium" onChange={() => {}} /><p style={S.infoNote}>Hero render + implantação + corte + fachada + axonometria + diagramas.</p></div>}

        <div style={S.divider} />

        <div style={S.section}>
          <div style={S.label}>GEOMETRY LOCK</div>
          <div style={S.sliderRow}>
            <span style={S.sliderEnd}>Livre</span>
            <input type="range" min={0} max={100} value={geometryLock} onChange={(e) => setGeometryLock(Number(e.target.value))} style={S.range} />
            <span style={S.sliderEnd}>Fiel</span>
            <span style={S.sliderVal}>{geometryLock}%</span>
          </div>
          <p style={S.infoNote}>strength: {(1 - geometryLock / 100).toFixed(2)}</p>
        </div>

        <div style={S.section}>
          <div style={S.label}>MOTOR DE IA</div>
          <div style={S.motorGrid}>
            {FAL_MODELS.map((m) => (
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

        <button style={loading ? {...S.genBtn, opacity: 0.7, cursor:'not-allowed'} : S.genBtn} onClick={handleGenerate} disabled={loading}>
          <span>{loading ? loadingText : 'gerar render'}</span>
          <span style={S.genBtnMeta}>
            <span>~6s · 1 crédito</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fafafa" strokeWidth="1.5"><path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </button>
      </div>

      {/* PREVIEW */}
      <div style={S.preview}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>ANTES / DEPOIS</span>
          {outputUrl && <a href={outputUrl} download="spacenode-render.jpg" target="_blank" rel="noopener noreferrer" style={S.downloadLink}>baixar render ↓</a>}
        </div>

        {!imagePreview && (
          <div style={isDraggingFile ? {...S.uploadZone, borderColor:'#1a1a1a', background:'#f5f5f5'} : S.uploadZone}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true) }}
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
            <button style={S.uploadBtn} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>escolher arquivo</button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImage(f) }} />
          </div>
        )}

        {imagePreview && outputUrl && (
          <div ref={compareRef} style={S.compareWrap} onMouseDown={() => setIsDraggingSlider(true)}>
            <img src={imagePreview} alt="Antes" style={S.compareImg} draggable={false} />
            <div style={{...S.compareAfterWrap, clipPath: `inset(0 ${100 - sliderPos}% 0 0)`}}>
              <img src={outputUrl} alt="Depois" style={S.compareImg} draggable={false} />
            </div>
            <div style={{...S.compareHandle, left: `${sliderPos}%`}}>
              <div style={S.compareHandleCircle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><path d="M8 5l-5 7 5 7M16 5l5 7-5 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            <span style={{...S.compareLabel, left: 14}}>ANTES</span>
            <span style={{...S.compareLabel, right: 14}}>DEPOIS</span>
          </div>
        )}

        {imagePreview && !outputUrl && !loading && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={S.compareImg} />
            <span style={{...S.compareLabel, left: 14}}>ANTES</span>
            <button style={S.changeImageBtn} onClick={() => { setImagePreview(null); setOutputUrl(null) }}>trocar imagem</button>
          </div>
        )}

        {loading && imagePreview && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={{...S.compareImg, opacity: 0.4}} />
            <div style={S.loadingOverlay}>
              <div style={S.spinner} />
              <span style={{fontSize:12, color:'#fafafa', letterSpacing:'0.05em'}}>{loadingText}</span>
            </div>
          </div>
        )}

        <div style={S.promptPreview}>
          <div style={S.promptLabel}>PROMPT GERADO</div>
          <div style={S.promptText}>
            <strong style={{color:'#1a1a1a', fontWeight:500}}>{getPromptLabel()}</strong><br />
            <span style={{color:'#86868b'}}>strength: {(1 - geometryLock / 100).toFixed(2)} · steps: 40 · guidance: 3.5 · {FAL_MODELS.find(m => m.id === selectedModel)?.name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PillGroup({ options, selected, onChange }: { options: string[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map((opt) => (
        <button key={opt} style={selected === opt ? {...pill, ...pillActive} : pill} onClick={() => onChange(opt)}>{opt}</button>
      ))}
    </div>
  )
}

const pill: React.CSSProperties = { padding:'5px 12px', borderRadius:20, border:'0.5px solid rgba(0,0,0,0.1)', fontSize:11, color:'#86868b', cursor:'pointer', background:'#fafafa', letterSpacing:'-0.005em', fontFamily:'inherit' }
const pillActive: React.CSSProperties = { background:'#1a1a1a', color:'#fafafa', borderColor:'#1a1a1a' }

const S: Record<string, React.CSSProperties> = {
  main:             { display:'grid', gridTemplateColumns:'390px 1fr', minHeight:'100%', overflow:'hidden' },
  controls:         { padding:'28px 24px', borderRight:'0.5px solid rgba(0,0,0,0.06)', background:'#ffffff', overflowY:'auto', display:'flex', flexDirection:'column', gap:20 },
  preview:          { padding:28, background:'#fafafa', display:'flex', flexDirection:'column', gap:18 },
  topbar:           { display:'flex', justifyContent:'space-between', alignItems:'center' },
  pageTitle:        { fontSize:10, letterSpacing:'0.22em', textTransform:'uppercase', color:'#86868b', fontWeight:500 },
  credits:          { display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#86868b' },
  creditDot:        { width:5, height:5, borderRadius:'50%', background:'#30b46c', boxShadow:'0 0 5px rgba(48,180,108,0.4)', display:'inline-block' },
  creditNum:        { color:'#1a1a1a', fontWeight:500, fontSize:12 },
  section:          { display:'flex', flexDirection:'column', gap:10 },
  label:            { fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'#86868b', fontWeight:500 },
  divider:          { height:'0.5px', background:'rgba(0,0,0,0.06)' },
  modesGrid:        { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 },
  modeCard:         { border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'12px 10px', cursor:'pointer', textAlign:'center', background:'#fafafa' },
  modeCardActive:   { borderColor:'#1a1a1a', background:'#1a1a1a' },
  modeIcon:         { fontSize:16, marginBottom:4, color:'#86868b' },
  modeLabel:        { fontSize:10, fontWeight:500, color:'#1a1a1a', lineHeight:1.3 },
  infoNote:         { fontSize:11, color:'#86868b', lineHeight:1.6 },
  sliderRow:        { display:'flex', alignItems:'center', gap:10 },
  sliderEnd:        { fontSize:11, color:'#86868b' },
  range:            { flex:1, accentColor:'#1a1a1a', height:3 },
  sliderVal:        { fontSize:12, fontWeight:500, color:'#1a1a1a', minWidth:34, textAlign:'right' },
  motorGrid:        { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  motorOpt:         { border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:8, padding:'8px 10px', cursor:'pointer', background:'#fafafa' },
  motorOptActive:   { borderColor:'#1a1a1a', background:'#1a1a1a' },
  motorWide:        { gridColumn:'span 2' },
  motorName:        { fontSize:11, fontWeight:500, color:'#1a1a1a', marginBottom:3 },
  motorTag:         { display:'inline-block', fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'rgba(0,0,0,0.05)', color:'#86868b', padding:'2px 6px', borderRadius:4 },
  errorBox:         { fontSize:12, color:'#c0392b', background:'#fff5f5', border:'0.5px solid rgba(192,57,43,0.2)', borderRadius:8, padding:'10px 14px' },
  genBtn:           { width:'100%', padding:'13px 16px', background:'#1a1a1a', color:'#fafafa', border:'none', borderRadius:10, fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit' },
  genBtnMeta:       { display:'flex', alignItems:'center', gap:8, fontSize:11, color:'#86868b' },
  uploadZone:       { border:'0.5px dashed rgba(0,0,0,0.2)', borderRadius:12, padding:'48px 20px', textAlign:'center', cursor:'pointer', background:'#ffffff', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, minHeight:300 },
  uploadIcon:       { width:44, height:44, borderRadius:10, background:'rgba(0,0,0,0.04)', display:'flex', alignItems:'center', justifyContent:'center' },
  uploadTitle:      { fontSize:15, fontWeight:500, color:'#1a1a1a', letterSpacing:'-0.02em' },
  uploadSub:        { fontSize:12, color:'#86868b', marginTop:4 },
  uploadBtn:        { padding:'7px 18px', border:'0.5px solid rgba(0,0,0,0.15)', borderRadius:20, fontSize:11, color:'#1a1a1a', background:'#fafafa', cursor:'pointer', fontFamily:'inherit' },
  compareWrap:      { position:'relative', borderRadius:12, overflow:'hidden', flex:1, minHeight:300, background:'#e8e8e8', userSelect:'none', cursor:'ew-resize' },
  compareImg:       { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', pointerEvents:'none' },
  compareAfterWrap: { position:'absolute', inset:0 },
  compareHandle:    { position:'absolute', top:0, bottom:0, width:2, background:'#ffffff', transform:'translateX(-50%)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  compareHandleCircle: { width:32, height:32, borderRadius:'50%', background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
  compareLabel:     { position:'absolute', bottom:12, fontSize:9, letterSpacing:'0.12em', color:'#fafafa', textTransform:'uppercase', fontWeight:500, textShadow:'0 1px 3px rgba(0,0,0,0.5)', pointerEvents:'none' },
  changeImageBtn:   { position:'absolute', top:12, right:14, padding:'5px 12px', border:'0.5px solid rgba(255,255,255,0.4)', borderRadius:20, fontSize:10, color:'#fafafa', background:'rgba(0,0,0,0.35)', cursor:'pointer', fontFamily:'inherit' },
  loadingOverlay:   { position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 },
  spinner:          { width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#ffffff', animation:'spin 0.8s linear infinite' },
  promptPreview:    { background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.06)', borderRadius:10, padding:'14px 16px' },
  promptLabel:      { fontSize:9, letterSpacing:'0.15em', textTransform:'uppercase', color:'#86868b', fontWeight:500, marginBottom:8 },
  promptText:       { fontSize:11, color:'#86868b', lineHeight:1.65 },
  downloadLink:     { fontSize:11, color:'#86868b', textDecoration:'none', letterSpacing:'0.02em' },
}
CLIENT_EOF
ok "app/app/generate/GenerateClient.tsx criado"

# ── 6. Patch do globals.css (adiciona @keyframes spin) ───────
info "Verificando globals.css..."

CSS_CANDIDATES=(
  "app/globals.css"
  "src/app/globals.css"
  "styles/globals.css"
)

CSS_FILE=""
for f in "${CSS_CANDIDATES[@]}"; do
  if [ -f "$f" ]; then CSS_FILE="$f"; break; fi
done

SPIN_KEYFRAME='@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'

if [ -n "$CSS_FILE" ]; then
  if grep -q "@keyframes spin" "$CSS_FILE"; then
    ok "@keyframes spin já existe em $CSS_FILE"
  else
    echo "" >> "$CSS_FILE"
    echo "$SPIN_KEYFRAME" >> "$CSS_FILE"
    ok "@keyframes spin adicionado em $CSS_FILE"
  fi
else
  echo ""
  echo -e "${YELLOW}  ⚠ globals.css não encontrado. Adicione manualmente:${RESET}"
  echo "  $SPIN_KEYFRAME"
  echo ""
fi

# ── 7. Verificar variáveis de ambiente ───────────────────────
info "Verificando .env.local..."
MISSING_VARS=()
for VAR in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY FAL_KEY; do
  if [ -f ".env.local" ] && grep -q "^${VAR}=" .env.local; then
    ok "$VAR OK"
  else
    MISSING_VARS+=("$VAR")
  fi
done
if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo -e "${YELLOW}  ⚠ Variáveis ausentes no .env.local: ${MISSING_VARS[*]}${RESET}"
fi

# ── 8. Exibir SQL de migration ────────────────────────────────
echo ""
echo "  ─────────────────────────────────────────────────"
echo -e "  ${YELLOW}SQL para executar no Supabase Dashboard:${RESET}"
echo "  ─────────────────────────────────────────────────"
echo ""
cat << 'SQL_EOF'
  ALTER TABLE renders
    ADD COLUMN IF NOT EXISTS mode          TEXT,
    ADD COLUMN IF NOT EXISTS model         TEXT,
    ADD COLUMN IF NOT EXISTS geometry_lock INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS strength      FLOAT   DEFAULT 0.7;

  CREATE INDEX IF NOT EXISTS renders_mode_idx        ON renders(mode);
  CREATE INDEX IF NOT EXISTS renders_user_created_idx ON renders(user_id, created_at DESC);
SQL_EOF
echo ""
echo "  Acesse: https://supabase.com/dashboard → SQL Editor"
echo "  ─────────────────────────────────────────────────"
echo ""

# ── 9. Verificar TypeScript (se tsc disponível) ───────────────
if command -v npx &> /dev/null; then
  info "Verificando TypeScript..."
  if npx tsc --noEmit --skipLibCheck 2>/dev/null; then
    ok "TypeScript sem erros"
  else
    echo -e "${YELLOW}  ⚠ Erros de TypeScript — verifique os imports acima${RESET}"
  fi
fi

# ── 10. Resumo final ─────────────────────────────────────────
echo ""
echo "  ✅ Setup concluído!"
echo ""
echo "  Arquivos criados:"
echo "    lib/prompts.ts"
echo "    app/api/generate/route.ts"
echo "    app/app/generate/GenerateClient.tsx"
echo ""
echo "  Próximos passos:"
echo "    1. Execute o SQL acima no Supabase Dashboard"
echo "    2. npm run dev"
echo "    3. Acesse http://localhost:3000/app/generate"
echo ""
