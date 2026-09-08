// Builder de prompt arquitetônico para geração de vídeo.
// Combina cena + movimento de câmera + intensidade + atmosfera + prompt
// do usuário + diretivas de preservação arquitetônica + sufixo arch.
//
// A regra de ouro do módulo: a SpaceNode prioriza fidelidade ao projeto.
// Toda call do builder injeta as diretivas de preservação — não há
// como o usuário gerar um vídeo que recriou a fachada.

import { getSceneType, type SceneTypeId } from './scenes'
import { getCameraMotion, type CameraMotionId, type CameraIntensity } from './cameraPresets'

export type FidelityMode = 'max' | 'balanced' | 'creative'

export interface BuildVideoPromptInput {
  userPrompt?:   string
  sceneType?:    SceneTypeId
  cameraMotion?: CameraMotionId
  intensity?:    CameraIntensity
  fidelityMode?: FidelityMode             // default 'max'
  atmosphere?:   string                   // ex: "golden hour", "morning light"
  duration?:     string                   // só usado para tunar pacing textual
  hasEndFrame?:  boolean
  avoidPeople?:  boolean                  // reforça cena sem pessoas (prompt + negative)
}

export interface BuiltVideoPrompt {
  prompt:         string
  negativePrompt: string
}

// ── Diretivas centrais ───────────────────────────────────────────────────────

// Sufixo arquitetônico — sempre presente, independente do modo de fidelidade.
// "built surfaces": a proibição de morphing é da ARQUITETURA — vegetação,
// água, nuvens e cortinas PODEM (e devem) se mover.
const ARCH_SUFFIX =
  'Cinematic architectural visualization. Photorealistic rendering. ' +
  'Professional camera movement, smooth and controlled. ' +
  'High-end real estate presentation quality. ' +
  'Sharp focus, no distortion, no warping or morphing of built surfaces or edges.'

// Vida ambiental — o que DEVE se mover mesmo com a câmera quase parada.
// Medido em campo (2026-09-07, Veo 3.1 fachada 6 s, intensidade "subtle"):
// sem esta diretiva o modelo lê "barely perceptible motion" + "preserve
// exactly" como cena congelada — árvores não mexiam. A arquitetura fica
// rígida; natureza, luz e tecidos respiram.
const AMBIENT_LIFE_BY_ARCHETYPE: Record<string, string> = {
  exterior:
    'Natural ambient life: tree canopies, shrubs and grass sway gently in a light breeze, ' +
    'leaves flutter, water surfaces ripple softly, clouds drift slowly across the sky, ' +
    'sunlight and shadows shift subtly. The built structure stays perfectly still and rigid.',
  facade:
    'Natural ambient life: trees and landscaping sway gently in a light breeze, leaves flutter, ' +
    'clouds drift slowly across the sky, sunlight and shadows shift subtly, any water ripples softly. ' +
    'The building itself stays perfectly still and rigid.',
  interior:
    'Natural ambient life: sheer curtains move slightly in a soft draft, daylight through the ' +
    'windows shifts subtly, fine dust and haze drift in the sunbeams, plants indoors and foliage ' +
    'seen through the glass sway gently. Walls, furniture and fixtures stay perfectly still.',
  commercial:
    'Natural ambient life: daylight shifts subtly, plants and foliage sway gently, fabrics and ' +
    'curtains move slightly, screens and signage stay static. Walls, furniture and fixtures ' +
    'stay perfectly still.',
  social:
    'Natural ambient life: foliage sways gently in a light breeze, light shifts subtly, water ' +
    'ripples where present, fabrics move slightly. The architecture stays perfectly still.',
}
const AMBIENT_LIFE_DEFAULT =
  'Natural ambient life: vegetation sways gently in a light breeze, light and shadows shift ' +
  'subtly, water ripples and fabrics move slightly where present. The architecture stays ' +
  'perfectly still and rigid.'

// Preservação arquitetônica — peso varia por fidelityMode.
const FIDELITY_DIRECTIVES: Record<FidelityMode, string> = {
  max:
    'Preserve original architecture exactly. Preserve geometry, materials, layout, openings, ' +
    'windows, doors, furniture placement, proportions and lighting direction. ' +
    'Do not redesign the project. Do not change facade composition, window patterns, ' +
    'door positions, furniture, or material palette. Strict architectural fidelity throughout.',

  balanced:
    'Preserve the overall architecture, geometry, layout and material palette of the reference. ' +
    'Allow minor cinematic enhancements to lighting and atmosphere only. ' +
    'Do not redesign volumes, openings or furniture.',

  creative:
    'Maintain the general architectural intent of the reference image while allowing ' +
    'cinematic interpretation of lighting and atmosphere.',
}

// Prefixos de intensidade — modulam pacing via vocabulário (modelos respondem).
const INTENSITY_PREFIXES: Record<CameraIntensity, string> = {
  // "camera" explícito: sem isso o modelo congelava a cena inteira.
  subtle:     'Camera motion barely perceptible, ultra slow contemplative pace — the scene itself stays naturally alive.',
  normal:     '',
  cinematic:
    'Elegant cinematic camera language, smooth confident movement with anamorphic depth, ' +
    'deliberate film-like pacing, still controlled and restrained.',
  pronounced: 'Pronounced cinematic motion, more dynamic camera movement, dramatic pacing.',
}

