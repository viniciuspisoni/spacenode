// Parsing da análise multimodal: nada do modelo passa cru pro envelope —
// severidades fora do contrato caem em 'atencao', textos são clampados.

import { describe, expect, it } from 'vitest'
import { parseVisionReport } from '@/lib/nodi/v2/tools/vision-tools'

const VALID = JSON.stringify({
  resumo: 'Perspectiva coerente; sombras duras demais na fachada.',
  culpa: 'configuracao',
  achados: [
    { dimensao: 'iluminação', gravidade: 'problema', nota: 'sombra dura no beiral' },
    { dimensao: 'geometria', gravidade: 'ok', nota: 'linhas de fuga preservadas' },
    { dimensao: 'materiais', gravidade: 'exagerada', nota: 'textura do piso ampliada' }, // gravidade inválida
  ],
  preservado: ['volumetria', 'aberturas'],
  alterado: ['vegetação do fundo'],
  veredito: 'O resultado respeita o projeto; ajustar apenas a luz.',
})

describe('parseVisionReport', () => {
  it('normaliza um payload válido', () => {
    const report = parseVisionReport(VALID, 'Render · Vega', true)
    expect(report.subject).toBe('Render · Vega')
    expect(report.blame).toBe('configuracao')
    expect(report.findings).toHaveLength(3)
    expect(report.findings[2].severity).toBe('atencao') // inválida → atencao
    expect(report.comparison?.preserved).toContain('volumetria')
    expect(report.comparison?.verdict).toContain('respeita o projeto')
  })

  it('sem comparação quando compare=false', () => {
    const report = parseVisionReport(VALID, 'x', false)
    expect(report.comparison).toBeUndefined()
  })

  it('JSON inválido lança (a tool traduz em erro estruturado)', () => {
    expect(() => parseVisionReport('não é json', 'x', false)).toThrow()
  })

  it('culpa fora do contrato é descartada e achados são limitados', () => {
    const junk = JSON.stringify({
      resumo: 'r', culpa: 'usuario_burro',
      achados: Array.from({ length: 30 }, (_, i) => ({ dimensao: `d${i}`, gravidade: 'ok', nota: 'n' })),
    })
    const report = parseVisionReport(junk, 'x', false)
    expect(report.blame).toBeUndefined()
    expect(report.findings.length).toBeLessThanOrEqual(12)
  })
})
