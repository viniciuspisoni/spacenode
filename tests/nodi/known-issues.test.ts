// Problemas conhecidos: as strings de erro reais do produto têm que mapear
// pro id certo — e erro desconhecido tem que virar null (encaminha chamado).

import { describe, expect, it } from 'vitest'
import { matchKnownIssue } from '@/lib/nodi/known-issues'

describe('matchKnownIssue', () => {
  const cases: [string, string][] = [
    ['Nodes insuficientes. Necessários: 40.', 'insufficient_balance'],
    ['Saldo insuficiente. Necessários 20 nodes.', 'insufficient_balance'],
    ['A geração demorou mais que o esperado. Tente novamente.', 'timeout'],
    ['Limite de requisições atingido. Aguarde alguns segundos.', 'rate_limit'],
    ['Parâmetros inválidos para o motor selecionado.', 'invalid_params'],
    ['aspect ratio must be between 0.4 and 2.5', 'invalid_params'],
    ['O Vertex filtrou o vídeo gerado (política de conteúdo). Ajuste a imagem ou a direção criativa.', 'content_policy'],
    ['A edição não produziu mudança perceptível na área selecionada. Você não foi cobrado.', 'quality_gate_no_change'],
    ['A edição não preservou bem a imagem, mesmo após uma nova tentativa automática. Você não foi cobrado.', 'quality_gate_not_preserved'],
    ['A seleção não corresponde à imagem atual. Refaça a seleção.', 'mask_mismatch'],
    ['Imagem muito grande para enviar.', 'upload_too_large'],
  ]

  it.each(cases)('"%s" → %s', (raw, expected) => {
    expect(matchKnownIssue(raw)?.id).toBe(expected)
  })

  it('erro desconhecido → null (vai de chamado)', () => {
    expect(matchKnownIssue('xyzzy: unmapped provider explosion')).toBeNull()
    expect(matchKnownIssue('', 'failed')).toBeNull()
    expect(matchKnownIssue(null, 'failed')).toBeNull()
  })

  it('todo problema conhecido tem causa, sugestão e prioridade', () => {
    for (const [raw] of cases) {
      const issue = matchKnownIssue(raw)!
      expect(issue.cause.length).toBeGreaterThan(20)
      expect(issue.suggestion.length).toBeGreaterThan(10)
      expect(['low', 'normal', 'high', 'urgent']).toContain(issue.priority)
    }
  })
})
