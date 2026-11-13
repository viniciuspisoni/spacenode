// Camera direction shared by UI, API and benchmark. Limits are prompt targets,
// not measured or guaranteed provider capabilities.
import type { CameraIntensity, CameraMotionId } from './cameraPresets'
import { getSceneType, type SceneTypeId } from './scenes'

export const ARCHITECTURAL_TAKE_VERSION = 'architectural-take-v1'
export interface ArchitecturalTakeInput {
  cameraMotion?: CameraMotionId
  sceneType?: SceneTypeId
  intensity?: CameraIntensity
  duration?: string
  hasEndFrame?: boolean
}
export interface ArchitecturalTake {
  version: typeof ARCHITECTURAL_TAKE_VERSION
  requestedMotion: CameraMotionId
  motionId: CameraMotionId
  intensity: CameraIntensity
  referenceMode: 'start' | 'start-end'
  framingBudgetPct: number
  angleBudgetDeg: number
  cameraDirective: string
  notes: string[]
}
const LOCAL_MOVEMENT: Record<CameraMotionId, string> = {
  'dolly-in-soft': 'a short straight dolly forward toward the existing visible focal point',
  'dolly-out-soft': 'a short straight dolly backward, retaining the visible composition',
  'lateral-tracking': 'a short straight lateral slide, parallel to the visible architecture',
  'orbit-soft': 'a shallow local arc around the visible focal point, keeping its visible front face in view',
  'vertical-pan': 'a small vertical tilt within the visible floor-to-ceiling or facade composition',
  'enter-room': 'a short straight forward approach to the visible room, stopping before its threshold',
  'facade-reveal': 'a small vertical rise along the already visible facade',
  'dolly-in-cinematic': 'a short straight dolly forward with a steady architectural composition',
  'drone-soft': 'a short stable elevated drift along the architecture visible in the supplied frames',
  'zoom-editorial': 'a small optical zoom toward an already visible detail, without camera translation',
  'parallax-subtle': 'a minimal straight lateral translation with gentle local parallax',
  'walkthrough-interior': 'a short straight forward move in the visible open space, stopping before any obstacle or threshold',
  'static-ambient': 'a locked-off tripod camera with zero translation, rotation or zoom',
  'horizontal-pan': 'a small horizontal rotation within the existing visible composition',
  'institutional-reveal': 'a short straight approach to the already visible reception or commercial space',
  'real-estate-soft': 'a short straight forward drift toward the existing visible architecture',
  'social-loop': 'a minimal lateral drift returning along the same path to the starting composition',
  'lighting-reveal': 'a locked-off tripod camera with zero translation, rotation or zoom',
  'golden-hour': 'a short straight lateral slide along the existing visible facade',
}
// A single image does not establish a route through rooms or an aerial view.
const SINGLE_IMAGE_ALTERNATIVES: Partial<Record<CameraMotionId, CameraMotionId>> = {
  'enter-room': 'dolly-in-soft', 'walkthrough-interior': 'dolly-in-soft', 'drone-soft': 'facade-reveal',
}
const FRAMING_BUDGET: Record<CameraIntensity, number> = { subtle: 2, normal: 3, cinematic: 4, pronounced: 5 }
const ANGLE_BUDGET: Record<CameraIntensity, number> = { subtle: 1, normal: 2, cinematic: 3, pronounced: 3 }

export function resolveArchitecturalTake(input: ArchitecturalTakeInput): ArchitecturalTake {
  const sceneMotion = getSceneType(input.sceneType ?? '')?.defaultMotionId as CameraMotionId | undefined
  const requestedMotion = input.cameraMotion ?? sceneMotion ?? 'dolly-in-soft'
  const motionId = input.hasEndFrame ? requestedMotion : SINGLE_IMAGE_ALTERNATIVES[requestedMotion] ?? requestedMotion
  const intensity = input.intensity ?? 'subtle'
  const fixed = motionId === 'static-ambient' || motionId === 'lighting-reveal'
  const framingBudgetPct = fixed ? 0 : FRAMING_BUDGET[intensity]
  const angleBudgetDeg = fixed ? 0 : ANGLE_BUDGET[intensity]
  const notes: string[] = []
  if (motionId !== requestedMotion) {
    notes.push('Com uma imagem, este movimento usa um deslocamento local para preservar o projeto. Nos motores que aceitam frame final, outra vista pode orientar a trajetória.')
  }
  if (input.hasEndFrame) {
    notes.push('Os frames inicial e final orientam o take; áreas intermediárias ainda precisam ser conferidas no resultado.')
  }
  const duration = Number(input.duration)
  const timing = Number.isFinite(duration) && duration > 0
    ? `Spread this same small movement evenly over the full ${duration}-second clip; a longer clip slows the movement rather than extending the travel.`
    : 'Spread this same small movement evenly over the entire clip.'
  const bounds = fixed
    ? 'Hold the starting composition, lens, focus and camera height exactly fixed for the entire clip. Only subtle motion of existing vegetation or water may remain visible.'
    : `Target a total framing change of at most ${framingBudgetPct}% of the frame and a local angle change of at most ${angleBudgetDeg} degrees across the entire clip. ${timing} `
      + 'Keep the horizon level, vertical lines straight and camera height steady, except for the explicitly selected vertical move. '
      + (motionId === 'zoom-editorial'
        ? 'Keep focus and camera position stable during the small selected zoom. '
        : 'Keep focal length, field of view and focus stable; use no zoom or focus pull. ')
      + 'Stop before furniture, walls, glass, doors or thresholds; keep the visible focal point in frame.'
  return {
    version: ARCHITECTURAL_TAKE_VERSION, requestedMotion, motionId, intensity,
    referenceMode: input.hasEndFrame ? 'start-end' : 'start',
    framingBudgetPct, angleBudgetDeg, notes,
    cameraDirective: `CAMERA: ${LOCAL_MOVEMENT[motionId]}. ${bounds}`,
  }
}
