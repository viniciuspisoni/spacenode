#!/usr/bin/env bash
# fix-geometry-lock.sh
# Corrige o travamento de geometria para o Nano Banana Pro via prompt

cat > lib/prompts.ts << 'EOF'
// lib/prompts.ts
// SpaceNode — Biblioteca de Prompts Arquitetônicos

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

// ── Prefixo de travamento de geometria (escala com o slider) ─────────────────
// geometryLock 0–25%  → livre: IA tem criatividade de ângulo
// geometryLock 26–50% → equilibrado: mantém composição geral
// geometryLock 51–75% → travado: câmera e proporções fixas
// geometryLock 76–100% → máximo: APENAS materiais mudam
function buildGeometryPrefix(geometryLock: number): string {
  if (geometryLock <= 25) {
    return ''
  }
  if (geometryLock <= 50) {
    return (
      'Using the reference image as a base, maintaining the same general composition, ' +
      'building proportions and camera framing. '
    )
  }
  if (geometryLock <= 75) {
    return (
      'Transform ONLY the materials, lighting and environment of this exact image. ' +
      'The camera angle, perspective, building geometry, architectural proportions ' +
      'and framing must remain exactly as in the reference image. ' +
      'Do not move the camera, do not change the viewing angle. '
    )
  }
  // 76–100%: máxima fidelidade
  return (
    'GEOMETRY LOCKED: This is a material and lighting transformation ONLY. ' +
    'The camera position, viewing angle, perspective, horizon line, building silhouette, ' +
    'architectural geometry and all proportions must be PIXEL-PERFECT identical to the reference image. ' +
    'Do not reframe, do not rotate, do not zoom, do not change the viewpoint in any way. ' +
    'Only the surface materials, textures, lighting conditions and background vegetation may change. '
  )
}

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
  'Suburbano c/ Mata': 'suburban houses with Atlantic forest native vegetation, pau-brasil, sibipiruna, dense greenery',
  Litorâneo: 'coastal beach houses, abundant coconut palms, restinga vegetation, amendoeiras, cajueiros, distant sea',
  'Bairro Nobre': 'luxury mansions, centenary figueira and jequitibá trees, elaborate professional landscaping, wide tree-lined avenues',
  'Parque Urbano': 'public urban park, large tipuana and oiti trees, dense grove, lake with aquatic vegetation',
  Montanha: 'mountain houses on slopes, Atlantic forest, araucárias, pinheiros do paraná, light mist between hills',
  'Cond. Ecológico': 'ecological condominium, native vegetation preserved, natural lakes, flowering ipê trees in multiple colors',
  'Rural / Sítio': 'rural farmhouses, eucalyptus, cerrado vegetation, pinheiros, open fields',
  'Vila Residencial': 'colorful colonial and modern houses, flowering resedá and quaresmeira trees, tropical garden fronts',
}

const AMB: Record<string, string> = {
  'Sala de Estar': 'living room with sofa, TV rack unit, large-format porcelain tile floor, textured walls, natural light through floor-to-ceiling windows',
  'Cozinha Gourmet': 'kitchen with custom cabinetry, granite or quartz countertop, gas cooktop, stainless steel hood and refrigerator, porcelain tile floor',
  'Suíte Master': 'master bedroom with king-size bed, upholstered headboard, nightstands, built-in wardrobe in wood veneer, wood laminate floor',
  Banheiro: 'bathroom with frameless glass shower, vessel basin on floating vanity, marble countertop, chrome fixtures, large-format ceramic wall tiles',
  'Área de Serviço': 'laundry room with washing machine, utility sink, overhead white cabinets, anti-slip porcelain floor',
  'Home Office': 'home office with solid wood desk, ergonomic chair, built-in bookshelves, wood laminate floor',
  'Varanda Gourmet': 'gourmet balcony with masonry barbecue, stone countertop, sink, dining table with rattan chairs, composite wood deck',
  'Sala de Jantar': 'dining room with 6-seat wooden table, upholstered chairs, buffet cabinet, pendant chandelier, porcelain floor',
  'Quarto Infantil': "children's bedroom with bed, white lacquer wardrobe, study desk, floating shelves, wide-plank laminate floor",
  'Piscina e Lazer': 'outdoor leisure area with masonry pool finished with mosaic tiles, composite wood deck, sun loungers, parasol',
}

const LUZ: Record<string, string> = {
  'Clara e Natural': 'Extremely bright, clean, airy interior lighting with abundant natural daylight. No dark areas. Luminous atmosphere on all surfaces. Global illumination with natural light bounce. Perfect exposure 5500K.',
  'Entardecer Quente': 'Warm golden afternoon light entering through windows at low angle, soft long shadows, warm color temperature 3200K.',
  'Noturna Iluminada': 'Nighttime scene with warm white LED lighting at 3000K. Recessed ceiling lights, LED strips, pendant lights. No harsh spots.',
}

const PLT: Record<string, string> = {
  'Top View Realista': "Top view bird's-eye photograph of humanized architectural floor plan. Hyper-realistic aerial render preserving 100% of original geometry, layout, dimensions and proportions. Realistic materials: wood-grain flooring, concrete, marble, ceramic tiles. Wall tops in solid black with clean edges. Natural daytime lighting.",
  'Isometria 3D': 'Isometric 3D photorealistic view. Walls cut at 1.20m height (model effect), clean cut edges. Real doors and windows with glass reflections. Complete realistic furniture. Soft shadows, ambient occlusion, PBR materials. Natural daylight.',
}

