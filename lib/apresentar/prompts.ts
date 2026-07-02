// ── Módulo Apresentar · Prompt builders ──────────────────────────────────────
//
// Constrói prompts para Fal.ai (Nano Banana Pro / Gemini 3 Pro Image) a partir
// das seleções da UI. Optamos por instruções em INGLÊS curtas e diretivas com
// constraints estruturais em CAPS — padrão que rende melhor fidelidade no
// nano-banana-pro/edit.

import type {
  HumanizedPlanProjectType,
  HumanizedPlanStyle,
  HumanizedPlanLevel,
  HumanizedPlanOptions,
  IsometricOrigin,
  IsometricType,
  IsometricStyle,
} from './config'

// ── Planta Humanizada ────────────────────────────────────────────────────────

const PROJECT_TYPE_HINT: Record<HumanizedPlanProjectType, string> = {
  apartamento:  'residential apartment floor plan',
  casa:         'single-family house floor plan',
  comercial:    'commercial retail floor plan',
  corporativo:  'corporate office floor plan',
  paisagismo:   'landscape design plan with planting beds, paving, and outdoor zones',
}

const STYLE_DIRECTIVE: Record<HumanizedPlanStyle, string> = {
  clean_tecnico:
    'CLEAN TECHNICAL render style: precise line work, neutral palette (greys, soft beige, white), restrained furniture icons, no decorative excess. Premium technical drawing aesthetic.',
  imobiliario_premium:
    'PREMIUM REAL-ESTATE render style: rich materiality, warm wood tones, soft textiles, lush plants, photoreal furniture from above. Aspirational, magazine-quality presentation for sales material.',
  editorial_minimalista:
    'EDITORIAL MINIMALIST style: refined typography, restricted palette (cream, charcoal, soft accent), generous negative space, minimal but elegant furniture. Architecture-magazine layout feel.',
  aquarelado:
    'WATERCOLOR style: soft watercolor washes, gentle organic edges on furniture and planting, light pencil outlines preserved, paper-texture background. Artistic and warm.',
  contemporaneo:
    'CONTEMPORARY style: balanced technical drawing with photoreal furniture, mid-warm palette, layered shadows, modern dwelling aesthetic. Sophisticated yet readable.',
}

const LEVEL_DIRECTIVE: Record<HumanizedPlanLevel, string> = {
  leve:
    'LIGHT humanization: keep the technical drawing dominant; add only essential furniture silhouettes and minimal floor tone. Walls and dimensions remain the visual focus.',
  equilibrado:
    'BALANCED humanization: clear furniture, subtle floor textures, light planting, soft shadows. Equal weight to technical clarity and presentation polish.',
  completo:
    'COMPLETE humanization: full furniture sets, decorative plants, rugs, textured flooring per room, soft directional shadows, accessory props. Final presentation quality.',
}

const OPTION_FRAGMENTS: { key: keyof HumanizedPlanOptions; on: string; off?: string }[] = [
  { key: 'addFurniture',       on: 'Add appropriate furniture in every room (top-down view).' },
  { key: 'addVegetation',      on: 'Add indoor plants and (where applicable) outdoor vegetation.' },
  { key: 'applyFloorTextures', on: 'Apply distinct floor textures per room (wood, tile, rug, stone) — top-down.' },
  { key: 'addSoftShadows',     on: 'Add soft, consistent directional shadows under furniture and walls.' },
  { key: 'preserveLines',      on: 'PRESERVE the original technical line work for walls, doors, windows, and dimensions.' },
  { key: 'addRoomLabels',      on: 'Add clean Portuguese room labels (e.g., Sala, Cozinha, Suíte, Banheiro, Quarto) in a refined sans-serif typography placed inside each room.' },
]

export interface HumanizedPlanPromptInput {
  projectType: HumanizedPlanProjectType
  style:       HumanizedPlanStyle
  level:       HumanizedPlanLevel
  options:     HumanizedPlanOptions
  additionalInstructions?: string | null
}

