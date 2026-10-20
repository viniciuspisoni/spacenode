import { ONBOARDING_GOALS, type OnboardingGoal } from '@/lib/onboarding'
import { FIRST_IMAGE_MATERIAL_FIELDS, firstImageRecommendation, type FirstImageRecommendation } from '@/lib/onboarding/first-image'
import { PRESERVE, getLighting, type ProjectMaterials, type ProjectType } from '@/lib/prompts'

export const FIRST_IMAGE_PILOT_VERSION = '2026-10-20-v5'
export const PILOT_VARIANTS = ['grok', 'control'] as const
export type PilotVariant = typeof PILOT_VARIANTS[number]
export const PILOT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export interface PilotContext {
  projectType: ProjectType
  goal: OnboardingGoal | null
  referenceKind: 'model' | 'photo' | 'render'
  qa: boolean
}
export interface PilotTurn { role: 'user' | 'assistant'; text: string }
export interface PilotRequest {
  variant: PilotVariant; caseId: string; message: string; attachmentId: string
  context: PilotContext; history: PilotTurn[]
}
export interface PilotPreparation {
  goal: OnboardingGoal; lighting?: string; materialField?: keyof ProjectMaterials; material?: string
}
export interface PilotDecision {
  kind: 'prepare' | 'clarify' | 'edit'
  message: string
  goal: OnboardingGoal | null
  lighting: string | null
  materialField: keyof ProjectMaterials | null
  material: string | null
}
export interface PilotAnswer {
  text: string
  recommendation: FirstImageRecommendation | null
  receipt: string
  variant: PilotVariant
  modelLabel: string
  requestId: string
}

