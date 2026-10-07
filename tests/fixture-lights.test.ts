import { describe, expect, it } from 'vitest'
import { buildFidelityPrompt, PRESERVE, type GenerateOptions } from '@/lib/prompts'
import { resolveFixtureLights } from '@/lib/ai/fixture-lights'

const base: GenerateOptions = {
  projectType: 'exterior', segment: PRESERVE, environment: PRESERVE,
  lighting: PRESERVE, background: PRESERVE, sceneElements: [], geometryLock: 85,
}

describe('fixture state independent of atmosphere', () => {
  for (const projectType of ['exterior', 'interior'] as const) {
    for (const hasAnchor of [false, true]) {
      it(`preserves fixtures at night: ${projectType}, anchor=${hasAnchor}`, () => {
        const prompt = buildFidelityPrompt({ ...base, projectType, hasAnchor, lighting: 'Noturna' })
        expect(prompt).toContain('Preserve the on/off state of EACH')
        expect(prompt).toContain('do not switch lights on automatically at dusk or night')
      })
      it(`turns existing fixtures on without a conflicting preservation lock: ${projectType}, anchor=${hasAnchor}`, () => {
        const prompt = buildFidelityPrompt({ ...base, projectType, hasAnchor, fixtureLights: 'on' })
        expect(prompt).toContain('Turn ON only the existing')
        expect(prompt).not.toContain('every fixture stays in the same on/off state')
        expect(prompt).not.toContain('Do not add or switch on')
      })
    }
  }
  it('off wins over a legacy lights-on scene element', () => {
    const prompt = buildFidelityPrompt({ ...base, fixtureLights: 'off', sceneElements: ['Luzes Acesas'], lighting: 'Noturna' })
    expect(prompt).toContain('Turn OFF all artificial light fixtures')
    expect(prompt).not.toContain('turn on the artificial light fixtures')
    expect(prompt).not.toContain('Turn ON')
  })
  it('migrates legacy choices and defaults malformed values safely', () => {
    expect(resolveFixtureLights(undefined, ['Luzes Acesas'])).toBe('on')
    expect(resolveFixtureLights('off', ['Luzes Acesas'])).toBe('off')
    expect(resolveFixtureLights('preserve', ['Luzes Acesas'])).toBe('preserve')
    expect(resolveFixtureLights('unexpected')).toBe('preserve')
  })
  for (const hasAnchor of [false, true]) {
    for (const attempt of [1, 2, 3]) {
      it(`requires a single photograph with auxiliary references: anchor=${hasAnchor}, attempt=${attempt}`, () => {
        const prompt = buildFidelityPrompt({ ...base, hasAnchor }, 'maximum', undefined, { attempt, edgeMapImageIndex: 2 })
        expect(prompt).toContain('ONE continuous full-frame photograph')
        expect(prompt).toContain('All auxiliary images are references only')
        expect(prompt).toContain('no collage, diptych, split-screen')
      })
    }
  }
})