export function buildHumanizedPlanPrompt(input: HumanizedPlanPromptInput): string {
  const { projectType, style, level, options, additionalInstructions } = input

  const optionLines = OPTION_FRAGMENTS
    .filter(({ key }) => options[key])
    .map(({ on }) => `- ${on}`)
    .join('\n')

  return [
    `Transform this technical ${PROJECT_TYPE_HINT[projectType]} into a HUMANIZED PRESENTATION floor plan for client review.`,
    '',
    `STRUCTURAL FIDELITY (non-negotiable):`,
    `- DO NOT change walls, doors, windows, room shapes, or proportions.`,
    `- DO NOT add or remove rooms. DO NOT alter the layout in any way.`,
    `- Camera stays strict TOP-DOWN orthographic. No perspective, no isometric.`,
    `- Preserve the original drawing scale and aspect ratio.`,
    '',
    `STYLE: ${STYLE_DIRECTIVE[style]}`,
    '',
    `LEVEL: ${LEVEL_DIRECTIVE[level]}`,
    '',
    optionLines ? `OPTIONS:\n${optionLines}` : 'OPTIONS: minimal additions only.',
    ...(additionalInstructions?.trim()
      ? ['', `ADDITIONAL USER INSTRUCTIONS (complement the settings above, do not override structural fidelity):\n${additionalInstructions.trim()}`]
      : []),
    '',
    `Output: a single high-quality top-down humanized floor plan, ready for client presentation.`,
  ].join('\n')
}

// ── Isométricas ──────────────────────────────────────────────────────────────

const ORIGIN_HINT: Record<IsometricOrigin, string> = {
  sketchup:   'SketchUp model screenshot',
  revit:      'Revit model view',
  planta:     'floor plan (top-down)',
  conceitual: 'conceptual massing model',
  outro:      'reference image',
}

const TYPE_DIRECTIVE: Record<IsometricType, string> = {
  maquete_branca:
    'WHITE MASSING MODEL: pure white volumes with subtle ambient shadows, no materials, no furniture. Clean architectural massing study.',
  mobiliada:
    'FURNISHED ISOMETRIC: visible interior with furniture, lighting fixtures and surface materials inside each room. Walls partially translucent or sectioned so the interior reads clearly from above.',
  realista:
    'REALISTIC ISOMETRIC: full materiality (wood, glass, concrete, vegetation), realistic daylight, ambient occlusion, photoreal textures. Presentation-grade quality.',
  corte:
    'ISOMETRIC SECTION CUT: a clean vertical cut through the building reveals the interior, with sectioned walls hatched and interior shown with furniture and materials.',
  explodida:
    'EXPLODED AXONOMETRIC: building components separated vertically (roof, slabs, walls, ground) with subtle alignment guides between them. Competition-style diagram.',
  diagrama_volumetrico:
    'VOLUMETRIC DIAGRAM: simplified building masses, conceptual color blocking, subtle annotation lines, schematic and elegant.',
}

const ISO_STYLE_DIRECTIVE: Record<IsometricStyle, string> = {
  premium_clean:
    'PREMIUM CLEAN style: refined materials, polished finish, soft global illumination, elegant restraint. Studio quality.',
  editorial:
    'EDITORIAL ARCHITECTURE style: magazine-publication look, balanced composition, restrained palette, sophisticated tonal range.',
  concurso:
    'COMPETITION BOARD style: conceptual, slightly stylized, strong figure-ground, elegant and ideas-forward.',
  incorporadora:
    'REAL-ESTATE DEVELOPER style: aspirational, warm lighting, lush vegetation, polished textures. Sales-oriented imagery.',
  minimalista:
    'MINIMALIST style: reduced palette, essential elements only, large negative space, single-source soft light.',
}

export interface IsometricPromptInput {
  origin: IsometricOrigin
  type:   IsometricType
  style:  IsometricStyle
}

export function buildIsometricPrompt(input: IsometricPromptInput): string {
  const { origin, type, style } = input

  return [
    `Transform this ${ORIGIN_HINT[origin]} into a PREMIUM ISOMETRIC / AXONOMETRIC presentation view for an architecture client.`,
    '',
    `GEOMETRY FIDELITY (non-negotiable):`,
    `- Preserve the building's footprint, proportions, number of floors and opening positions exactly.`,
    `- Use a 30°/30° classic isometric projection (or true axonometric for diagrams). NO perspective distortion.`,
    `- Maintain the project's spatial relationships and orientation.`,
    '',
    `TYPE: ${TYPE_DIRECTIVE[type]}`,
    '',
    `STYLE: ${ISO_STYLE_DIRECTIVE[style]}`,
    '',
    `Output: a single, high-quality isometric/axonometric image of the project, framed on a neutral background, ready for a presentation board.`,
  ].join('\n')
}
