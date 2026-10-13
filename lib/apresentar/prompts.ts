// ── Módulo Apresentar · Prompt builders ──────────────────────────────────────
//
// Instruções em INGLÊS curtas e diretivas, com constraints estruturais em CAPS
// — o padrão que rende melhor fidelidade nos endpoints de edição.
//
// A Planta Humanizada saiu daqui em 2026-09-22 (lib/apresentar/humanized-plan-prompt):
// o prompt dela deixou de ser derivado só das seleções da UI e passou a ser
// montado a partir do brief de leitura da planta, e ficou grande demais para
// dividir arquivo com as Isométricas.

import type {
  IsometricOrigin,
  IsometricType,
  IsometricStyle,
} from './config'

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
