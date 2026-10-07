import { describe, expect, it } from 'vitest'
import { parseCheck } from '@/lib/spaces/preserve-validate'
import { publicRenderAudit } from '@/lib/ai/fidelity/audit-status'

const original = { surface: 'floor', original: 'plain gray', generated: 'plain gray', verdict: 'preserved' }
const healthy = { preserved: true, score: .99, material_changed: false, attributes: { materiais: .99 } }
const assess = (checks: unknown[]) => parseCheck(JSON.stringify({ ...healthy, material_checks: checks }), ['floor'])
const publicOutcome = (audit: ReturnType<typeof parseCheck>) => publicRenderAudit({ fidelity: { semantic_audit: audit } })

describe('material audit evidence integrity (simulated responses, no provider calls)', () => {
  it.each([
    null,
    { ...original, verdict: 'changed', generated: '' },
    { ...original, verdict: 'changed', original: null },
    { ...original, verdict: 'unexpected' },
    { ...original, surface: 42 },
  ])('does not approve a partial response containing invalid evidence %j', invalid => {
    const result = assess([original, invalid])
    expect(result.material_review).toBe('unverified')
    expect(result.warning).toBe(true)
    expect(publicOutcome(result).materialsPassed).toBe(false)
  })

  it('does not approve when bounded evidence would discard a changed surface', () => {
    const result = assess([...Array.from({ length: 12 }, (_, i) => ({ ...original, surface: i ? `wall ${i}` : 'floor' })),
      { ...original, surface: 'cabinet', generated: 'wood grain', verdict: 'changed' }])
    expect(result.material_checks).toHaveLength(12)
    expect(result.material_review).toBe('unverified')
    expect(result.warning).toBe(true)
    expect(publicOutcome(result).materialsPassed).toBe(false)
  })

  it.each(['not an array', { floor: original }])('does not approve malformed material_checks %j', material_checks => {
    const result = parseCheck(JSON.stringify({ ...healthy, material_checks }), ['floor'])
    expect(result.material_review).toBe('unverified')
    expect(publicOutcome(result).materialsPassed).toBe(false)
  })

  it('keeps an explicit changed verdict stronger than missing or invalid evidence', () => {
    const result = assess([null, { ...original, verdict: 'changed', generated: 'stone veins' }])
    expect(result.material_review).toBe('changed')
    expect(result.material_changed).toBe(true)
    expect(publicOutcome(result).warning).toBe(true)
  })

  it('keeps uncertainty stronger than incomplete evidence', () => {
    const result = assess([null, { ...original, verdict: 'uncertain' }])
    expect(result.material_review).toBe('uncertain')
    expect(publicOutcome(result).materialsPassed).toBe(false)
  })

  it('accepts complete evidence of legitimate lighting changes', () => {
    const result = assess([{ ...original, original: 'plain gray matte tiles in shadow', generated: 'same plain gray matte tiles, brighter lighting' }])
    expect(result.material_review).toBe('passed')
    expect(result.warning).toBe(false)
    expect(publicOutcome(result).materialsPassed).toBe(true)
  })

  it('does not confuse unchanged panel grooves with wood grain', () => {
    const result = parseCheck(JSON.stringify({ ...healthy, material_checks: [{ surface: 'cabinet', original: 'plain pale panels with geometric grooves', generated: 'same plain pale panels with grooves', verdict: 'preserved' }] }), ['cabinet'])
    expect(result.warning).toBe(false)
    expect(publicOutcome(result).materialsPassed).toBe(true)
  })
})
