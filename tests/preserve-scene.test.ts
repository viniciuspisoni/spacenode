// "Preservar Original" em Segmento e Espaço.
//
// Antes de 10/09/2026 o default era Residencial + Sala de Estar, e isso
// ENTRAVA no prompt via buildSceneContextBlock mesmo para quem nunca abriu a
// folha de Cena — uma cozinha comercial enviada por um usuário que não mexeu
// em nada era descrita ao modelo como sala de estar residencial.
//
// Estes testes fixam as duas metades do contrato: preservado não descreve
// nada, e escolhido continua descrevendo. Se alguém reintroduzir um default
// que impõe, isto quebra.

import { describe, expect, it } from 'vitest'
import {
  PRESERVE, isPreserved,
  getSegments, getEnvironments, getLighting, getBackgrounds,
  buildFidelityPrompt,
  type GenerateOptions,
} from '@/lib/prompts'

const base: GenerateOptions = {
  projectType:   'interior',
  segment:       PRESERVE,
  environment:   PRESERVE,
  lighting:      PRESERVE,
  background:    PRESERVE,
  sceneElements: [],
  geometryLock:  85,
  materials:     undefined,
  fidelityMode:  'strict',
  fidelityLevel: 'maximum',
}

describe('catálogo: "Preservar Original" é a primeira opção dos quatro', () => {
  for (const pt of ['interior', 'exterior'] as const) {
    it(`${pt}: segmento`, () => {
      expect(getSegments(pt)[0]).toBe(PRESERVE)
    })
    it(`${pt}: espaço, com segmento preservado, só oferece preservar`, () => {
      expect(getEnvironments(pt, PRESERVE)).toEqual([PRESERVE])
    })
    it(`${pt}: espaço, com segmento escolhido, começa por preservar`, () => {
      const seg = getSegments(pt)[1]
      const envs = getEnvironments(pt, seg)
      expect(envs[0]).toBe(PRESERVE)
      expect(envs.length).toBeGreaterThan(1)
    })
    it(`${pt}: iluminação com segmento preservado não fica com uma opção só`, () => {
      const lights = getLighting(pt, PRESERVE)
      expect(lights[0]).toBe(PRESERVE)
      // O fallback antigo era ['Diurno'] — uma opção só, e que IMPÕE luz.
      expect(lights.length).toBeGreaterThan(3)
    })
    it(`${pt}: entorno/contexto`, () => {
      expect(getBackgrounds(pt)[0]).toBe(PRESERVE)
    })
  }
})

describe('isPreserved', () => {
  it('trata vazio e ausente como preservado', () => {
    expect(isPreserved(PRESERVE)).toBe(true)
    expect(isPreserved('')).toBe(true)
    expect(isPreserved(undefined)).toBe(true)
    expect(isPreserved(null)).toBe(true)
    expect(isPreserved('Residencial')).toBe(false)
  })
})

describe('prompt: preservado não descreve a cena', () => {
  it('não nomeia segmento nem espaço quando os dois estão preservados', () => {
    const p = buildFidelityPrompt(base)
    expect(p).not.toMatch(/residential/i)
    expect(p).not.toMatch(/living room/i)
    // E não vaza o rótulo em português para dentro de um prompt em inglês.
    expect(p).not.toMatch(/preservar original/i)
  })

  it('não deixa espaço duplo onde o segmento sairia', () => {
    const p = buildFidelityPrompt(base)
    expect(p).not.toMatch(/ {2}architectural/)
  })

  it('volta a descrever assim que o usuário escolhe', () => {
    const p = buildFidelityPrompt({ ...base, segment: 'Residencial', environment: 'Sala de Estar' })
    expect(p).toMatch(/residential/i)
    expect(p).toMatch(/living room/i)
  })

  it('descreve só o que foi escolhido — segmento sem espaço', () => {
    const p = buildFidelityPrompt({ ...base, segment: 'Gastronomia' })
    // SEG_EN['Gastronomia'] = 'upscale food and beverage'.
    expect(p).toMatch(/food and beverage/i)
    expect(p).not.toMatch(/living room/i)
  })
})

// O painel do SketchUp não escolhe default: ele pega o PRIMEIRO item de cada
// lista do catálogo (normalizeSelections em sketchup/spacenode/dialog.html —
// `segs[0]`, `(seg.environments||[])[0]`, `(seg.lighting||[])[0]`,
// `(pt.backgrounds||[])[0]`). É por isso que basta PRESERVE liderar os
// getters para o plugin herdar o mesmo default do web app, sem uma linha de
// Ruby ou de JS do painel. Este teste guarda esse acoplamento: se alguém
// reordenar as listas, o plugin volta a impor uma cena e ninguém percebe.
describe('plugin: o painel herda o default pegando o primeiro item', () => {
  for (const pt of ['interior', 'exterior'] as const) {
    it(`${pt}: normalizeSelections cairia em preservar nos quatro`, () => {
      const seg0 = getSegments(pt)[0]
      expect(seg0).toBe(PRESERVE)
      expect(getEnvironments(pt, seg0)[0]).toBe(PRESERVE)
      expect(getLighting(pt, seg0)[0]).toBe(PRESERVE)
      expect(getBackgrounds(pt)[0]).toBe(PRESERVE)
    })
  }
})
