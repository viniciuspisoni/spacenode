import { createHash } from 'node:crypto'
import type { EditV4Action } from '../types'
import { PALETTES, type Palette } from './policy'
export const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')
export class EconomicEditError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) { super(message); this.name = 'EconomicEditError' }
}
export interface Binding { sourceHash: string; maskHash: string; requestHash: string }
export interface EditPlan extends Binding {
  action: EditV4Action; target: string; instructionEn: string; preserve: string[]
  ambiguous: boolean; selectionCoversTarget: boolean; protectedExcluded: boolean
  operation: 'edit' | 'recolor_existing'; sameMaterial: boolean; finishCompatible: boolean
  palette: Palette | null; evidence: string
}
export interface JudgeVerdict extends Binding {
  candidateHash: string; requestApplied: boolean; correctTarget: boolean; geometryPreserved: boolean
  protectedPreserved: boolean; artifactFree: boolean; referenceFollowed: boolean | null
  uncertain: boolean; evidence: Record<string, string>
}
function obj(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new EconomicEditError('invalid_review', 'A análise ficou incompleta. Nenhum node foi consumido.')
  return x as Record<string, unknown>
}
function text(x: unknown): x is string { return typeof x === 'string' && x.trim().length > 0 }
function bindings(x: Record<string, unknown>, expected: Binding) {
  for (const k of ['sourceHash','maskHash','requestHash'] as const) {
    if (x[k] !== expected[k]) throw new EconomicEditError('stale_review', 'A análise não corresponde à imagem e à seleção atuais.')
  }
}
export function parsePlan(raw: unknown, expected: Binding, action: EditV4Action): EditPlan {
  const p = obj(raw); bindings(p, expected)
  const booleans = ['ambiguous','selectionCoversTarget','protectedExcluded','sameMaterial','finishCompatible']
  if (p.action !== action || booleans.some(k => typeof p[k] !== 'boolean') ||
      !text(p.target) || !text(p.instructionEn) || !text(p.evidence) ||
      !Array.isArray(p.preserve) || p.preserve.length === 0 || !p.preserve.every(text) ||
      !['edit','recolor_existing'].includes(String(p.operation)) ||
      !(p.palette === null || (typeof p.palette === 'string' && Object.hasOwn(PALETTES,p.palette)))) {
    throw new EconomicEditError('invalid_plan', 'Não foi possível interpretar a edição com segurança.')
  }
  if (p.ambiguous || !p.selectionCoversTarget || !p.protectedExcluded) {
    throw new EconomicEditError('selection_needs_review', 'Confira a seleção: cubra todo o alvo e exclua os objetos que devem permanecer.')
  }
  return p as unknown as EditPlan
}
export function localColorEligible(plan: EditPlan, referenceCount: number): boolean {
  return plan.action === 'swap_material' && plan.operation === 'recolor_existing' &&
    plan.sameMaterial && plan.finishCompatible && plan.palette !== null && referenceCount === 0
}
const CHECKS = ['requestApplied','correctTarget','geometryPreserved','protectedPreserved','artifactFree'] as const
export function parseVerdict(raw: unknown, expected: Binding & {candidateHash: string}, hasReference: boolean): JudgeVerdict {
  const v = obj(raw); bindings(v, expected)
  const evidence = obj(v.evidence)
  if (v.candidateHash !== expected.candidateHash || typeof v.uncertain !== 'boolean' ||
      CHECKS.some(k => typeof v[k] !== 'boolean' || !text(evidence[k])) ||
      (hasReference ? typeof v.referenceFollowed !== 'boolean' || !text(evidence.referenceFollowed) : v.referenceFollowed !== null)) {
    throw new EconomicEditError('invalid_verdict', 'A verificação visual ficou incompleta. Nenhum node foi consumido.')
  }
  return v as unknown as JudgeVerdict
}
export function requireApproved(v: JudgeVerdict, hasReference: boolean): void {
  if (v.uncertain || CHECKS.some(k => v[k] !== true) || (hasReference && v.referenceFollowed !== true)) {
    throw new EconomicEditError('visual_rejected', 'O resultado não passou na verificação visual. Nenhum node foi consumido.')
  }
}