/** Local comparison only; configuration content is never sent to telemetry. */
export function pilotConfigurationKey(config: Omit<FirstImageRecommendation['config'], 'selectedEngine' | 'fixtureLights'> & { selectedEngine: string; fixtureLights: string }, materials: ProjectMaterials,
  refs: Partial<Record<keyof ProjectMaterials, string>>, direction: string): string {
  return JSON.stringify([config.projectType, config.segment, config.environment, config.lighting, config.fixtureLights,
    config.background, config.sceneElements, config.selectedEngine, config.selectedResolution,
    Object.entries(materials).sort(([a], [b]) => a.localeCompare(b)), Object.entries(refs).sort(([a], [b]) => a.localeCompare(b)), direction.trim()])
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** No provider, tool, URL, credential or arbitrary model can be selected by the browser. */
export function parsePilotRequest(value: unknown): PilotRequest | null {
  const b = object(value), c = object(b?.context)
  if (!b || !c || !PILOT_VARIANTS.includes(b.variant as PilotVariant) || typeof b.caseId !== 'string' || !PILOT_UUID.test(b.caseId) ||
    typeof b.message !== 'string' || !b.message.trim() || b.message.length > 900 ||
    typeof b.attachmentId !== 'string' || !/^[A-Za-z0-9_-]{60,1024}$/.test(b.attachmentId) ||
    !['interior', 'exterior'].includes(String(c.projectType)) || !['model', 'photo', 'render'].includes(String(c.referenceKind)) ||
    (c.goal !== null && !(typeof c.goal === 'string' && Object.hasOwn(ONBOARDING_GOALS, c.goal))) ||
    typeof c.qa !== 'boolean' || !Array.isArray(b.history) || b.history.length > 8) return null
  const history: PilotTurn[] = []
  for (const item of b.history) {
    const t = object(item)
    if (!t || !['user', 'assistant'].includes(String(t.role)) || typeof t.text !== 'string' || t.text.length > 1400) return null
    history.push({ role: t.role as PilotTurn['role'], text: t.text })
  }
  return { variant: b.variant as PilotVariant, caseId: b.caseId, message: b.message.trim(), attachmentId: b.attachmentId,
    context: { projectType: c.projectType as ProjectType, goal: c.goal as OnboardingGoal | null, referenceKind: c.referenceKind as PilotContext['referenceKind'], qa: c.qa }, history }
}

export function pilotPreparation(value: unknown, context: PilotContext): FirstImageRecommendation | null {
  const input = object(value)
  if (!input || context.referenceKind === 'render' || !Object.hasOwn(ONBOARDING_GOALS, String(input.goal)) ||
    Object.keys(input).some(k => !['goal', 'lighting', 'materialField', 'material'].includes(k))) return null
  if (context.goal && input.goal !== context.goal) return null
  if (input.lighting !== undefined && (typeof input.lighting !== 'string' || !getLighting(context.projectType, PRESERVE).includes(input.lighting))) return null
  if (input.material !== undefined && (typeof input.material !== 'string' || input.material.length > 400)) return null
  if (input.materialField !== undefined && !FIRST_IMAGE_MATERIAL_FIELDS[context.projectType].some(item => item.id === input.materialField)) return null
  return firstImageRecommendation({ projectType: context.projectType, goal: input.goal as OnboardingGoal,
    lighting: input.lighting as string | undefined, materialField: input.materialField as keyof ProjectMaterials | undefined, material: input.material as string | undefined })
}

export function pilotPreparationSchema(context: PilotContext) {
  return {
    type: 'object' as const, additionalProperties: false, required: ['goal'],
    properties: {
      goal: { type: 'string' as const, enum: context.goal ? [context.goal] : Object.keys(ONBOARDING_GOALS) },
      lighting: { type: 'string' as const, enum: getLighting(context.projectType, PRESERVE) },
      materialField: { type: 'string' as const, enum: FIRST_IMAGE_MATERIAL_FIELDS[context.projectType].map(item => item.id) },
      material: { type: 'string' as const, maxLength: 400 },
    },
  }
}

/** Every answer must declare its next step; an optional tool call cannot leave a ready request as chat only. */
export function pilotDecisionSchema(context: PilotContext) {
  return {
    type: 'object' as const, additionalProperties: false,
    required: ['kind', 'message', 'goal', 'lighting', 'materialField', 'material'],
    properties: {
      kind: { type: 'string' as const, enum: ['prepare', 'clarify', 'edit'] },
      message: { type: 'string' as const, maxLength: 900 },
      goal: { type: ['string', 'null'] as ('string' | 'null')[], enum: [...(context.goal ? [context.goal] : Object.keys(ONBOARDING_GOALS)), null] },
      lighting: { type: ['string', 'null'] as ('string' | 'null')[], enum: [...getLighting(context.projectType, PRESERVE), null] },
      materialField: { type: ['string', 'null'] as ('string' | 'null')[], enum: [...FIRST_IMAGE_MATERIAL_FIELDS[context.projectType].map(item => item.id), null] },
      material: { type: ['string', 'null'] as ('string' | 'null')[], maxLength: 400 },
    },
  }
}

export function parsePilotDecision(value: unknown, context: PilotContext): PilotDecision | null {
  const d = object(value)
  if (!d || Object.keys(d).length !== 6 || Object.keys(d).some(k => !['kind', 'message', 'goal', 'lighting', 'materialField', 'material'].includes(k)) ||
    !['prepare', 'clarify', 'edit'].includes(String(d.kind)) || typeof d.message !== 'string' || d.message.length > 900 ||
    (d.goal !== null && (typeof d.goal !== 'string' || !Object.hasOwn(ONBOARDING_GOALS, d.goal) || (context.goal && d.goal !== context.goal))) ||
    (d.lighting !== null && (typeof d.lighting !== 'string' || !getLighting(context.projectType, PRESERVE).includes(d.lighting))) ||
    (d.materialField !== null && !FIRST_IMAGE_MATERIAL_FIELDS[context.projectType].some(item => item.id === d.materialField)) ||
    (d.material !== null && (typeof d.material !== 'string' || d.material.length > 400))) return null
  return d as unknown as PilotDecision
}
