// Contrato de prompt do Estudar — trava as garantias de produto:
// estrutura preservada por default, mudança estrutural SÓ em reforma e só a
// descrita, máscara de preservação declarada com polaridade certa, escala
// opcional, variantes distintas e o disclaimer imutável.

import { describe, expect, it } from 'vitest'
import {
  buildEstudoPrompt,
  buildImageLabels,
  buildRefineImageLabels,
  buildRefinePrompt,
  buildScaleBlock,
} from '@/lib/estudar/prompt'
import {
  ESTUDO_DISCLAIMER,
  ESTUDO_VARIANTES,
  type EstudoBriefing,
} from '@/lib/estudar/types'

const baseBriefing: EstudoBriefing = {
  ambienteTipo: 'sala de estar',
  ambienteUso: 'família com duas crianças',
  estudoTipo: 'layout',
  itensObrigatorios: 'sofá pra 4 pessoas',
  estilo: 'contemporâneo quente',
  materiais: 'madeira clara',
  necessidades: 'circulação livre',
  orcamento: 'R$ 20 mil',
  mudancasEstruturais: '',
  instrucoes: '',
}

describe('buildEstudoPrompt — trava estrutural', () => {
  it('sempre inclui o STRUCTURE LOCK e, sem pedido explícito, proíbe mudança estrutural', () => {
    const p = buildEstudoPrompt({ briefing: baseBriefing, variante: 'essencial', hasPreserveMask: false, medida: null })
    expect(p).toContain('STRUCTURE LOCK')
    expect(p).toContain('camera position, perspective, framing')
    expect(p).toContain('every door, window and opening')
    expect(p).toContain('No structural change of any kind was requested: make none.')
    expect(p).not.toContain('EXPLICITLY REQUESTED STRUCTURAL CHANGES')
  })

  it('reforma com mudanças descritas libera SÓ as listadas', () => {
    const p = buildEstudoPrompt({
      briefing: { ...baseBriefing, estudoTipo: 'reforma', mudancasEstruturais: 'abrir a parede da cozinha' },
      variante: 'completa',
      hasPreserveMask: false,
      medida: null,
    })
    expect(p).toContain('EXPLICITLY REQUESTED STRUCTURAL CHANGES')
    expect(p).toContain('"abrir a parede da cozinha"')
    expect(p).not.toContain('make none')
  })

  it('mudança estrutural preenchida fora da reforma é IGNORADA (contrato: só quando solicitado)', () => {
    const p = buildEstudoPrompt({
      briefing: { ...baseBriefing, estudoTipo: 'layout', mudancasEstruturais: 'derrubar parede' },
      variante: 'equilibrada',
      hasPreserveMask: false,
      medida: null,
    })
    expect(p).not.toContain('derrubar parede')
    expect(p).toContain('make none')
  })
})

describe('buildEstudoPrompt — máscara de preservação', () => {
  it('com máscara: declara o mapa com BRANCO = preservar e rotula as 2 imagens', () => {
    const p = buildEstudoPrompt({ briefing: baseBriefing, variante: 'essencial', hasPreserveMask: true, medida: null })
    expect(p).toContain('PRESERVATION MAP')
    expect(p).toContain('WHITE marks elements')
    expect(buildImageLabels(true)).toHaveLength(2)
  })

  it('sem máscara: nenhuma menção a mapa e 1 rótulo só', () => {
    const p = buildEstudoPrompt({ briefing: baseBriefing, variante: 'essencial', hasPreserveMask: false, medida: null })
    expect(p).not.toContain('PRESERVATION MAP')
    expect(buildImageLabels(false)).toHaveLength(1)
  })
})

describe('buildEstudoPrompt — escala e briefing', () => {
  it('medida vira âncora de escala com valor formatado', () => {
    const p = buildEstudoPrompt({
      briefing: baseBriefing,
      variante: 'essencial',
      hasPreserveMask: false,
      medida: { descricao: 'largura da parede do fundo', valor: 320, unidade: 'cm' },
    })
    expect(p).toContain('REAL-WORLD SCALE REFERENCE')
    expect(p).toContain('320 cm')
  })

  it('sem medida não há bloco de escala; medida inválida também não', () => {
    const p = buildEstudoPrompt({ briefing: baseBriefing, variante: 'essencial', hasPreserveMask: false, medida: null })
    expect(p).not.toContain('SCALE REFERENCE')
    expect(buildScaleBlock({ descricao: '', valor: 320, unidade: 'cm' })).toBe('')
    expect(buildScaleBlock({ descricao: 'parede', valor: 0, unidade: 'm' })).toBe('')
  })

  it('campos do briefing entram entre aspas; vazios são omitidos', () => {
    const p = buildEstudoPrompt({
      briefing: { ...baseBriefing, estilo: '', orcamento: 'R$ 20 mil' },
      variante: 'essencial',
      hasPreserveMask: false,
      medida: null,
    })
    expect(p).toContain('"sala de estar"')
    expect(p).toContain('"R$ 20 mil"')
    expect(p).not.toContain('Desired style')
  })
})

describe('buildEstudoPrompt — variantes e escopos', () => {
  it('cada variante produz uma diretriz própria (3 prompts distintos)', () => {
    const prompts = ESTUDO_VARIANTES.map(v =>
      buildEstudoPrompt({ briefing: baseBriefing, variante: v, hasPreserveMask: false, medida: null }),
    )
    expect(new Set(prompts).size).toBe(3)
    expect(prompts[0]).toContain('ESSENTIAL')
    expect(prompts[1]).toContain('BALANCED')
    expect(prompts[2]).toContain('COMPLETE')
  })

  it('escopo acompanha o tipo de estudo', () => {
    const marcenaria = buildEstudoPrompt({
      briefing: { ...baseBriefing, estudoTipo: 'marcenaria' },
      variante: 'essencial', hasPreserveMask: false, medida: null,
    })
    const decoracao = buildEstudoPrompt({
      briefing: { ...baseBriefing, estudoTipo: 'decoracao' },
      variante: 'essencial', hasPreserveMask: false, medida: null,
    })
    expect(marcenaria).toContain('CUSTOM MILLWORK')
    expect(decoracao).toContain('DECORATION')
  })

  it('negativos e fecho fotográfico sempre presentes', () => {
    const p = buildEstudoPrompt({ briefing: baseBriefing, variante: 'completa', hasPreserveMask: true, medida: null })
    expect(p).toContain('STRICTLY AVOID')
    expect(p).toContain('same aspect ratio as the photograph')
  })
})

describe('buildRefinePrompt — refinamento localizado', () => {
  it('confina a mudança à região branca e trava o resto', () => {
    const p = buildRefinePrompt('troque o sofá por um de canto')
    expect(p).toContain('WHITE marks the ONLY region you may change')
    expect(p).toContain('"troque o sofá por um de canto"')
    expect(p).toContain('outside the white selection must remain identical')
    expect(buildRefineImageLabels()).toHaveLength(2)
  })
})

describe('disclaimer', () => {
  it('texto exato do aviso legal (exibido em briefing e resultados)', () => {
    expect(ESTUDO_DISCLAIMER).toBe(
      'Estudo preliminar para visualização. Não substitui projeto técnico ou executivo.',
    )
  })
})
