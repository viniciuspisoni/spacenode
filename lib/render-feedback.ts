export const RENDER_FEEDBACK_REASONS = ['geometry', 'materials', 'lighting', 'other'] as const

export type RenderFeedbackReason = typeof RENDER_FEEDBACK_REASONS[number]

export interface RenderFeedbackInput {
  useful: boolean
  reason: RenderFeedbackReason | null
}

export function parseRenderFeedback(value: unknown): RenderFeedbackInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (Object.keys(body).some(key => key !== 'useful' && key !== 'reason')) return null
  if (typeof body.useful !== 'boolean') return null
  const reason = body.reason ?? null
  if (body.useful) return reason === null ? { useful: true, reason: null } : null
  return reason === null || RENDER_FEEDBACK_REASONS.some(item => item === reason)
    ? { useful: false, reason: reason as RenderFeedbackReason | null }
    : null
}