// Diretiva opcional — cena sem pessoas (comum em archviz comercial).
const AVOID_PEOPLE_DIRECTIVE =
  'The scene must remain unpopulated: no people, no human figures, no silhouettes, ' +
  'no reflections of people.'

const AVOID_PEOPLE_NEGATIVE =
  'people, person, human figures, crowds, silhouettes of people, walking people, hands'

// Negative prompt expandido — cobre artefatos clássicos de archviz + interior.
// Note: Seedance 2.0 ignora negative_prompt. O adapter decide se passa adiante.
const NEGATIVE_PROMPT =
  'camera shake, handheld movement, distortion, morphing, warping, geometric artifacts, ' +
  'blurry frames, jitter, melting concrete, liquid glass, deforming windows, rubbery materials, ' +
  'walls breathing, surfaces shifting, edges bending, materials changing, geometry collapse, ' +
  'redesigned architecture, altered facade, new windows, new doors, changed furniture, ' +
  'low quality, amateur, cartoon, illustration, oversaturated colors, ' +
  'screen artifacts, black screen flickering, TV display glitch, monitor flicker, ' +
  'wicker pattern morphing, woven texture warping, basket weave shifting, rattan deformation, ' +
  'reflection ghosting, shimmer artifacts, mirror surface distortion, stainless steel rippling, ' +
  'pendant lamp deformation, light fixture morphing, lampshade warping, ' +
  'floor pattern shifting, wood grain crawling, tile pattern morphing, ' +
  'text distortion, logo warping, signage glitch'

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildArchitectureVideoPrompt(input: BuildVideoPromptInput): BuiltVideoPrompt {
  const fidelityMode = input.fidelityMode ?? 'max'
  const intensity    = input.intensity    ?? 'subtle'

  const scene  = input.sceneType    ? getSceneType(input.sceneType)       : undefined
  const motion = input.cameraMotion ? getCameraMotion(input.cameraMotion) : undefined

  const parts: string[] = []

  // 1. Intensidade
  const intensityPrefix = INTENSITY_PREFIXES[intensity]
  if (intensityPrefix) parts.push(intensityPrefix)

  // 2. Cabeçalho de instrução
  parts.push(
    'Create a realistic architectural video from the provided reference image.'
  )

  // 3. Movimento de câmera
  if (motion) {
    parts.push(`Use a subtle cinematic camera movement: ${motion.promptFragment}.`)
  } else {
    parts.push('Use a subtle cinematic camera movement, controlled and restrained.')
  }

  // 4. Cena
  if (scene) {
    parts.push(scene.promptFragment + '.')
  }

  // 4b. Vida ambiental (por arquétipo da cena) — vento na vegetação, água,
  //     nuvens, cortinas, luz. Sempre presente: é o que separa um vídeo de
  //     uma foto com câmera passeando.
  parts.push(AMBIENT_LIFE_BY_ARCHETYPE[scene?.archetype ?? ''] ?? AMBIENT_LIFE_DEFAULT)

  // 5. Atmosfera (livre)
  if (input.atmosphere && input.atmosphere.trim()) {
    parts.push(`Atmosphere: ${input.atmosphere.trim()}.`)
  }

  // 6. End-frame hint
  if (input.hasEndFrame) {
    parts.push(
      'Interpolate motion smoothly toward the provided end frame, ' +
      'preserving the architectural composition throughout.'
    )
  }

  // 7. Direção do usuário (se houver) — vem antes das diretivas para não ser
  //    soterrada, mas depois da cena/motion para servir como refinamento.
  if (input.userPrompt && input.userPrompt.trim()) {
    parts.push(input.userPrompt.trim() + '.')
  }

  // 8. Preservação arquitetônica (sempre)
  parts.push(FIDELITY_DIRECTIVES[fidelityMode])

  // 8b. Sem pessoas (opcional)
  if (input.avoidPeople) {
    parts.push(AVOID_PEOPLE_DIRECTIVE)
  }

  // 9. Sufixo arch (sempre)
  parts.push(ARCH_SUFFIX)

  // Junta com espaço e remove pontuação duplicada
  const prompt = parts
    .join(' ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    prompt,
    negativePrompt: input.avoidPeople
      ? `${NEGATIVE_PROMPT}, ${AVOID_PEOPLE_NEGATIVE}`
      : NEGATIVE_PROMPT,
  }
}

// ── Compat com a API atual ───────────────────────────────────────────────────
// O endpoint POST /api/video recebe `scene` (legacy) + `intensity` + `prompt`.
// Esta função traduz o input legacy para o builder novo.

export function buildPromptFromLegacyInput(args: {
  scene:       string
  intensity:   string
  customPrompt:string
}): BuiltVideoPrompt {
  const sceneType    = args.scene as SceneTypeId
  const scene        = getSceneType(sceneType)
  const cameraMotion = scene?.defaultMotionId as CameraMotionId | undefined

  const intensity: CameraIntensity =
    args.intensity === 'normal'     ? 'normal'     :
    args.intensity === 'pronounced' ? 'pronounced' :
                                      'subtle'

  return buildArchitectureVideoPrompt({
    userPrompt:   args.customPrompt,
    sceneType:    scene ? sceneType : undefined,
    cameraMotion,
    intensity,
    fidelityMode: 'max',
  })
}
