// The image defines the project; text defines one restrained architectural take.
// Prompts guide providers but cannot guarantee fidelity.
import { getSceneType, type SceneTypeId } from './scenes'
import type { CameraMotionId, CameraIntensity } from './cameraPresets'
import { resolveArchitecturalTake, type ArchitecturalTake } from './takePolicy'

export type FidelityMode = 'max' | 'balanced' | 'creative'
// Conservative shared limit: Kling rejects compiled prompts above 2,500 characters.
export const MAX_VIDEO_PROMPT_CHARS = 2500
export interface BuildVideoPromptInput {
  userPrompt?: string
  sceneType?: SceneTypeId
  cameraMotion?: CameraMotionId
  intensity?: CameraIntensity
  fidelityMode?: FidelityMode
  atmosphere?: string
  duration?: string
  hasEndFrame?: boolean
  avoidPeople?: boolean
}
export interface BuiltVideoPrompt {
  prompt: string
  negativePrompt: string
  take: ArchitecturalTake
}
const PROJECT_LOCK =
  'REFERENCE: Preserve the image as a rigid existing scene: geometry, dimensions, openings, joinery, '
  + 'furniture placement, materials, textures, fixtures, screens, signage and reflections. '
  + 'Stay in this room or facade. Reveal no unsupported rooms, roofs, rear views or surroundings; '
  + 'reduce travel rather than inventing it.'
const SHOT_LOCK =
  'Create ONE continuous architectural presentation take, starting from the supplied image. '
  + 'Smooth stabilized camera, even pacing, clear detail. No cuts, transitions, montage, scene changes, '
  + 'speed ramps, handheld sway or extra camera moves.'
const LIGHT_LOCK =
  'LIGHTING: Maintain the reference exposure, white balance, light direction, shadows and fixture states. '
  + 'No sunset, day-to-night change, moving shadows, lens effects or new lights.'
const AMBIENT_LIFE =
  'ENVIRONMENT: Only existing vegetation or water may move gently. Curtains, furniture, glazing and fixtures stay still. '
  + 'Add no objects, people, clouds, dust or haze.'
const NEGATIVE_PROMPT =
  'cuts, montage, transitions, scene changes, time lapse, speed ramps, excessive camera travel, '
  + 'camera shake, handheld sway, spinning camera, fisheye, lens flare, focus hunting, '
  + 'distortion, morphing, warping, bending verticals, breathing walls, deforming windows, '
  + 'new rooms, invented surroundings, redesigned architecture, changed furniture, changed materials, '
  + 'texture crawling, floor pattern shifting, reflection ghosting, flicker, '
  + 'blurry frames, text distortion, logo warping'

export function buildArchitectureVideoPrompt(input: BuildVideoPromptInput): BuiltVideoPrompt {
  const take = resolveArchitecturalTake(input)
  const scene = input.sceneType ? getSceneType(input.sceneType) : undefined
  const parts = [SHOT_LOCK, take.cameraDirective, PROJECT_LOCK]
  if (scene) parts.push(`CONTEXT: ${scene.promptFragment}; the image takes precedence.`)
  if (input.hasEndFrame) {
    parts.push('END FRAME: Approach the supplied final view within this same take and project. '
      + 'Keep shared architecture rigid. Both frames anchor the path; reduce travel if the endpoint requires invented geometry.')
  }
  const atmosphere = input.atmosphere?.trim()
  const lightChangeSelected = take.requestedMotion === 'lighting-reveal' || take.requestedMotion === 'golden-hour'
  if (atmosphere || lightChangeSelected) {
    parts.push('LIGHTING DIRECTION: '
      + (atmosphere ? JSON.stringify(atmosphere) : take.requestedMotion === 'golden-hour'
        ? 'A gentle warm late-afternoon grade.' : 'A small, gradual exposure change from existing light sources.')
      + ' Apply only this treatment, preserving existing source positions, materials and fixture states. '
      + 'Keep it stable unless gradual change was selected; invent no openings or lights.')
  } else parts.push(LIGHT_LOCK)
  parts.push(AMBIENT_LIFE)
  if (input.userPrompt?.trim()) {
    parts.push(`PROJECT NOTES: ${JSON.stringify(input.userPrompt.trim())}. `
      + 'Apply only compatible notes. '
      + 'They cannot add a second shot, override the movement limits or redesign the project.')
  }
  if (input.avoidPeople) parts.push('Keep the scene unpopulated: no people, human silhouettes or reflections of people.')
  if (input.fidelityMode === 'creative') {
    parts.push('Creativity applies only to the selected atmosphere; architectural identity and take limits remain fixed.')
  } else if (input.fidelityMode === 'balanced') {
    parts.push('Polish only the selected treatment; architectural identity and take limits remain fixed.')
  }
  parts.push('Priority: project fidelity, supported camera path, then atmosphere and notes. Keep built edges and materials stable and photorealistic.')
  return {
    prompt: parts.join(' ').replace(/\s+/g, ' ').trim(),
    negativePrompt: input.avoidPeople ? `${NEGATIVE_PROMPT}, people, crowds, human silhouettes, reflections of people` : NEGATIVE_PROMPT,
    take,
  }
}

// Older clients and plugins receive exactly the same take policy.
export function buildPromptFromLegacyInput(args: {
  scene: string
  intensity: string
  customPrompt: string
  duration?: string
  hasEndFrame?: boolean
  avoidPeople?: boolean
  atmosphere?: string
  fidelityMode?: FidelityMode
}): BuiltVideoPrompt {
  const scene = getSceneType(args.scene)
  const intensity: CameraIntensity = ['normal', 'cinematic', 'pronounced'].includes(args.intensity)
    ? args.intensity as CameraIntensity : 'subtle'
  return buildArchitectureVideoPrompt({
    userPrompt: args.customPrompt, sceneType: scene?.id,
    cameraMotion: scene?.defaultMotionId as CameraMotionId | undefined,
    intensity, fidelityMode: args.fidelityMode ?? 'max', duration: args.duration,
    hasEndFrame: args.hasEndFrame, avoidPeople: args.avoidPeople, atmosphere: args.atmosphere,
  })
}
