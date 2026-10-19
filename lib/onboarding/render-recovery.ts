import type { RenderFeedbackReason } from '@/lib/render-feedback'

export const RECOVERY_VERSION = '2026-10-19'
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export function recoveryReason(value: unknown): RenderFeedbackReason | null {
  return value === 'geometry' || value === 'materials' || value === 'lighting' || value === 'other' ? value : null
}
export interface RenderRecovery {
  renderId: string
  reason: RenderFeedbackReason
  inputUrl: string | null
  outputUrl: string
}
export function recoveryHref(renderId: string, reason: RenderFeedbackReason | null): string {
  return `/app/editar?${new URLSearchParams({ recovery: renderId, reason: reason ?? 'other', onboarding: '1' })}`
}

export const LIGHT_RECOVERY_OPTIONS = [
  { id: 'natural', label: 'Luz natural suave', instruction: 'Ajustar apenas a iluminação para uma luz natural suave e equilibrada.' },
  { id: 'bright', label: 'Clarear a cena', instruction: 'Clarear a iluminação da cena, recuperando detalhes nas sombras sem estourar as áreas claras.' },
  { id: 'soft', label: 'Suavizar luz excessiva', instruction: 'Suavizar a iluminação excessiva e reduzir o brilho nas áreas claras, mantendo detalhes visíveis.' },
  { id: 'warm', label: 'Luz mais acolhedora', instruction: 'Ajustar apenas a iluminação para uma atmosfera levemente mais quente e acolhedora.' },
] as const
const PRESERVE = ' Manter os materiais, os objetos, o enquadramento, as proporções e as aberturas do projeto.'
export function lightRecoveryInstruction(id: string): string {
  return (LIGHT_RECOVERY_OPTIONS.find(item => item.id === id) ?? LIGHT_RECOVERY_OPTIONS[0]).instruction + PRESERVE
}
export function materialRecoveryInstruction(target: string, material: string, hasSelection: boolean, hasReference: boolean): string | null {
  const where = target.trim().slice(0, 180) || (hasSelection ? 'área selecionada' : '')
  const what = material.trim().slice(0, 240)
  if (!where || (!what && !hasReference)) return null
  return `Trocar apenas o material de ${where} por ${what || 'o material da amostra de referência'}${hasReference && what ? ', usando a amostra de referência como apoio' : ''}. Manter o restante dos materiais, a iluminação, os objetos, o enquadramento, as proporções e as aberturas do projeto.`
}

/** Only Storage signatures are interchangeable; CDN query strings can change an image. */
export function recoveryImageKey(value: string): string {
  try {
    const url = new URL(value)
    if (/^\/storage\/v1\/object\/(sign|public|authenticated)\//.test(url.pathname)) {
      return `${url.origin}${url.pathname.replace(/\/object\/(sign|authenticated)\//, '/object/public/')}`
    }
    return url.href
  } catch { return value }
}
export interface RecoveryEditJob {
  id: string
  source_image_url: string
  result_image_url: string | null
  nodes_cost: number | null
  charged: boolean | null
}
/** Caller supplies only this owner's completed jobs. Reject unrelated edits and cycles. */
export function belongsToRecovery(outputUrl: string, jobs: RecoveryEditJob[], jobId: string): boolean {
  const root = recoveryImageKey(outputUrl)
  const visited = new Set<string>()
  let job = jobs.find(item => item.id === jobId)
  while (job && !visited.has(job.id)) {
    visited.add(job.id)
    const source = recoveryImageKey(job.source_image_url)
    if (source === root) return true
    job = jobs.find(item => item.result_image_url && recoveryImageKey(item.result_image_url) === source && !visited.has(item.id))
  }
  return false
}
