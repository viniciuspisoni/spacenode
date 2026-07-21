// V4: modos de autonomia, limites do autopiloto, decisão pós-geração e
// próxima melhor ação — todo o miolo determinístico.

import { describe, expect, it } from 'vitest'
import { checkAutoAllowance, sanitizeSettings, DEFAULT_SETTINGS } from '@/lib/nodi/v4/settings'
import { decideNextStep } from '@/lib/nodi/v4/review'
import { computeNextBestAction } from '@/lib/nodi/v4/next-action'
import type { AnalysisReport } from '@/lib/nodi/v2/types'
import type { GenerationSummary } from '@/lib/nodi/types'

describe('sanitizeSettings', () => {
  it('lixo vira default; números são clampados', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    const s = sanitizeSettings({ mode: 'deus', maxNodesPerAction: 99999, maxNodesPerDay: -5, autoReview: 'sim' })
    expect(s.mode).toBe('copiloto')
    expect(s.maxNodesPerAction).toBe(1000)
    expect(s.maxNodesPerDay).toBe(0)
    expect(s.autoReview).toBe(true)
  })
})

describe('checkAutoAllowance (autopiloto nunca fura limite)', () => {
  const auto = { ...DEFAULT_SETTINGS, mode: 'autopiloto' as const, maxNodesPerAction: 40, maxNodesPerDay: 100 }
  it('dentro dos limites → permitido', () => {
    expect(checkAutoAllowance(auto, 40, 60).allowed).toBe(true)
  })
  it('acima do limite por ação → negado com motivo', () => {
    const r = checkAutoAllowance(auto, 41, 0)
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('limite por ação')
  })
  it('estouraria o dia → negado', () => {
    expect(checkAutoAllowance(auto, 40, 61).allowed).toBe(false)
  })
  it('copiloto/consultor nunca executam sozinhos', () => {
    expect(checkAutoAllowance({ ...auto, mode: 'copiloto' }, 1, 0).allowed).toBe(false)
    expect(checkAutoAllowance({ ...auto, mode: 'consultor' }, 1, 0).allowed).toBe(false)
  })
})

const report = (findings: AnalysisReport['findings'], blame?: AnalysisReport['blame']): AnalysisReport => ({
  subject: 'x', findings, summary: 's', blame,
})

describe('decideNextStep (não regenerar quando correção local basta)', () => {
  it('problema estrutural → regenerar', () => {
    expect(decideNextStep(report([{ dimension: 'geometria', severity: 'problema', note: 'n' }])).decision).toBe('regenerar')
  })
  it('problema só em materiais/iluminação → editar_local', () => {
    expect(decideNextStep(report([
      { dimension: 'materiais', severity: 'problema', note: 'n' },
      { dimension: 'iluminação', severity: 'atencao', note: 'n' },
    ])).decision).toBe('editar_local')
  })
  it('estrutural + local → decisão do usuário', () => {
    expect(decideNextStep(report([
      { dimension: 'perspectiva', severity: 'problema', note: 'n' },
      { dimension: 'materiais', severity: 'problema', note: 'n' },
    ])).decision).toBe('decidir')
  })
  it('só atenções (2+) → melhorar; limpo → aprovar', () => {
    expect(decideNextStep(report([
      { dimension: 'iluminação', severity: 'atencao', note: 'n' },
      { dimension: 'realismo', severity: 'atencao', note: 'n' },
    ])).decision).toBe('melhorar')
    expect(decideNextStep(report([{ dimension: 'geometria', severity: 'ok', note: 'n' }])).decision).toBe('aprovar')
  })
  it('culpa na entrada → regenerar (trocar a base)', () => {
    expect(decideNextStep(report([], 'entrada')).decision).toBe('regenerar')
  })
})

const gen = (over: Partial<GenerationSummary>): GenerationSummary => ({
  kind: 'render', id: 'g', tool: 'Renderizar', status: 'completed', createdAt: '2026-07-18T10:00:00Z', ...over,
})

describe('computeNextBestAction', () => {
  it('falha recente → diagnosticar (sem custo, sem aprovação)', () => {
    const a = computeNextBestAction({ recent: [gen({ status: 'failed' })], balance: 500, moduleId: null })!
    expect(a.kind).toBe('problem')
    expect(a.needsApproval).toBe(false)
  })
  it('saldo abaixo do mínimo → planos', () => {
    const a = computeNextBestAction({ recent: [], balance: 3, moduleId: null })!
    expect(a.href).toBe('/app/billing')
  })
  it('render concluída sem ampliação → sugerir Ampliar com custo', () => {
    const a = computeNextBestAction({ recent: [gen({})], balance: 500, moduleId: null })!
    expect(a.action).toContain('Ampliar')
    expect(a.estimatedNodes).toBeGreaterThan(0)
    expect(a.needsApproval).toBe(true)
  })
  it('já ampliou → sugerir vídeo', () => {
    const a = computeNextBestAction({
      recent: [gen({ kind: 'upscale', createdAt: '2026-07-18T11:00:00Z' }), gen({})],
      balance: 500, moduleId: null,
    })!
    expect(a.action).toContain('Animar')
  })
  it('conta nova → começar no Renderizar', () => {
    const a = computeNextBestAction({ recent: [], balance: 500, moduleId: null })!
    expect(a.href).toBe('/app/generate')
  })
})
