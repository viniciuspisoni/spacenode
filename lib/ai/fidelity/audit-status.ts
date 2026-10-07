export type RenderAuditStatus = 'pending' | 'completed' | 'unavailable' | 'not_requested'
export type PublicRenderAudit = { status: RenderAuditStatus; warning: boolean; materialsPassed: boolean }

/** Expose the outcome only, never provider logs, prompts or image URLs. */
export function publicRenderAudit(log: unknown): PublicRenderAudit {
  const fidelity = log && typeof log === 'object' ? (log as Record<string, unknown>).fidelity : null
  const value = fidelity && typeof fidelity === 'object' ? fidelity as Record<string, unknown> : {}
  const audit = value.semantic_audit && typeof value.semantic_audit === 'object'
    ? value.semantic_audit as Record<string, unknown> : null
  const status: RenderAuditStatus = audit ? 'completed'
    : value.semantic_audit_status === 'pending' ? 'pending'
    : value.semantic_audit_status === 'unavailable' ? 'unavailable'
    : value.semantic_audit_status === 'completed' ? 'unavailable' : 'not_requested'
  const warning = audit?.warning === true || audit?.material_changed === true ||
    audit?.material_review === 'changed' || audit?.material_review === 'uncertain' || audit?.material_review === 'unverified'
  return { status, warning, materialsPassed: !!audit && !warning && audit.material_review === 'passed' }
}
