import { describe, expect, it } from 'vitest'
import { buildFidelityPrompt, buildNegativePromptForFidelity } from '@/lib/prompts'
import {
  LINE_WORK_NEGATIVES,
  buildLineWorkBlock,
  buildPhotographicBlock,
} from '@/lib/ai/fidelity/render-only'

const BASE = {
  projectType: 'exterior' as const,
  segment: 'Preservar Original',
  environment: 'Preservar Original',
  lighting: 'Preservar Original',
  background: 'Preservar Original',
  sceneElements: [] as string[],
}

const prompt = (hasAnchor: boolean) =>
  buildFidelityPrompt({ ...BASE, hasAnchor } as Parameters<typeof buildFidelityPrompt>[0], 'maximum', undefined, {
    attempt: 1,
  })

describe('tradução do traço de CAD para fotografia', () => {
  it('entrada de CAD (sem âncora) recebe o bloco LINE WORK e a direção fotográfica', () => {
    const p = prompt(false)
    expect(p).toContain(buildLineWorkBlock())
    expect(p).toContain(buildPhotographicBlock('building'))
    // O ponto do bloco: a linha é convenção, o que ela delimita é físico.
    expect(p).toContain('DRAWING CONVENTION')
    expect(p).toContain('never by an outline')
  })

  it('o LINE WORK vem ANTES do geometry lock, que é quem manda preservar "every edge"', () => {
    const p = prompt(false)
    expect(p.indexOf(buildLineWorkBlock())).toBeLessThan(p.indexOf('GEOMETRY LOCK'))
  })

  it('com âncora (entrada já fotorrealista) nada disso entra', () => {
    const p = prompt(true)
    expect(p).not.toContain('DRAWING CONVENTION')
    expect(p).not.toContain('PHOTOGRAPHIC TRANSLATION')
    for (const n of LINE_WORK_NEGATIVES) expect(p).not.toContain(n)
  })

  it('os negativos de traço entram só sem âncora', () => {
    const semAncora = buildNegativePromptForFidelity('maximum', false)
    const comAncora = buildNegativePromptForFidelity('maximum', true)
    for (const n of LINE_WORK_NEGATIVES) {
      expect(semAncora).toContain(n)
      expect(comAncora).not.toContain(n)
    }
    // Os negativos que já existiam continuam nos dois.
    expect(comAncora).toContain('no warped proportions')
  })

  it('níveis relaxados não ganham o vetor de traço (são outro contrato)', () => {
    expect(buildNegativePromptForFidelity('balanced')).not.toContain('no line-art')
    expect(buildNegativePromptForFidelity('creative')).not.toContain('no line-art')
  })
})
