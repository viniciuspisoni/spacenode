// lib/prompts.ts
export type Mode = 'externo' | 'interno' | 'planta' | 'multi' | 'paisagem' | 'prancha'

export interface ProjectMaterials {
  // exterior
  fachada?:    string  // ex: "placas cimentícias texturizadas, ACM preto"
  piso?:       string  // ex: "porcelanato 90x90 cinza claro" | "piso vinílico amadeirado"
  esquadrias?: string  // ex: "alumínio preto fosco"
  elementos?:  string  // ex: "painel de madeira ipê, brise metálico"
  // interior
  marcenaria?: string  // ex: "armários em MDF carvalho, painel ripado"
  bancadas?:   string  // ex: "quartzo branco, granito escovado"
  paredes?:    string  // ex: "pintura off-white, forro de gesso com sanca"
  // compartilhado
  outros?:     string  // ex: "estrutura em concreto aparente"
}

export interface SceneElements {
  ambientacao?: boolean  // vasos e decoração em vazios
  pessoas?:     boolean  // adicionar pessoas
  luzes?:       boolean  // acender iluminação artificial
  carros?:      boolean  // adicionar veículos
  raiosSol?:    boolean  // raios de sol / glare
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
  materials?: ProjectMaterials
  sceneElements?: SceneElements
  modelType?: 'reference' | 'edit'  // reference = Nano Banana Pro | edit = GPT Image 2
}

const PHOTO_SUFFIX =
  ', captured with professional architectural camera, Canon R5, 24mm tilt-shift lens, f/4, ISO 100, Hasselblad aesthetic, hyperrealistic, 8K RAW photo, photorealistic architectural photography, not a render, not CGI, real life photo'

// ── Prefixos para modelo EDIT (GPT Image 2) — instrução de transformação ──
const GEO_PREFIX_EXTERIOR_EDIT =
  'Keep IDENTICAL camera angle, building silhouette, perspective, proportions and composition as the reference image. Do NOT move the camera, do NOT reframe, do NOT change geometry. Apply photorealistic materials and lighting only. '

const GEO_PREFIX_INTERIOR_EDIT =
  'Keep IDENTICAL camera angle, room layout, furniture positions and all spatial proportions as the reference image. Do NOT move, add or remove any element. Apply photorealistic rendering only. '

// ── Prefixos para modelo REFERENCE (Nano Banana Pro) — descreve o output ─
// Modelos de referência respondem melhor quando o prompt descreve o resultado
// desejado (output-first) em vez de instruções de transformação.
const GEO_PREFIX_EXTERIOR_REF =
  'Ultra-realistic architectural photograph of the exact building shown in the reference: same camera position, same viewing angle, same facade composition, same window placement, same proportions. '

const GEO_PREFIX_INTERIOR_REF =
  'Ultra-realistic interior architectural photograph of the exact room shown in the reference: same camera angle, same furniture layout, same spatial proportions, same ceiling height. '

// ── Bloco de materiais EXTERIOR ───────────────────────────────
function buildExteriorMaterialsBlock(materials?: ProjectMaterials): string {
  if (!materials) return ''
  const lines = [
    materials.fachada    && `facade cladding: ${materials.fachada}`,
    materials.piso       && `floor and paving: ${materials.piso}`,
    materials.esquadrias && `window frames and doors: ${materials.esquadrias}`,
    materials.elementos  && `special architectural elements: ${materials.elementos}`,
    materials.outros     && `additional notes: ${materials.outros}`,
  ].filter(Boolean)
  if (lines.length === 0) return ''
  return `EXACT PROJECT MATERIALS — apply these faithfully: ${lines.join('; ')}. `
}

// ── Bloco de materiais INTERIOR ───────────────────────────────
// Distingue entre "o que muda" (listado) e "o que preserva" (todo o resto).
// Isso evita que o modelo troque materiais não especificados (ex: piso).
function buildInteriorMaterialsBlock(materials?: ProjectMaterials): string {
  if (!materials) {
    return 'MATERIALS: Preserve ALL existing materials, finishes, colors and textures exactly as shown in the reference image. Do not substitute or alter any material. '
  }
  const lines = [
    materials.piso       && `floor/flooring: ${materials.piso}`,
    materials.marcenaria && `cabinetry and millwork: ${materials.marcenaria}`,
    materials.bancadas   && `countertops and stone surfaces: ${materials.bancadas}`,
    materials.paredes    && `walls and ceiling finish: ${materials.paredes}`,
    materials.outros     && `special instructions: ${materials.outros}`,
  ].filter(Boolean)
  if (lines.length === 0) {
    return 'MATERIALS: Preserve ALL existing materials, finishes, colors and textures exactly as shown in the reference image. Do not substitute or alter any material. '
  }
  return (
    `MATERIAL REQUIREMENTS — apply precisely: ${lines.join('; ')}. ` +
    `CRITICAL: Every surface, finish and texture NOT listed above must be PRESERVED EXACTLY as it appears in the reference image. DO NOT change, substitute or reinterpret any unlisted material, color or finish. `
  )
}

const ATM: Record<string, string> = {
  Diurno:      'daytime, blue sky with sun and natural shadows',
  Entardecer:  'golden hour sunset, warm tones, long soft shadows',
  'Blue Hour':  'blue hour twilight, deep cobalt and indigo sky with scattered dramatic clouds catching the last purple light, warm interior and facade lighting glowing against the cool blue atmosphere, cinematic architectural photography',
  Nublado:     'predominantly cloudy sky, diffuse light, no harsh shadows',
  Chuva:       'rainy atmosphere, wet surfaces, dark cloudy sky, rain streaks',
}

