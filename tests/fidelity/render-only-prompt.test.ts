// tests/fidelity/render-only-prompt.test.ts
//
// Contrato do system prompt centralizado do modo render_only (Máxima):
//   - aplicado ANTES dos blocos derivados do usuário;
//   - nomeia todos os invariantes obrigatórios (geometria, câmera, paredes,
//     portas/janelas, marcenaria, mobiliário, bancadas, equipamentos,
//     proporções, layout/composição);
//   - proíbe adicionar/remover/mover/redimensionar;
//   - escalada só nos retries; edge map só quando anexado;
//   - balanced/creative intactos (redesign fora do render_only);
//   - ladder de parâmetros por tentativa + config por env.

import { describe, it, expect, afterEach } from 'vitest'
import {
  buildFidelityPrompt,
  buildNegativePromptForFidelity,
  type GenerateOptions,
} from '@/lib/prompts'
import {
  NEGATIVE_BASE,
  getFidelityAttemptParams,
  getRenderFidelityConfig,
} from '@/lib/ai/fidelity/render-only'

const baseOptions: GenerateOptions = {
  projectType: 'interior',
  segment: 'Residencial',
  environment: 'Cozinha',
  lighting: 'Preservar Original',
  background: 'Preservar Original',
  sceneElements: [],
  geometryLock: 85,
  materials: { piso: 'porcelanato cinza 90x90' },
  fidelityMode: 'strict',
  fidelityLevel: 'maximum',
  hasAnchor: false,
}

describe('render_only: system prompt antes do prompt do usuário', () => {
  it('contrato e locks precedem materiais do usuário', () => {
    const p = buildFidelityPrompt(baseOptions, 'maximum')
    const contract = p.indexOf('RENDER-ONLY MODE')
    const geoLock = p.indexOf('GEOMETRY LOCK')
    const userMaterials = p.indexOf('MATERIAL OVERRIDES')
    expect(contract).toBeGreaterThanOrEqual(0)
    expect(geoLock).toBeGreaterThanOrEqual(0)
    expect(userMaterials).toBeGreaterThanOrEqual(0)
    expect(contract).toBeLessThan(userMaterials)
    expect(geoLock).toBeLessThan(userMaterials)
  })

  it('contrato precede o refinamento do usuário (fluxo com âncora)', () => {
    const p = buildFidelityPrompt(
      { ...baseOptions, hasAnchor: true, refinementText: 'trocar só o piso' },
      'maximum',
    )
    const contract = p.indexOf('RENDER-ONLY MODE')
    const refinement = p.indexOf('USER REFINEMENT REQUEST')
    expect(refinement).toBeGreaterThanOrEqual(0)
    expect(contract).toBeLessThan(refinement)
  })
})

describe('render_only: invariantes obrigatórios', () => {
  const prompt = buildFidelityPrompt(baseOptions, 'maximum').toLowerCase()

  it.each([
    'camera position',
    'perspective',
    'wall',
    'door',
    'window',
    'cabinetry',
    'millwork',
    'furniture',
    'countertop',
    'equipment',
    'proportion',
    'layout',
    'composition',
  ])('cita "%s"', term => {
    expect(prompt).toContain(term)
  })

  it('proíbe adicionar/remover/mover/redimensionar', () => {
    expect(prompt).toContain('never add, remove, move or resize')
  })

  it('negativos cobrem mobiliário/marcenaria/bancadas/equipamentos', () => {
    const negative = buildNegativePromptForFidelity('maximum')
    expect(negative).toContain('no added, removed, relocated, rotated, rescaled or redesigned furniture')
    expect(negative).toContain('countertops')
    expect(negative).toContain('equipment')
  })
})

