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
