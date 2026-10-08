import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MATERIAL_ANALYSIS_VERSION, buildMaterialInventoryBlock, hasCurrentMaterialAnalysis, normalizeMaterialInventory } from '@/lib/ai/material-inventory'
import { buildFidelityPrompt, type GenerateOptions } from '@/lib/prompts'
import { checkArchitecturalPreservation, parseCheck } from '@/lib/spaces/preserve-validate'
import { analyzeImage } from '@/lib/fidelity-engine'
import { geminiMultiVisionJson, geminiVisionJson } from '@/lib/gemini'

vi.mock('@/lib/gemini', () => ({ geminiVisionJson: vi.fn(), geminiMultiVisionJson: vi.fn() }))
const inventory = [{surface: 'cabinet fronts', appearance: 'plain pale beige, smooth', pattern: 'no visible grain', certainty: 'ambiguous' as const}]
const briefing = {
  tipo_projeto: 'bathroom', geometria_principal: 'rectangular', volumes: 'one', pavimentos: 1,
  aberturas: 'window', materiais_aparentes: 'plain surfaces', camera: 'low', entorno: 'interior',
  elementos_preservar: [], elementos_melhorar: [], material_analysis_version: MATERIAL_ANALYSIS_VERSION, material_inventory: inventory,
}
const options: GenerateOptions = {projectType: 'interior', segment: 'Residencial', environment: 'Banheiro',
  lighting: 'Preservar Original', background: 'Preservar Original', sceneElements: [], geometryLock: 85, materials: {}, fidelityMode: 'strict'}