describe('render_only: escalada e condicionamento estrutural', () => {
  it('attempt 1 não tem escalada; attempt 2 tem', () => {
    const a1 = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 1 })
    const a2 = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 2 })
    expect(a1).not.toContain('ABSOLUTE STRUCTURAL PRIORITY')
    expect(a2).toContain('ABSOLUTE STRUCTURAL PRIORITY')
  })

  it('bloco do edge map só aparece com índice e cita a imagem certa', () => {
    const sem = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 2 })
    const com = buildFidelityPrompt(baseOptions, 'maximum', undefined, { attempt: 2, edgeMapImageIndex: 3 })
    expect(sem).not.toContain('STRUCTURAL CONSTRAINT MAP')
    expect(com).toContain('STRUCTURAL CONSTRAINT MAP')
    expect(com).toContain('image #3')
  })
})

describe('níveis balanced/creative seguem fora do render_only', () => {
  it.each(['balanced', 'creative'] as const)('%s não recebe contrato nem escalada', level => {
    const p = buildFidelityPrompt({ ...baseOptions, fidelityLevel: level }, level, undefined, {
      attempt: 2,
      edgeMapImageIndex: 3,
    })
    expect(p).not.toContain('RENDER-ONLY MODE')
    expect(p).not.toContain('ABSOLUTE STRUCTURAL PRIORITY')
    expect(p).not.toContain('STRUCTURAL CONSTRAINT MAP')
  })

  it('balanced mantém o negativo base sem os extras do render_only', () => {
    expect(buildNegativePromptForFidelity('balanced')).toBe(`AVOID: ${NEGATIVE_BASE.join(', ')}.`)
  })
})

describe('render_only: ladder de parâmetros', () => {
  it('temperatura não-crescente e edge map liga a partir da 2ª tentativa', () => {
    const a1 = getFidelityAttemptParams(1)
    const a2 = getFidelityAttemptParams(2)
    const a3 = getFidelityAttemptParams(3)
    expect(a1).toEqual({ temperature: 0.2, useEdgeMap: false })
    expect(a2).toEqual({ temperature: 0.05, useEdgeMap: true })
    expect(a3).toEqual({ temperature: 0, useEdgeMap: true })
    expect(a2.temperature).toBeLessThan(a1.temperature)
    expect(a3.temperature).toBeLessThanOrEqual(a2.temperature)
  })
})

describe('render_only: config por env', () => {
  const saved = {
    gate: process.env.RENDER_FIDELITY_GATE,
    min: process.env.RENDER_FIDELITY_MIN_SCORE,
    max: process.env.RENDER_FIDELITY_MAX_ATTEMPTS,
  }
  afterEach(() => {
    if (saved.gate === undefined) delete process.env.RENDER_FIDELITY_GATE
    else process.env.RENDER_FIDELITY_GATE = saved.gate
    if (saved.min === undefined) delete process.env.RENDER_FIDELITY_MIN_SCORE
    else process.env.RENDER_FIDELITY_MIN_SCORE = saved.min
    if (saved.max === undefined) delete process.env.RENDER_FIDELITY_MAX_ATTEMPTS
    else process.env.RENDER_FIDELITY_MAX_ATTEMPTS = saved.max
  })

  it('defaults: gate ligado, minScore 0.5, 2 tentativas', () => {
    delete process.env.RENDER_FIDELITY_GATE
    delete process.env.RENDER_FIDELITY_MIN_SCORE
    delete process.env.RENDER_FIDELITY_MAX_ATTEMPTS
    const cfg = getRenderFidelityConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.minScore).toBe(0.5)
    expect(cfg.maxAttempts).toBe(2)
    expect(cfg.refinementRelaxFactor).toBeLessThan(1)
  })

  it('RENDER_FIDELITY_GATE=0 desliga; envs ajustam limite e tentativas (cap 3)', () => {
    process.env.RENDER_FIDELITY_GATE = '0'
    process.env.RENDER_FIDELITY_MIN_SCORE = '0.72'
    process.env.RENDER_FIDELITY_MAX_ATTEMPTS = '9'
    const cfg = getRenderFidelityConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.minScore).toBe(0.72)
    expect(cfg.maxAttempts).toBe(3)
  })
})
