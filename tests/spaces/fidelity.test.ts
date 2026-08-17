// tests/spaces/fidelity.test.ts
//
// Gate de fidelidade do Spaces (lib/spaces/fidelity):
//   - aplicabilidade OVERLAY por ação × referência (só onde comparação
//     borda-sobre-borda faz sentido);
//   - config por env com defaults conservadores e caps;
//   - limite relaxado pra ação material;
//   - ladder de tentativas compartilhado com o render_only.

import { describe, it, expect, afterEach } from 'vitest'
import {
  fidelityGateApplies,
  getSpacesFidelityConfig,
  minScoreForAction,
  getFidelityAttemptParams,
} from '@/lib/spaces/fidelity'

describe('aplicabilidade (regra OVERLAY)', () => {
  it('nova_vista a partir de print: aplica (o print é o enquadramento)', () => {
    expect(fidelityGateApplies('nova_vista', 'print')).toBe(true)
  })

  it('nova_vista de mestre/histórico: NÃO aplica (câmera se move por design)', () => {
    expect(fidelityGateApplies('nova_vista', 'vista_mestre')).toBe(false)
    expect(fidelityGateApplies('nova_vista', 'vista')).toBe(false)
  })

  it('luz e material aplicam com qualquer referência', () => {
    for (const ref of ['vista_mestre', 'print', 'vista'] as const) {
      expect(fidelityGateApplies('luz', ref)).toBe(true)
      expect(fidelityGateApplies('material', ref)).toBe(true)
    }
  })

  it('detalhe NUNCA aplica (crop fecha o enquadramento por design)', () => {
    for (const ref of ['vista_mestre', 'print', 'vista'] as const) {
      expect(fidelityGateApplies('detalhe', ref)).toBe(false)
    }
  })
})

describe('config por env', () => {
  const saved = {
    gate: process.env.SPACES_FIDELITY_GATE,
    min:  process.env.SPACES_FIDELITY_MIN_SCORE,
    max:  process.env.SPACES_FIDELITY_MAX_ATTEMPTS,
  }
  afterEach(() => {
    if (saved.gate === undefined) delete process.env.SPACES_FIDELITY_GATE
    else process.env.SPACES_FIDELITY_GATE = saved.gate
    if (saved.min === undefined) delete process.env.SPACES_FIDELITY_MIN_SCORE
    else process.env.SPACES_FIDELITY_MIN_SCORE = saved.min
    if (saved.max === undefined) delete process.env.SPACES_FIDELITY_MAX_ATTEMPTS
    else process.env.SPACES_FIDELITY_MAX_ATTEMPTS = saved.max
  })

  it('defaults: gate ligado, minScore 0.5, 2 tentativas, relax < 1', () => {
    delete process.env.SPACES_FIDELITY_GATE
    delete process.env.SPACES_FIDELITY_MIN_SCORE
    delete process.env.SPACES_FIDELITY_MAX_ATTEMPTS
    const cfg = getSpacesFidelityConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.minScore).toBe(0.5)
    expect(cfg.maxAttempts).toBe(2)
    expect(cfg.materialRelaxFactor).toBeLessThan(1)
  })

  it('SPACES_FIDELITY_GATE=0 desliga; envs ajustam limite e tentativas (cap 3)', () => {
    process.env.SPACES_FIDELITY_GATE = '0'
    process.env.SPACES_FIDELITY_MIN_SCORE = '0.65'
    process.env.SPACES_FIDELITY_MAX_ATTEMPTS = '7'
    const cfg = getSpacesFidelityConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.minScore).toBe(0.65)
    expect(cfg.maxAttempts).toBe(3)
  })

  it('valores inválidos caem nos defaults', () => {
    process.env.SPACES_FIDELITY_MIN_SCORE = 'abc'
    process.env.SPACES_FIDELITY_MAX_ATTEMPTS = '0'
    const cfg = getSpacesFidelityConfig()
    expect(cfg.minScore).toBe(0.5)
    expect(cfg.maxAttempts).toBe(2)
  })
})

describe('limite por ação', () => {
  it('material relaxa o limite; demais ações usam o limite cheio', () => {
    const cfg = { enabled: true, minScore: 0.5, maxAttempts: 2, materialRelaxFactor: 0.85 }
    expect(minScoreForAction(cfg, 'material')).toBeCloseTo(0.425)
    expect(minScoreForAction(cfg, 'luz')).toBe(0.5)
    expect(minScoreForAction(cfg, 'nova_vista')).toBe(0.5)
    expect(minScoreForAction(cfg, 'detalhe')).toBe(0.5)
  })
})

describe('ladder de tentativas (compartilhado com o render_only)', () => {
  it('temperatura fixa; edge map a partir da 2ª; escalada por condicionamento', () => {
    const a1 = getFidelityAttemptParams(1)
    const a2 = getFidelityAttemptParams(2)
    const a3 = getFidelityAttemptParams(3)
    expect(a1.useEdgeMap).toBe(false)
    expect(a2.useEdgeMap).toBe(true)
    expect(a3.useEdgeMap).toBe(true)
    // Guia do Gemini 3 + telemetria de prod: retries não derrubam mais a
    // temperatura — escalam mediaResolution (high → ultra_high) e seedOffset.
    expect(a2.temperature).toBe(a1.temperature)
    expect(a3.temperature).toBe(a2.temperature)
    expect(a2.mediaResolution).toBe('ultra_high')
    expect(a3.seedOffset).toBeGreaterThan(a2.seedOffset)
  })
})