const BG_PRESERVE = '__preserve__' // sentinel — tratado separadamente em buildPrompt

const BG: Record<string, string> = {
  'Preservar original': BG_PRESERVE,
  'Entorno Neutro':     'clean neutral context: soft overcast sky, minimal flat ground, no competing structures — full focus on the building',
  'Rua Arborizada':     'Brazilian urban street with mature figueira and tipuana trees casting dappled shade, wide sidewalks, neighboring residential buildings',
  'Condomínio':         'upscale gated community, contemporary neighboring houses, manicured landscaping, coconut palms and flowering ornamental trees',
  'Beira-Mar':          'coastal Brazilian setting, coconut palms, restinga vegetation, calm Atlantic ocean stretching to the horizon',
  'Beira-Rio':          'tranquil riverside setting, calm dark water reflecting the sky, lush native riparian vegetation, light morning mist',
  'Serra':              'mountain landscape with dense Atlantic forest, araucárias, rolling green hills, soft morning mist in the valleys',
  'Zona Rural':         'open rural Brazilian landscape, vast cerrado or grassland fields, dirt road, clear blue sky, distant farmhouses',
}

const AMB: Record<string, string> = {
  'Sala de Estar':    'living room with sofa, TV unit, large windows with natural light',
  'Cozinha Gourmet':  'gourmet kitchen with custom cabinetry, gas cooktop, stainless range hood and refrigerator',
  'Suíte Master':     'master bedroom with king-size bed, upholstered headboard and built-in wardrobe',
  Banheiro:           'bathroom with frameless glass shower, floating vanity and chrome fixtures',
  'Área de Serviço':  'laundry room with washing machine, utility sink and overhead storage cabinets',
  'Home Office':      'home office with desk, ergonomic chair and built-in bookshelves',
  'Varanda Gourmet':  'gourmet balcony with masonry barbecue, dining table and rattan chairs',
  'Sala de Jantar':   'dining room with 6-seat table, upholstered chairs, buffet cabinet and pendant chandelier',
  'Quarto Infantil':  "children's bedroom with bed, wardrobe, study desk and floating shelves",
  'Piscina e Lazer':  'outdoor leisure area with pool and sun loungers',
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

// ── Bloco de elementos de cena ────────────────────────────────
function buildSceneElementsBlock(el?: SceneElements): string {
  if (!el) return ''
  const parts: string[] = []
  if (el.ambientacao) parts.push('add decorative elements: place realistic vases, indoor plants and aesthetic objects in empty shelves and vacant spaces')
  if (el.pessoas)     parts.push('include 1-3 realistic human figures in natural poses and appropriate clothing')
  if (el.luzes)       parts.push('all artificial lights are ON: ceiling fixtures, pendant lights, floor lamps and LED strips are fully lit and glowing')
  if (el.carros)      parts.push('add 1-2 modern parked cars in the driveway or street in front of the building')
  if (el.raiosSol)    parts.push('add cinematic sun rays and lens flare: intense golden sunlight casting visible light beams through windows and open spaces')
  if (parts.length === 0) return ''
  return `SCENE ADDITIONS: ${parts.join('; ')}. `
}

export function buildPrompt(options: GenerateOptions): string {
  const { mode, condition, background, ambient, lighting, plantType,
          perspective, vegetation, lightCondition, materials, sceneElements,
          modelType = 'edit' } = options

  const isRef = modelType === 'reference'

  switch (mode) {
    case 'externo': {
      const atmText   = ATM[condition ?? 'Diurno'] ?? ATM['Diurno']
      const bg        = background ?? 'Preservar original'
      const bgValue   = BG[bg] ?? BG['Preservar original']
      const matBlock  = buildExteriorMaterialsBlock(materials)
      const scnBlock  = buildSceneElementsBlock(sceneElements)
      const geoPrefix = isRef ? GEO_PREFIX_EXTERIOR_REF : GEO_PREFIX_EXTERIOR_EDIT

      const bgInstruction = bgValue === BG_PRESERVE
        ? `Preserve the existing background, surroundings and landscape exactly as in the reference.`
        : `Background: ${bgValue}.`

      return (
        geoPrefix + matBlock + scnBlock +
        `Ultra-realistic 4K architectural photography. ` +
        `${atmText}. ${bgInstruction} ` +
        `Preserve all architectural elements, signage and proportions exactly as shown.` +
        PHOTO_SUFFIX
      )
    }
    case 'interno': {
      const luzText   = LUZ[lighting ?? 'Clara e Natural'] ?? LUZ['Clara e Natural']
      const ambText   = AMB[ambient ?? 'Sala de Estar'] ?? AMB['Sala de Estar']
      const matBlock  = buildInteriorMaterialsBlock(materials)
      const scnBlock  = buildSceneElementsBlock(sceneElements)
      const geoPrefix = isRef ? GEO_PREFIX_INTERIOR_REF : GEO_PREFIX_INTERIOR_EDIT
      return (
        geoPrefix + matBlock + scnBlock +
        `Professional interior architectural photograph in 4K. ` +
        `Room: ${ambText}. ` +
        `Lighting: ${luzText} ` +
        `Apply photorealistic quality: enhance surface finish, sharpness and light accuracy. ` +
        `DO NOT alter furniture, layout or any architectural element.` +
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
