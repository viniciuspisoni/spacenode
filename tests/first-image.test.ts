import { describe, expect, it } from 'vitest'
import { DEFAULT_ENGINE, DEFAULT_RESOLUTION, getNodesCost, isValidCombination } from '@/lib/engines'
import { PRESERVE, getLighting } from '@/lib/prompts'
import { FULL_REFERENCE, cropExportAllowed, firstImageRecommendation, normalizeReferenceCrop, referenceCropPixels, smallReference } from '@/lib/onboarding/first-image'

describe('primeira imagem: proposta explícita', () => {
  for (const projectType of ['interior', 'exterior'] as const) {
    it(`propõe uma combinação pública válida e o custo do catálogo para ${projectType}`, () => {
      const proposal = firstImageRecommendation({ projectType, goal: 'presentation' })!
      expect(isValidCombination(proposal.config.selectedEngine, proposal.config.selectedResolution)).toBe(true)
      expect(proposal.config.selectedEngine).toBe(DEFAULT_ENGINE)
      expect(proposal.config.selectedResolution).toBe(DEFAULT_RESOLUTION)
      expect(proposal.nodeCost).toBe(getNodesCost(DEFAULT_ENGINE, DEFAULT_RESOLUTION))
      expect(proposal.config).toMatchObject({ projectType, segment: PRESERVE, environment: PRESERVE, lighting: PRESERVE, background: PRESERVE, fixtureLights: 'preserve', sceneElements: [] })
      expect(proposal.materialChange).toBeNull()
    })
    it(`não inventa uma luz fora do catálogo de ${projectType}`, () => {
      const proposal = firstImageRecommendation({ projectType, goal: 'lighting', lighting: 'inventada' })!
      expect(getLighting(projectType, PRESERVE)).toContain(proposal.config.lighting)
      const choice = getLighting(projectType, PRESERVE).at(-1)!
      expect(firstImageRecommendation({ projectType, goal: 'lighting', lighting: choice })?.config.lighting).toBe(choice)
    })
  }
  it('só prepara materiais com superfície visível e descrição ou amostra', () => {
    expect(firstImageRecommendation({ projectType: 'interior', goal: 'materials', materialField: 'piso', material: ' ' })).toBeNull()
    expect(firstImageRecommendation({ projectType: 'exterior', goal: 'materials', materialField: 'teto', material: 'madeira' })).toBeNull()
    expect(firstImageRecommendation({ projectType: 'interior', goal: 'materials', materialField: 'piso', hasMaterialReference: true })?.materialChange).toBeNull()
    expect(firstImageRecommendation({ projectType: 'interior', goal: 'materials', materialField: 'piso', material: '  bege fosco  ' })?.materialChange).toEqual({ field: 'piso', value: 'bege fosco' })
  })
  it('não aceita intenções desconhecidas', () => {
    expect(firstImageRecommendation({ projectType: 'interior', goal: 'inexistente' as 'presentation' })).toBeNull()
  })
  it('mantém a luz explícita ao revisar uma apresentação sem trocar o objetivo', () => {
    const proposal = firstImageRecommendation({ projectType: 'exterior', goal: 'presentation', lighting: 'Diurno' })!
    expect(proposal.goal).toBe('presentation')
    expect(proposal.config.lighting).toBe('Diurno')
    expect(firstImageRecommendation({ projectType: 'exterior', goal: 'presentation', lighting: 'inventada' })?.config.lighting).toBe(PRESERVE)
    expect(firstImageRecommendation({ projectType: 'exterior', goal: 'presentation' })?.config.lighting).toBe(PRESERVE)
  })
})

describe('recorte da referência em pixels nativos', () => {
  it('não muda a dimensão de uma imagem inteira, inclusive pequena', () => {
    for (const size of [{ width: 4097, height: 2305 }, { width: 32, height: 12 }]) expect(referenceCropPixels(FULL_REFERENCE, size)).toEqual({ x: 0, y: 0, ...size })
  })
  it('transforma recorte normalizado em coordenadas do arquivo, sem downscale', () => {
    expect(referenceCropPixels({ left: .1, top: .2, right: .9, bottom: .8 }, { width: 4000, height: 2000 })).toEqual({ x: 400, y: 400, width: 3200, height: 1200 })
    expect(referenceCropPixels({ left: .1, top: .2, right: .9, bottom: .8 }, { width: 4001, height: 2001 })).toEqual({ x: 400, y: 400, width: 3201, height: 1201 })
  })
  it('mantém regiões válidas nas bordas e em arrastes invertidos ou inválidos', () => {
    const size = { width: 4000, height: 2000 }
    for (const raw of [{ left: 2, top: -1, right: -2, bottom: 3 }, { left: NaN, top: Infinity, right: NaN, bottom: 0 }, { left: .99, top: .99, right: 1, bottom: 1 }]) {
      const crop = normalizeReferenceCrop(raw, size), pixels = referenceCropPixels(crop, size)
      expect(crop.left).toBeGreaterThanOrEqual(0); expect(crop.top).toBeGreaterThanOrEqual(0)
      expect(crop.right).toBeLessThanOrEqual(1); expect(crop.bottom).toBeLessThanOrEqual(1)
      expect(pixels.width).toBeGreaterThanOrEqual(64); expect(pixels.height).toBeGreaterThanOrEqual(64)
      expect(pixels.x + pixels.width).toBeLessThanOrEqual(size.width)
      expect(pixels.y + pixels.height).toBeLessThanOrEqual(size.height)
    }
  })
  it('separa recomendação de tamanho e limites de exportação no navegador', () => {
    expect(smallReference({ width: 1024, height: 512 })).toBe(false)
    expect(smallReference({ width: 1024, height: 511 })).toBe(true)
    expect(smallReference({ width: 900, height: 900 })).toBe(true)
    expect(cropExportAllowed({ width: 300, height: 200 })).toBe(true)
    expect(cropExportAllowed({ width: 8000, height: 5000 })).toBe(true)
    for (const size of [{ width: 0, height: 20 }, { width: 16400, height: 200 }, { width: 8000, height: 5001 }, { width: NaN, height: 100 }, { width: .5, height: 100 }]) expect(cropExportAllowed(size)).toBe(false)
  })
})
