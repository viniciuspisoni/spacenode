import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildMaterialInventoryBlock, hasCurrentMaterialAnalysis, normalizeMaterialInventory } from '@/lib/ai/material-inventory'
import { buildFidelityPrompt, type GenerateOptions } from '@/lib/prompts'
import { parseCheck } from '@/lib/spaces/preserve-validate'
import { analyzeImage } from '@/lib/fidelity-engine'
import { geminiVisionJson } from '@/lib/gemini'

vi.mock('@/lib/gemini', () => ({ geminiVisionJson: vi.fn(), geminiMultiVisionJson: vi.fn() }))
const inventory = [{surface: 'cabinet fronts', appearance: 'plain pale beige, smooth', pattern: 'no visible grain', certainty: 'ambiguous' as const}]
const briefing = {
  tipo_projeto: 'bathroom', geometria_principal: 'rectangular', volumes: 'one', pavimentos: 1,
  aberturas: 'window', materiais_aparentes: 'plain surfaces', camera: 'low', entorno: 'interior',
  elementos_preservar: [], elementos_melhorar: [], material_analysis_version: 1, material_inventory: inventory,
}
const options: GenerateOptions = {projectType: 'interior', segment: 'Residencial', environment: 'Banheiro',
  lighting: 'Preservar Original', background: 'Preservar Original', sceneElements: [], geometryLock: 85, materials: {}, fidelityMode: 'strict'}

beforeEach(() => vi.resetAllMocks())
describe('material inventory grounded in input', () => {
  it('rejects legacy and empty inventories as reusable material analyses', () => {
    expect(hasCurrentMaterialAnalysis({...briefing, material_analysis_version: undefined})).toBe(false)
    expect(hasCurrentMaterialAnalysis({...briefing, material_inventory: []})).toBe(false)
    expect(hasCurrentMaterialAnalysis({...briefing, material_inventory: [null]})).toBe(false)
    expect(hasCurrentMaterialAnalysis(briefing)).toBe(true)
  })
  it('bounds malformed observations and treats missing certainty conservatively', () => {
    expect(normalizeMaterialInventory([null, {}, {surface: 'floor', appearance: 'gray', pattern: 42}]))
      .toEqual([{surface: 'floor', appearance: 'gray', pattern: '', certainty: 'ambiguous'}])
    const observations = normalizeMaterialInventory(Array(20).fill({surface: 'x'.repeat(300), appearance: 'plain\n gray'}))
    expect(observations).toHaveLength(12)
    expect(observations[0].surface).toHaveLength(160)
    expect(observations[0].appearance).toBe('plain  gray')
  })
  it('keeps ambiguity in the generated prompt and preserves explicit surface overrides', () => {
    const prompt = buildFidelityPrompt({...options, materials: {piso: 'porcelanato branco'}}, 'maximum', briefing)
    expect(prompt).toContain('"certainty":"ambiguous"')
    expect(prompt).toContain('Plain CAD colors are NOT evidence of wood')
    expect(prompt).toContain('original IMAGE overrides any mistaken label')
    expect(prompt).toContain('MATERIAL OVERRIDES')
    expect(prompt).toContain('porcelanato branco')
    expect(buildMaterialInventoryBlock(undefined)).toBe('')
  })
  it('extracts the inventory in the existing vision call without a second request', async () => {
    vi.mocked(geminiVisionJson).mockResolvedValue(JSON.stringify(briefing))
    expect(await analyzeImage('https://example.com/input.png')).toMatchObject({material_analysis_version: 1, material_inventory: inventory})
    expect(geminiVisionJson).toHaveBeenCalledTimes(1)
    expect(vi.mocked(geminiVisionJson).mock.calls[0][0].user).toContain('não deduza madeira por ser armário')
  })
  it('does not mark failed vision as a current material analysis', async () => {
    vi.mocked(geminiVisionJson).mockRejectedValue(new Error('unavailable'))
    expect(hasCurrentMaterialAnalysis(await analyzeImage('https://example.com/input.png'))).toBe(false)
  })
})
describe('material drift cannot hide behind geometry score', () => {
  it('warns when materials fail despite preserved geometry and high overall score', () => {
    const check = parseCheck(JSON.stringify({preserved: true, score: .98, attributes: {materiais: .4}, notes: 'wood invented'}))
    expect(check.warning).toBe(true)
    expect(check.attributes?.materiais).toBe(.4)
  })
  it('does not invent a material failure when the model omits its assessment', () => {
    expect(parseCheck(JSON.stringify({preserved: true, score: .98, attributes: {}})).warning).toBe(false)
    expect(parseCheck(JSON.stringify({preserved: true, score: .98, attributes: {materiais: .9}})).warning).toBe(false)
  })
})
