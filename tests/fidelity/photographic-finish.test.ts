import { describe, expect, it } from 'vitest'
import { buildFidelityPrompt, type GenerateOptions } from '@/lib/prompts'
import { buildPhotographicBlock, buildRenderOnlyCameraBlock } from '@/lib/ai/fidelity/render-only'

const source: GenerateOptions = {
  projectType: 'exterior', segment: 'Preservar Original', environment: 'Preservar Original',
  lighting: 'Preservar Original', background: 'Preservar Original', sceneElements: [],
  geometryLock: 85, fidelityMode: 'strict', materials: {}, hasAnchor: false,
}

describe('photographic finish stays inside the source scene', () => {
  it('keeps an unmodeled exterior neutral through both prompt directions', () => {
    const prompt = buildFidelityPrompt(source, 'maximum')
    expect(prompt).toContain('An empty or unmodeled background stays neutral')
    expect(prompt).not.toContain('believable vegetation and ground')
    expect(prompt).not.toContain('true-to-life sky and vegetation')
    expect(prompt).toContain('do not turn it into a landscape, garden, pool or neighboring building')
    expect(prompt).toContain('Existing sky and vegetation may become photographically lit')
  })

  it('retains explicit requested additions and material overrides', () => {
    const prompt = buildFidelityPrompt({ ...source, sceneElements: ['Pessoas'], materials: { fachada: 'matte white paint' } }, 'maximum')
    expect(prompt).toContain('Scene additions to include')
    expect(prompt).toContain('MATERIAL OVERRIDES')
    expect(prompt).toContain('matte white paint')
    expect(prompt).toContain('unless an explicit scene addition requests otherwise')
  })

  it('improves interior light response without asking for different surfaces', () => {
    const prompt = buildFidelityPrompt({ ...source, projectType: 'interior' }, 'maximum')
    expect(prompt).toContain('existing openings')
    expect(prompt).toContain('without clipped highlights, crushed shadows or exaggerated gloss')
    expect(prompt).toContain('Do not synthesize a new surface texture')
    expect(prompt).not.toContain('Outdoor:')
  })

  it('does not add mirrors or depth of field to manufacture a photographic look', () => {
    const camera = buildRenderOnlyCameraBlock(false)
    expect(camera).toContain('do not add mirrors, glazing or water')
    expect(camera).toContain('Preserve the reference framing and depth of field')
    expect(camera).not.toContain('subtle depth of field')
    expect(buildPhotographicBlock('building')).toContain('without changing their contours')
  })
})