const PERSP: Record<string, string> = {
  'Frontal 1 ponto': "Generate a 2x2 Architectural Contact Sheet with 4 shots from frontal 1-point perspective input: (1) Reference wider context, (2) 45° counter-angle corner shot, (3) Aerial top-down view, (4) Low-angle ground perspective. Ultra-realistic 4K photography.",
  'Angular 2 pontos': "Generate a 2x2 Architectural Contact Sheet with 4 shots from 2-point corner perspective input: (1) Reference wider context, (2) Flat frontal elevation, (3) Aerial top-down view, (4) Low-angle diagonal shot. Ultra-realistic 4K photography.",
}

const VEG: Record<string, string> = {
  'Tropical c/ Palmeiras': 'tropical Brazilian garden with imperial palms, phoenix palms, coconut palms, emerald grass, decorative stones',
  Frutíferas: 'Brazilian fruit garden with jabuticabeira, mango tree, lemon tree, banana tree, acerola, tropical flowers',
  'Bromélias e Tropicais': 'tropical garden with colorful bromeliads, heliconias, peace lilies, monstera, philodendrons, white gravel',
  'Jardim Vertical': 'vertical garden with bougainvillea, yellow alamanda, jasmine, hanging ferns, trellis structure',
  Ornamental: 'ornamental garden with pleomele, red dracena, agave, yucca, black ornamental grass, volcanic rocks',
  'Flores Brasileiras': 'flowering garden with ixoras, mini roses, azaleas, hibiscus, colorful bougainvillea, petunias',
  Nativas: 'garden with yellow ipê, jacarandá mimoso, sibipiruna, quaresmeira roxa, native plants, rustic stones',
  'Suculentas e Cactos': 'Brazilian succulent garden with mandacaru, ball cactus, echeveria, sedum, white and gray stones',
  'Forrações e Gramas': 'mixed grass types (esmeralda, são carlos), black ornamental grass, zoysia, irregular stepping stones',
}

const PRANCHA_PREMIUM =
  'Ultra-detailed premium architectural presentation board. Refined editorial layout, Swiss grid system. Board: (1) Hero cinematic render — realistic materials (concrete, wood, glass), global illumination, ambient occlusion, volumetric lighting, depth of field; (2) Humanized site plan — volumetric vegetation, terrain depth; (3) Longitudinal section — lighting, materials, human silhouettes; (4) Facade elevation — material shading, glass reflections; (5) Exploded axonometric — real materials, ambient occlusion; (6) Bubble diagram — glass transparency, gradients, elegant arrows. Text in Portuguese. Off-white background, muted earth palette. --ar 9:16 --style raw --v 6'

// ── Função principal ──────────────────────────────────────────────────────────
export function buildPrompt(options: GenerateOptions): string {
  const {
    mode, condition, background, ambient, lighting,
    plantType, perspective, vegetation, lightCondition, geometryLock,
  } = options

  const geoPrefix = buildGeometryPrefix(geometryLock)

  switch (mode) {
    case 'externo': {
      const atmText = ATM[condition ?? 'Diurno'] ?? ATM['Diurno']
      const bgText  = BG[background ?? 'Urbano Arborizado'] ?? BG['Urbano Arborizado']
      return (
        geoPrefix +
        `Make this image as a real photograph with all real materials, ultra-realistic 4K, ` +
        `captured by an architectural photographer. ` +
        `${atmText}. On the horizon, tropical landscaping with ${bgText}. ` +
        `Preserve all architectural elements, signage, logos and proportions exactly as shown.` +
        PHOTO_SUFFIX
      )
    }

    case 'interno': {
      const luzText = LUZ[lighting ?? 'Clara e Natural'] ?? LUZ['Clara e Natural']
      const ambText = AMB[ambient ?? 'Sala de Estar'] ?? AMB['Sala de Estar']
      return (
        geoPrefix +
        `Transform this 3D preview into an ultra-realistic professional interior photograph in 4K. ` +
        `${luzText} ` +
        `${ambText}. ` +
        `Faithfully reproduce ALL original materials (wood, concrete, porcelain, glass, metal, fabrics). ` +
        `PRESERVE exactly all proportions, geometry, layout and furniture placement. Convert appearance ONLY.` +
        PHOTO_SUFFIX
      )
    }

    case 'planta':
      return geoPrefix + (PLT[plantType ?? 'Top View Realista'] ?? PLT['Top View Realista']) + PHOTO_SUFFIX

    case 'multi':
      return geoPrefix + (PERSP[perspective ?? 'Frontal 1 ponto'] ?? PERSP['Frontal 1 ponto']) + PHOTO_SUFFIX

    case 'paisagem': {
      const vegText  = VEG[vegetation ?? 'Tropical c/ Palmeiras'] ?? VEG['Tropical c/ Palmeiras']
      const luzCond  = lightCondition ?? 'Diurno'
      return (
        geoPrefix +
        `Professional landscape photography in ${luzCond === 'Nublado' ? 'cloudy diffuse' : 'natural daylight'}. ` +
        `${vegText}. ` +
        `On the horizon, add Brazilian residential houses and matching vegetation. ` +
        `Do not alter the architecture and project layout.` +
        PHOTO_SUFFIX
      )
    }

    case 'prancha':
      return geoPrefix + PRANCHA_PREMIUM + PHOTO_SUFFIX

    default:
      return geoPrefix + `Make this image photorealistic architectural photography.` + PHOTO_SUFFIX
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

echo "✓ lib/prompts.ts atualizado com geometry lock por prompt"
echo ""
echo "Resumo dos níveis de travamento:"
echo "  Slider  0–25% → IA tem liberdade criativa de ângulo"
echo "  Slider 26–50% → mantém composição geral (equilibrado)"
echo "  Slider 51–75% → câmera e proporções travadas"
echo "  Slider 76–100% → APENAS materiais mudam (máximo travamento)"
echo ""
echo "Agora rode: npm run dev"
echo "Teste com slider em 80%+ para máximo travamento de geometria"
