import { DEFAULT_ENGINE, DEFAULT_RESOLUTION, getNodesCost } from '@/lib/engines'
import { PRESERVE, getLighting, type ProjectMaterials, type ProjectType } from '@/lib/prompts'
import { ONBOARDING_GOALS, type OnboardingGoal } from '@/lib/onboarding'

export const FIRST_IMAGE_VERSION = '2026-10-19-first-image'
export const FIRST_IMAGE_MATERIAL_FIELDS = {
  interior: [{ id: 'piso', label: 'Piso' }, { id: 'paredes', label: 'Paredes' }, { id: 'teto', label: 'Teto' }, { id: 'marcenaria', label: 'Marcenaria' }, { id: 'bancadas', label: 'Bancadas' }, { id: 'esquadrias', label: 'Portas e caixilhos' }],
  exterior: [{ id: 'fachada', label: 'Fachada' }, { id: 'piso', label: 'Piso externo' }, { id: 'esquadrias', label: 'Esquadrias' }],
} as const

export function recommendedLighting(type: ProjectType): string {
  const options = getLighting(type, PRESERVE)
  const preferred = type === 'interior' ? 'Natural Suave' : 'Diurno'
  return options.includes(preferred) ? preferred : options.find(item => item !== PRESERVE) ?? PRESERVE
}

/** Pure preview. Applying this object is an explicit, separate UI action. */
export function firstImageRecommendation(input: {
  projectType: ProjectType; goal: OnboardingGoal; lighting?: string
  materialField?: keyof ProjectMaterials; material?: string; hasMaterialReference?: boolean
}) {
  if (!Object.hasOwn(ONBOARDING_GOALS, input.goal) || !['interior', 'exterior'].includes(input.projectType)) return null
  const field = FIRST_IMAGE_MATERIAL_FIELDS[input.projectType].find(item => item.id === input.materialField)
  const material = input.material?.trim().slice(0, 4000) ?? ''
  if (input.goal === 'materials' && (!field || (!material && !input.hasMaterialReference))) return null
  const options = getLighting(input.projectType, PRESERVE)
  const light = input.goal === 'lighting'
    ? options.includes(input.lighting ?? '') ? input.lighting! : recommendedLighting(input.projectType)
    : PRESERVE
  return {
    goal: input.goal,
    config: {
      projectType: input.projectType, segment: PRESERVE, environment: PRESERVE,
      lighting: light, fixtureLights: 'preserve' as const, background: PRESERVE,
      sceneElements: [] as string[], selectedEngine: DEFAULT_ENGINE, selectedResolution: DEFAULT_RESOLUTION,
    },
    materialChange: input.goal === 'materials' && field && material ? { field: field.id, value: material } : null,
    nodeCost: getNodesCost(DEFAULT_ENGINE, DEFAULT_RESOLUTION),
  }
}
export type FirstImageRecommendation = NonNullable<ReturnType<typeof firstImageRecommendation>>

export interface ImageSize { width: number; height: number }
export interface ReferenceCrop { left: number; top: number; right: number; bottom: number }
export const FULL_REFERENCE: ReferenceCrop = { left: 0, top: 0, right: 1, bottom: 1 }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))

export function normalizeReferenceCrop(raw: ReferenceCrop, size: ImageSize): ReferenceCrop {
  const minW = Math.min(1, 64 / Math.max(1, size.width)), minH = Math.min(1, 64 / Math.max(1, size.height))
  const left = clamp(raw.left, 0, 1 - minW), top = clamp(raw.top, 0, 1 - minH)
  return { left, top, right: clamp(raw.right, left + minW, 1), bottom: clamp(raw.bottom, top + minH, 1) }
}
export function referenceCropPixels(raw: ReferenceCrop, size: ImageSize) {
  const crop = normalizeReferenceCrop(raw, size)
  const x = Math.floor(crop.left * size.width), y = Math.floor(crop.top * size.height)
  return { x, y, width: Math.max(1, Math.min(size.width, Math.ceil(crop.right * size.width)) - x), height: Math.max(1, Math.min(size.height, Math.ceil(crop.bottom * size.height)) - y) }
}
/** Advisory product heuristic, not a provider minimum or a quality verdict. */
export function smallReference(size: ImageSize): boolean {
  return Math.min(size.width, size.height) < 512 || Math.max(size.width, size.height) < 1024
}
export function cropExportAllowed(size: ImageSize): boolean {
  return Number.isInteger(size.width) && Number.isInteger(size.height) && size.width > 0 && size.height > 0 && size.width <= 16384 && size.height <= 16384 && size.width * size.height <= 40_000_000
}
