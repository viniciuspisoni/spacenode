import { describe, expect, it } from 'vitest'
import { buildFidelityPrompt, PRESERVE, type BriefingArquitetonico, type GenerateOptions, type RenderOnlyPromptOpts } from '@/lib/prompts'
import { promptWordCount, renderPromptMetadata } from '@/lib/ai/render-prompt-profile'
import type { RenderEngineId } from '@/lib/orion/config'

const base: GenerateOptions = {
  projectType: 'interior', segment: PRESERVE, environment: PRESERVE,
  lighting: PRESERVE, background: PRESERVE, sceneElements: [], geometryLock: 85,
}
const briefing: BriefingArquitetonico = {
  tipo_projeto: 'kitchen', geometria_principal: 'rectangular', volumes: 'one', pavimentos: 1,
  aberturas: 'two windows', materiais_aparentes: 'plain beige surfaces', camera: 'guessed 24mm camera',
  entorno: 'interior', elementos_preservar: ['cabinets'], elementos_melhorar: ['add marble'],
}
const engines: RenderEngineId[] = ['vega', 'pulsar', 'quasar', 'orion']

describe.each(engines)('%s render prompt contract', engine => {
  const build = (options: Partial<GenerateOptions> = {}, extra: RenderOnlyPromptOpts = {}, analysis?: BriefingArquitetonico) =>
    buildFidelityPrompt({ ...base, ...options }, 'maximum', analysis, { ...extra, engine })

  it('protects geometry and materials without assuming every input is a CAD viewport', () => {
    const prompt = build()
    expect(prompt).toContain('Image #1 is the source')
    expect(prompt).toContain('camera, perspective, framing, horizon, proportions and silhouette')
    expect(prompt).toContain('original count, position, shape and size')
    expect(prompt).toContain('Plain or ambiguous surfaces stay plain')
    expect(prompt).toContain('retain detail that is already photographic')
    expect(prompt).toContain('Where CAD outlines exist')
    expect(prompt).not.toMatch(/raw 3D|Canon|24mm|Hasselblad|subtle depth of field|STRICTLY AVOID|8K RAW/)
  })

  it('does not let an anchored refinement remove architecture or copy the wrong camera', () => {
    const prompt = build({ hasAnchor: true, refinementText: 'Use warmer light and remove the window.' })
    expect(prompt).toContain('Image #2 is the geometry and camera source')
    expect(prompt).toContain('image #2 determines geometry, framing and object placement')
    expect(prompt).toContain('Geometry and camera stay fixed even when a user direction requests a structural change')
    expect(prompt).toContain('Use warmer light and remove the window.')
    expect(prompt).not.toMatch(/Removing a window = solid wall|camera angle.*from image #1|pixel-by-pixel/)
    expect(prompt).not.toContain('an edge map')
    expect(prompt).not.toContain('depth map:')
  })

  it('keeps a requested material change local, with no blanket ban that cancels it', () => {
    const prompt = build({ materials: { piso: 'blue porcelain', fachada: 'brick', outros: 'Keep the curtains closed.' } }, {
      materialSamples: [{ field: 'piso', imageIndex: 2 }],
    })
    expect(prompt).toContain('flooring: blue porcelain')
    expect(prompt).toContain('image #2: exact product appearance for flooring only')
    expect(prompt).toContain('All unnamed surfaces retain their reference finish')
    expect(prompt).toContain('Keep the curtains closed.')
    expect(prompt).not.toContain('facade cladding: brick')
    expect(prompt).not.toContain('no recoloring, restaining, repainting')
  })

  it('does not interpret preserve choices or notes as a surface replacement', () => {
    const prompt = build({ materials: { piso: PRESERVE, paredes: '  ', outros: 'No light from the right.' } })
    expect(prompt).not.toContain('Requested surface changes:')
    expect(prompt).not.toContain(PRESERVE)
    expect(prompt).toContain('No light from the right.')
    expect(prompt).toContain('Explicit user constraints on sources, glare and reflections override generic lighting')
  })

  it('binds all auxiliary evidence to its actual index, including after an anchor', () => {
    const prompt = build({ hasAnchor: true }, {
      materialSamples: [{ field: 'bancadas', imageIndex: 3 }],
      materialRegionSheet: { imageIndex: 4, surfaces: ['cabinet fronts', 'floor'] },
      edgeMapImageIndex: 5, edgeMapNative: true, depthMapImageIndex: 6, attempt: 2,
      canvasContract: 'Keep the gray margins: left 16, right 16.',
    })
    expect(prompt).toContain('image #3: exact product appearance for countertops only')
    expect(prompt).toContain('ORIGINAL SURFACE CLOSE-UPS: image #4')
    expect(prompt).toContain('Image #5 is the exact hidden-line map')
    expect(prompt).toContain('Image #6 is the depth map')
    expect(prompt).toContain('Do not tile the crop')
    expect(prompt).toContain('Prioritize source alignment over embellishment')
    expect(prompt).toContain('Keep the gray margins: left 16, right 16.')
  })

  it('separates explicit fixture state from night atmosphere and legacy scene choices', () => {
    const prompt = build({ lighting: 'Noturna', fixtureLights: 'off', sceneElements: ['Luzes Acesas'] })
    expect(prompt).toContain('Keep all fixtures off')
    expect(prompt).toContain('Fixture state overrides generic atmosphere')
    expect(prompt).not.toContain('Turn on existing fixtures')
    expect(prompt).not.toContain('Requested scene additions:')
    expect(build({ sceneElements: ['Luzes Acesas'] })).toContain('Turn on existing fixtures only')
    expect(build()).toContain('Keep the on/off state of each existing fixture')
  })

  it('retains measured dimensions without importing a guessed lens or stale sun after relighting', () => {
    const options: Partial<GenerateOptions> = { modelFacts: {
      camera: { focalLengthMm: 35, twoPoint: true },
      room: { ceilingM: 2.6, widthM: 4 }, sun: { elevationDeg: 40 },
    } }
    const prompt = build(options, {}, briefing)
    expect(prompt).toContain('35mm lens')
    expect(prompt).toContain('floor-to-ceiling height 2.6 m')
    expect(prompt).toContain('Sun: elevation 40°')
    expect(prompt).not.toContain('guessed 24mm camera')
    expect(prompt).not.toContain('add marble')
    expect(prompt).not.toContain('from vision analysis — must remain identical')
    expect(build({ ...options, lighting: 'Noturna' }, {}, briefing)).not.toContain('Sun: elevation')
  })

  it('retains exterior additions without restyling existing architecture', () => {
    const prompt = build({ projectType: 'exterior', sceneElements: ['Pedestres'], materials: { fachada: 'white paint' } })
    expect(prompt).toContain('architectural exterior')
    expect(prompt).toContain('facade cladding: white paint')
    expect(prompt).toContain('Requested scene additions:')
    expect(prompt).toContain('without moving or replacing them or creating openings or fixtures')
    expect(prompt).not.toContain('Closed curtains')
  })
})

describe('model profiles and Seedream information budget', () => {
  it('uses four explicit profiles while keeping a legacy control', () => {
    const prompts = engines.map(engine => buildFidelityPrompt(base, 'maximum', undefined, { engine }))
    expect(new Set(prompts).size).toBe(4)
    const legacy = buildFidelityPrompt(base, 'maximum')
    expect(legacy).toContain('STRICTLY AVOID')
    expect(promptWordCount(prompts[2])).toBeLessThanOrEqual(600)
    expect(promptWordCount(prompts[2])).toBeLessThan(promptWordCount(legacy) / 2)
  })

  it('drops only verbose inferred observations to fit Seedream, keeping measured facts and user requests', () => {
    const prompt = buildFidelityPrompt({ ...base, refinementText: 'Preserve the exact blue paint.',
      modelFacts: { room: { ceilingM: 2.7 } }, materials: { piso: 'grey porcelain' },
    }, 'maximum', { ...briefing, entorno: 'uncertain surroundings '.repeat(600) }, {
      engine: 'quasar', edgeMapImageIndex: 2,
    })
    expect(promptWordCount(prompt)).toBeLessThanOrEqual(600)
    expect(prompt).not.toContain('uncertain surroundings')
    expect(prompt).toContain('Preserve the exact blue paint.')
    expect(prompt).toContain('flooring: grey porcelain')
    expect(prompt).toContain('floor-to-ceiling height 2.7 m')
    expect(prompt).toContain('Image #2 is an edge map')
  })

  it('reports an over-budget user request rather than silently cutting its final constraint', () => {
    const direction = 'Keep this exact material. '.repeat(150) + 'The right window must remain closed.'
    const prompt = buildFidelityPrompt({ ...base, refinementText: direction }, 'maximum', briefing, { engine: 'quasar' })
    expect(prompt).toContain(direction)
    expect(prompt).toContain('Return one continuous full-frame photograph')
    expect(renderPromptMetadata('quasar', prompt)).toMatchObject({ profile: 'seedream-pro', exceeds_recommended_words: true })
  })

  it('leaves balanced and creative consumers on their established contract', () => {
    for (const level of ['balanced', 'creative'] as const) {
      expect(buildFidelityPrompt(base, level, briefing, { engine: 'vega' })).toBe(buildFidelityPrompt(base, level, briefing))
    }
  })
})
