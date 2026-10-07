import { describe, expect, it } from 'vitest'
import { buildFidelityPrompt, getSurfaceMaterialOverrides, isMaterialPreservationRequest, PRESERVE, type GenerateOptions } from '@/lib/prompts'
import { parseCheck } from '@/lib/spaces/preserve-validate'

const base: GenerateOptions = {
  projectType: 'interior', segment: PRESERVE, environment: PRESERVE,
  lighting: PRESERVE, background: PRESERVE, sceneElements: [], geometryLock: 85,
  fidelityMode: 'strict',
}

describe('material preservation intent', () => {
  it.each([undefined, {}, { piso: PRESERVE }, { piso: ` ${PRESERVE} `, marcenaria: ' ' },
    { outros: 'Keep curtains closed. No light enters from the right.' }])('keeps preservation protections with %j', materials => {
    const options = { ...base, materials }
    expect(isMaterialPreservationRequest(options)).toBe(true)
    expect(getSurfaceMaterialOverrides(materials, 'interior')).toEqual({})
    const prompt = buildFidelityPrompt(options, 'maximum')
    expect(prompt).not.toContain('MATERIAL OVERRIDES')
    expect(prompt).toContain('Material identity is fixed by default')
  })

  it('does not let orphan exterior fields disable preservation of an interior', () => {
    const options = { ...base, materials: { fachada: 'brick', piso: PRESERVE } }
    expect(isMaterialPreservationRequest(options)).toBe(true)
    expect(buildFidelityPrompt(options, 'maximum')).not.toContain('facade cladding: brick')
  })

  it('does not let orphan interior fields disable preservation of an exterior', () => {
    const options: GenerateOptions = { ...base, projectType: 'exterior', materials: { marcenaria: 'oak', paredes: 'paint', fachada: PRESERVE } }
    expect(isMaterialPreservationRequest(options)).toBe(true)
    expect(getSurfaceMaterialOverrides(options.materials, 'exterior')).toEqual({})
  })

  it('keeps a real flooring change scoped while preserving the cabinetry and project notes', () => {
    const options = { ...base, materials: { piso: ' white porcelain ', marcenaria: PRESERVE, outros: 'Keep curtains closed.' } }
    expect(isMaterialPreservationRequest(options)).toBe(false)
    expect(getSurfaceMaterialOverrides(options.materials, 'interior')).toEqual({ piso: 'white porcelain' })
    const prompt = buildFidelityPrompt(options, 'maximum')
    expect(prompt).toContain('flooring: white porcelain')
    expect(prompt).not.toContain(`cabinetry and fitted furniture: ${PRESERVE}`)
    expect(prompt).toContain('Every surface NOT named in these overrides keeps the reference material')
    expect(prompt).toContain('USER PROJECT NOTES: "Keep curtains closed."')
  })

  it('keeps visual product samples and explicit refinements out of unmasked material preservation checks', () => {
    expect(isMaterialPreservationRequest(base, 1)).toBe(false)
    expect(isMaterialPreservationRequest({ ...base, refinementText: 'Replace only the cabinet finish' })).toBe(false)
    expect(isMaterialPreservationRequest({ ...base, refinementText: '  ' })).toBe(true)
  })

  it('rejects malformed material values without inserting them into the prompt', () => {
    const materials = { piso: 42, marcenaria: null } as unknown as GenerateOptions['materials']
    expect(getSurfaceMaterialOverrides(materials, 'interior')).toEqual({})
    expect(isMaterialPreservationRequest({ ...base, materials })).toBe(true)
  })
})

describe('surface-specific material regression cases (simulated audit responses)', () => {
  it.each([
    ['floor', 'plain dark gray matte tiles', 'gray stone veins'],
    ['cabinet', 'smooth pale painted fronts', 'horizontal wood grain'],
    ['countertop', 'existing small-scale stone veins', 'different large-scale marble veins'],
    ['metal frame', 'matte black metal', 'polished golden metal'],
  ])('flags %s substitutions despite a high geometry score and accepts unchanged evidence', (surface, original, generated) => {
    const response = { preserved: true, score: .99, attributes: { volumetria: 1, camera: 1, materiais: .99 }, material_changed: false }
    const changed = parseCheck(JSON.stringify({ ...response, material_checks: [{ surface, original, generated, verdict: 'changed' }] }), [surface])
    expect(changed.warning).toBe(true)
    expect(changed.material_review).toBe('changed')
    const unchanged = parseCheck(JSON.stringify({ ...response, material_checks: [{ surface, original, generated: original, verdict: 'preserved' }] }), [surface])
    expect(unchanged.warning).toBe(false)
    expect(unchanged.material_review).toBe('passed')
  })
})
