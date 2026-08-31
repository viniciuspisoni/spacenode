// Base de conhecimento do Nodi: matching determinístico + conteúdo dinâmico.
// Garante que perguntas recorrentes acham a entrada certa e que os números
// vêm das fontes de verdade (lib/engines, lib/plans, lib/lumens) — não de
// texto digitado na base.

import { describe, expect, it } from 'vitest'
import {
  KB_STRONG_SCORE,
  buildKbAnswer,
  getFaqIndex,
  getKbEntry,
  getSuggestions,
  matchKb,
  normalizeText,
} from '@/lib/nodi/knowledge'
import { ENGINES } from '@/lib/engines'
import { PLANS } from '@/lib/plans'
import { LUMEN_PACKS } from '@/lib/lumens'

describe('normalizeText', () => {
  it('remove acento, caixa e pontuação', () => {
    expect(normalizeText('Quánto CUSTA renderizar?!')).toBe('quanto custa renderizar')
  })
})

describe('matchKb', () => {
  const strongCases: [string, string][] = [
    ['quanto custa renderizar uma imagem?', 'custo-renderizar'],
    ['o que são nodes?', 'o-que-sao-nodes'],
    ['qual a diferença entre vega e pulsar?', 'engines-diferenca'],
    ['como falo com o suporte no whatsapp?', 'suporte-contato'],
    ['quais são os planos?', 'planos-precos'],
    ['onde encontro minhas gerações antigas?', 'historico-onde'],
    ['minha geração falhou, perdi os nodes?', 'geracao-falhou'],
    // formas reais de perguntar propósito (gap visto no teste do dono)
    ['pra que serve o finalizar?', 'finalizar-o-que'],
    ['para que serve o ampliar?', 'ampliar-o-que'],
    ['como funciona o animar?', 'animar-o-que'],
    ['o que faz o editar?', 'editar-como'],
    ['como funciona a edição?', 'editar-como'],
    ['quais ferramentas vocês oferecem?', 'ferramentas-overview'],
  ]

  it.each(strongCases)('"%s" → %s com score forte', (question, expectedId) => {
    const matches = matchKb(question, null)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].entry.id).toBe(expectedId)
    expect(matches[0].score).toBeGreaterThanOrEqual(KB_STRONG_SCORE)
  })

  it('módulo atual dá boost na entrada do módulo', () => {
    // a MESMA pergunta muda de resposta conforme onde o usuário está:
    expect(matchKb('quanto custa?', 'animar')[0]?.entry.id).toBe('custo-video')
    expect(matchKb('quanto custa?', 'renderizar')[0]?.entry.id).toBe('custo-renderizar')
    expect(matchKb('quanto custa?', 'editar')[0]?.entry.id).toBe('custo-editar')
    // sem módulo, cai na explicação geral de nodes
    expect(matchKb('quanto custa?', null)[0]?.entry.id).toBe('o-que-sao-nodes')
  })

  it('pergunta sem relação não devolve nada', () => {
    expect(matchKb('qual a capital da frança', null)).toHaveLength(0)
  })
})

describe('conteúdo dinâmico (fonte de verdade)', () => {
  it('custo do Renderizar reflete lib/engines', () => {
    const entry = getKbEntry('custo-renderizar')!
    const { text } = buildKbAnswer(entry)
    expect(text).toContain(`2K = ${ENGINES.vega.nodes['2k']} nodes`)
    expect(text).toContain(`4K = ${ENGINES.vega.nodes['4k']} nodes`)
    expect(text).toContain('Pulsar')
  })

  it('planos refletem lib/plans', () => {
    const entry = getKbEntry('planos-precos')!
    const { text } = buildKbAnswer(entry)
    for (const plan of PLANS) {
      expect(text).toContain(plan.name)
      expect(text).toContain(String(plan.monthlyPrice))
    }
    // regra de marca: não citar a quantidade de nodes de cortesia (não importável)
    expect(text).not.toMatch(/\b80 nodes\b/)
  })

  it('lumens refletem lib/lumens', () => {
    const entry = getKbEntry('lumens')!
    const { text } = buildKbAnswer(entry)
    for (const pack of LUMEN_PACKS) {
      expect(text).toContain(String(pack.price))
    }
  })

  it('toda entrada constrói resposta não vazia com ações válidas', () => {
    for (const faq of getFaqIndex()) {
      const entry = getKbEntry(faq.id)!
      const { text, actions } = buildKbAnswer(entry)
      expect(text.length).toBeGreaterThan(40)
      for (const a of actions) {
        expect(a.label.length).toBeGreaterThan(0)
        if (a.type === 'navigate') expect(a.href).toMatch(/^\//)
      }
    }
  })
})

describe('getSuggestions', () => {
  it('sugere entradas do módulo atual primeiro', () => {
    const ids = getSuggestions('renderizar', 3).map(s => s.id)
    expect(ids).toContain('custo-renderizar')
  })

  it('sem módulo, cai nas genéricas', () => {
    const out = getSuggestions(null, 3)
    expect(out.length).toBeGreaterThan(0)
  })
})