beforeEach(() => vi.resetAllMocks())
describe('material inventory grounded in input', () => {
  it('rejects legacy and empty inventories as reusable material analyses', () => {
    expect(hasCurrentMaterialAnalysis({...briefing, material_analysis_version: undefined})).toBe(false)
    expect(hasCurrentMaterialAnalysis({...briefing, material_inventory: []})).toBe(false)
    expect(hasCurrentMaterialAnalysis({...briefing, material_inventory: [null]})).toBe(false)
    expect(hasCurrentMaterialAnalysis({...briefing, material_analysis_version: 1})).toBe(false)
    expect(hasCurrentMaterialAnalysis({...briefing, material_analysis_version: 2})).toBe(false)
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
  it('binds local evidence to its own image without displacing structural conditioning', () => {
    const prompt = buildFidelityPrompt(options, 'maximum', briefing, {
      materialRegionSheet: { imageIndex: 2, surfaces: ['cabinet fronts', 'floor'] }, edgeMapImageIndex: 3,
    })
    expect(prompt).toContain('ORIGINAL SURFACE CLOSE-UPS: image #2')
    expect(prompt).toContain('STRUCTURAL CONSTRAINT MAP: image #3')
    expect(buildFidelityPrompt(options, 'maximum', briefing)).not.toContain('ORIGINAL SURFACE CLOSE-UPS')
  })
  it('extracts the inventory in the existing vision call without a second request', async () => {
    vi.mocked(geminiVisionJson).mockResolvedValue(JSON.stringify(briefing))
    expect(await analyzeImage('https://example.com/input.png')).toMatchObject({material_analysis_version: MATERIAL_ANALYSIS_VERSION, material_inventory: inventory})
    expect(geminiVisionJson).toHaveBeenCalledTimes(1)
    const prompt = vi.mocked(geminiVisionJson).mock.calls[0][0].user
    expect(prompt).toContain('não deduza madeira por ser armário')
    expect(prompt).toContain('AMOSTRA INTERNA')
    expect(prompt).toContain('sem tapetes, móveis, objetos vizinhos')
    expect(prompt).toContain('não autorizam chamar uma superfície cinza de marrom')
  })
  it('does not mark failed vision as a current material analysis', async () => {
    vi.mocked(geminiVisionJson).mockRejectedValue(new Error('unavailable'))
    expect(hasCurrentMaterialAnalysis(await analyzeImage('https://example.com/input.png'))).toBe(false)
  })
})
describe('material drift cannot hide behind geometry score', () => {
  it('warns when a local changed verdict contradicts a high global score and false flag', () => {
    const check = parseCheck(JSON.stringify({preserved: true, score: .95, material_changed: false,
      attributes: {materiais: .9}, material_checks: [{surface: 'floor', original: 'plain gray', generated: 'gray stone veins', verdict: 'changed'}]}), ['floor'])
    expect(check.warning).toBe(true)
    expect(check.material_changed).toBe(true)
    expect(check.material_review).toBe('changed')
  })
  it('does not pass a required local review that is missing, uncertain or incomplete', () => {
    const healthy = {preserved: true, score: .95, material_changed: false, attributes: {materiais: .9}}
    expect(parseCheck(JSON.stringify(healthy), ['floor']).material_review).toBe('unverified')
    expect(parseCheck(JSON.stringify(healthy), ['floor']).warning).toBe(true)
    const checks = [{surface: 'floor', original: 'gray', generated: 'gray', verdict: 'preserved'}]
    expect(parseCheck(JSON.stringify({...healthy, material_checks: checks}), ['floor', 'cabinet']).warning).toBe(true)
    expect(parseCheck(JSON.stringify({...healthy, material_checks: [{...checks[0], verdict: 'uncertain'}]}), ['floor']).material_review).toBe('uncertain')
    expect(parseCheck(JSON.stringify({...healthy, material_checks: checks}), ['floor']).warning).toBe(false)
  })
  it('discards malformed local verdicts and bounds evidence instead of trusting approval strings', () => {
    const check = parseCheck(JSON.stringify({preserved: true, score: .95, attributes: {materiais: .9},
      material_checks: [null, {surface: 'floor', original: 'gray', generated: 'gray', verdict: 'true'}]}), ['floor'])
    expect(check.material_checks).toEqual([])
    expect(check.warning).toBe(true)
  })
  it('grounds the existing audit in the original inventory without adding another vision call', async () => {
    vi.mocked(geminiMultiVisionJson).mockResolvedValue(JSON.stringify({preserved: true, score: .95, attributes: {materiais: .9}}))
    const check = await checkArchitecturalPreservation('https://example.com/source.png', 'https://example.com/result.png', 'STRICT_SOURCE_LOCK', {materialInventory: inventory})
    expect(vi.mocked(geminiMultiVisionJson)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(geminiMultiVisionJson).mock.calls[0][0].user).toContain('cabinet fronts')
    expect(check?.material_review).toBe('unverified')
  })
  it('warns when materials fail despite preserved geometry and high overall score', () => {
    const check = parseCheck(JSON.stringify({preserved: true, score: .98, attributes: {materiais: .4}, notes: 'wood invented'}))
    expect(check.warning).toBe(true)
    expect(check.attributes?.materiais).toBe(.4)
  })
  it('warns at the 0.7 material boundary observed in the live pilot', () => {
    const check = parseCheck(JSON.stringify({preserved: true, score: .9, attributes: {materiais: .7}}))
    expect(check.warning).toBe(true)
  })
  it('explicit material substitution warns even if the model assigns a high score', () => {
    const check = parseCheck(JSON.stringify({preserved: true, score: .98, material_changed: true, attributes: {materiais: .95}}))
    expect(check.warning).toBe(true)
    expect(check.material_changed).toBe(true)
  })
  it('uncertainty is retained without treating a string as confirmed evidence', () => {
    const check = parseCheck(JSON.stringify({preserved: true, score: .98, material_changed: 'true', attributes: {materiais: .95}}))
    expect(check.material_changed).toBeNull()
    expect(check.warning).toBe(false)
  })
  it('does not invent a material failure when the model omits its assessment', () => {
    expect(parseCheck(JSON.stringify({preserved: true, score: .98, attributes: {}})).warning).toBe(false)
    expect(parseCheck(JSON.stringify({preserved: true, score: .98, attributes: {materiais: .9}})).warning).toBe(false)
  })
})
