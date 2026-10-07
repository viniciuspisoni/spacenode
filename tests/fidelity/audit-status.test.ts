import { describe, expect, it } from 'vitest'
import { publicRenderAudit } from '@/lib/ai/fidelity/audit-status'

describe('public render audit outcome', () => {
  it('distinguishes pending, unavailable and skipped checks', () => {
    expect(publicRenderAudit({ fidelity: { semantic_audit_status: 'pending' } }).status).toBe('pending')
    expect(publicRenderAudit({ fidelity: { semantic_audit_status: 'unavailable' } }).status).toBe('unavailable')
    expect(publicRenderAudit(null)).toEqual({ status: 'not_requested', warning: false, materialsPassed: false })
    expect(publicRenderAudit({ fidelity: { semantic_audit_status: 'completed' } }).status).toBe('unavailable')
  })
  it('recognizes late and legacy audits without exposing their private contents', () => {
    const log = { prompt: 'private', fidelity: { semantic_audit_status: 'pending', semantic_audit: { warning: true, notes: 'private', material_review: 'changed' } } }
    expect(publicRenderAudit(log)).toEqual({ status: 'completed', warning: true, materialsPassed: false })
    expect(publicRenderAudit({ fidelity: { semantic_audit: { warning: false, material_review: 'passed' } } })).toEqual({ status: 'completed', warning: false, materialsPassed: true })
  })
  it.each(['changed', 'uncertain', 'unverified'])('never approves %s material evidence even with a false warning flag', material_review => {
    expect(publicRenderAudit({ fidelity: { semantic_audit: { warning: false, material_review } } })).toEqual({ status: 'completed', warning: true, materialsPassed: false })
  })
  it('does not call a geometry-only approval a material approval', () => {
    expect(publicRenderAudit({ fidelity: { semantic_audit: { preserved: true, warning: false, score: 1 } } }).materialsPassed).toBe(false)
  })
})
