import type { ProjectDNA, DnaOverrides, VistaType } from './types'
import { buildDnaPrefix } from './dna'

// ── Geometry lock prefix ──────────────────────────────────────────────────────
// Replicates the threshold logic and exact wording of buildFidelityBlock() in
// lib/prompts.ts (private fn, cannot import). Keep in sync with that file.

function buildGeometryPrefix(geometryLock: number): string {
  if (geometryLock <= 25) return ''
  if (geometryLock <= 50)
    return 'Using the reference image as a base, maintaining the same general composition, building proportions and camera framing. '
  if (geometryLock <= 75)
    return 'Transform ONLY the materials, lighting and environment of this exact image. The camera angle, perspective, building geometry, architectural proportions and framing must remain exactly as in the reference image. Do not move the camera, do not change the viewing angle. '
  // > 75
  return 'GEOMETRY LOCKED: This is a material and lighting transformation ONLY. The camera position, viewing angle, perspective, horizon line, building silhouette, architectural geometry and all proportions must be PIXEL-PERFECT identical to the reference image. Do not reframe, do not rotate, do not zoom. Only surface materials, textures, lighting and background vegetation may change. '
}

// ── Camera / photo suffix ─────────────────────────────────────────────────────
// Mirrors buildCameraBlock() from lib/prompts.ts (private fn, cannot import).

const CAMERA_SUFFIX =
  ', captured with professional architectural camera, Canon R5, 24mm tilt-shift lens, f/4, ISO 100, Hasselblad aesthetic, hyperrealistic, 8K RAW photo, photorealistic architectural photography, not a render, not CGI, real life photo'

// ── Upload-based angulo prompt ────────────────────────────────────────────────
// Used when the caller supplies a new wireframe/draft image (input_image_base64)
// instead of evolving an existing render. The model should render the draft
// realistically, preserving its geometry and camera angle while applying the
// project's DNA (materials, textures, lighting).

const VISTA_ANGULO_FROM_UPLOAD =
  'Render this architectural draft as a photorealistic photograph. ' +
  'Preserve the exact camera angle, composition and structural geometry of this draft. ' +
  'Apply the materials, finishes, surface textures and lighting atmosphere of the project exactly. ' +
  'Transform every surface from draft/wireframe into professional architectural photography.' +
  CAMERA_SUFFIX

// ── Vista-type base instructions ──────────────────────────────────────────────

const VISTA_BASE: Record<Exclude<VistaType, 'mestre'>, string> = {
  iluminacao:
    'Transform the lighting conditions of this architectural image. ' +
    'Change the time of day, atmospheric quality, and light sources while preserving all ' +
    'architectural geometry, materials and spatial composition. ' +
    'Preserve ALL original materials and proportions exactly.' +
    CAMERA_SUFFIX,

  material:
    'Transform ONLY the surface materials and textures of this architectural image. ' +
    'Apply new finishes, claddings and material combinations while keeping the exact same ' +
    'lighting, geometry, camera angle and spatial composition. ' +
    'Preserve all architectural proportions exactly.' +
    CAMERA_SUFFIX,

  angulo:
    'Generate an alternative camera angle of this architectural project. ' +
    'Explore a different vantage point — wider, narrower, elevated, ground-level, or oblique — ' +
    'while maintaining the same architectural design, materials and lighting atmosphere.' +
    CAMERA_SUFFIX,

  detalhe:
    'Create a close-up detail shot of this architectural project. ' +
    'Focus on a specific material junction, surface texture, architectural element or construction ' +
    'detail. Maintain the same material palette, lighting quality and visual identity.' +
    CAMERA_SUFFIX,

  interior:
    'Generate a photorealistic interior view of this architectural project. ' +
    'The interior space should reflect the same architectural language, material palette and ' +
    'design identity visible in the exterior. Use consistent lighting atmosphere.' +
    CAMERA_SUFFIX,
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BuildVistaPromptOptions {
  dna:          ProjectDNA
  overrides:    DnaOverrides
  vistaType:    Exclude<VistaType, 'mestre'>
  geometryLock: number   // 0–100
  fromUpload?:  boolean  // true when input is a user-uploaded draft (not an existing render)
}

export function buildVistaPrompt({
  dna,
  overrides,
  vistaType,
  geometryLock,
  fromUpload = false,
}: BuildVistaPromptOptions): string {
  const geomPrefix = buildGeometryPrefix(geometryLock)
  const dnaPrefix  = buildDnaPrefix(dna, overrides)  // only includes locked traits

  // Upload-based angulo gets a dedicated prompt: "render this draft realistically"
  // instead of the normal "generate an alternative camera angle" instruction.
  const base = (fromUpload && vistaType === 'angulo')
    ? VISTA_ANGULO_FROM_UPLOAD
    : VISTA_BASE[vistaType]

  return `${geomPrefix}${dnaPrefix}${base}`
}
