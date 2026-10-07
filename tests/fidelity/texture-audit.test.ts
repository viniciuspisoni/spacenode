import { describe, expect, it, vi } from 'vitest'
import { checkArchitecturalPreservation, parseCheck } from '@/lib/spaces/preserve-validate'
import { publicRenderAudit } from '@/lib/ai/fidelity/audit-status'
import { geminiMultiVisionJson } from '@/lib/gemini'

vi.mock('@/lib/gemini', () => ({ geminiMultiVisionJson: vi.fn() }))
const healthy = { preserved: true, score: 1, material_changed: false, attributes: { materiais: 1 } }
const check = { surface: 'Piso', original: 'Liso, cinza escuro, sem textura aparente', generated: 'Liso cinza, com novos reflexos', verdict: 'preserved' }
const assess = (item: object, required = true) => parseCheck(JSON.stringify({ ...healthy, material_checks: [item] }), ['Piso'], { requireTextureEvidence: required })
const texture = { original: 'smooth', generated: 'smooth', change: 'none' }

describe('texture evidence audit regression (offline, no paid provider calls)', () => {
  it.each([
    ['Liso, cinza escuro, sem textura aparente', 'Cinza escuro, com leve textura de concreto/cimento polido e reflexos'],
    ['Cinza claro, liso, sem textura aparente', 'Cinza claro, com textura de concreto/cimento aparente e veios sutis'],
    ['Madeira clara, sem textura aparente', 'Madeira clara, com veios e textura de madeira'],
  ])('vetoes contradictory approval from the Orion pilot: %s → %s', (original, generated) => {
    const result = assess({ ...check, original, generated }, false)
    expect(result.material_review).toBe('uncertain')
    expect(result.material_changed).toBeNull()
    expect(publicRenderAudit({ fidelity: { semantic_audit: result } }).materialsPassed).toBe(false)
  })

  it.each([
    { original: 'smooth', generated: 'patterned', change: 'none' },
    { original: 'patterned', generated: 'smooth', change: 'none' },
    { original: 'patterned', generated: 'patterned', change: 'changed' },
    { original: 'smooth', generated: 'patterned', change: 'added' },
  ])('texture evidence overrides a high score and contradictory preserved verdict: %j', texture => {
    const result = assess({ ...check, texture })
    expect(result.material_review).toBe('changed')
    expect(result.material_changed).toBe(true)
    expect(result.warning).toBe(true)
  })

  it.each([undefined, null, {}, { ...texture, change: 'false' }, { ...texture, original: true }])('new audits cannot pass missing or invalid texture evidence %j', texture => {
    const result = assess({ ...check, texture })
    expect(result.material_review).toBe('unverified')
    expect(result.warning).toBe(true)
  })

  it.each([
    'Mesmo piso liso, sem veios ou textura de concreto; iluminação mais forte',
    'Same smooth floor, no wood grain or stone veins; brighter reflections',
    'Liso cinza, novas sombras e reflexos',
    'Liso cinza, com juntas e sulcos geométricos existentes',
  ])('does not mistake lighting, geometry or negated patterns for invented texture: %s', generated => {
    expect(assess({ ...check, generated, texture }).material_review).toBe('passed')
  })

  it('does not silently approve prose contradictions even with all texture enums reporting none', () => {
    expect(assess({ ...check, generated: 'Cinza com veios sutis', texture }).material_review).toBe('uncertain')
  })

  it('keeps an explicitly unknown source uncertain, regardless of the global score', () => {
    expect(assess({ ...check, texture: { ...texture, original: 'unclear' } }).material_review).toBe('uncertain')
  })

  it('retains an explicit material change even when local texture evidence is incomplete', () => {
    const result = parseCheck(JSON.stringify({ ...healthy, material_changed: true, material_checks: [check] }), ['Piso'], { requireTextureEvidence: true })
    expect(result.material_changed).toBe(true)
    expect(result.warning).toBe(true)
  })

  it('accepts an existing pattern retained under changed lighting', () => {
    expect(assess({ ...check, original: 'Pedra com veios', generated: 'Mesma pedra com veios, reflexos mais fortes', texture: { original: 'patterned', generated: 'patterned', change: 'none' } }).material_review).toBe('passed')
  })

  it('requires surface and texture evidence in the production entry point even without an inventory', async () => {
    vi.mocked(geminiMultiVisionJson).mockResolvedValue(JSON.stringify(healthy))
    const result = await checkArchitecturalPreservation('https://example.com/source.png', 'https://example.com/render.png', 'STRICT_SOURCE_LOCK')
    expect(result?.material_review).toBe('unverified')
    expect(result?.warning).toBe(true)
    expect(geminiMultiVisionJson).toHaveBeenCalledTimes(1)
    expect(vi.mocked(geminiMultiVisionJson).mock.calls[0][0].user).toContain('smooth → patterned exige verdict changed')
  })
})
