// Testes do parser de CSV de métricas diárias (lib/marketing/ads/csv.ts).
// Foco nos formatos reais de export/planilha pt-BR: separador ; ou ,, datas
// DD/MM/YYYY, dinheiro com "R$", vírgula decimal e ponto de MILHAR sem
// centavos ("2.500" é R$ 2.500,00 — nunca R$ 2,50).

import { describe, expect, it } from 'vitest'
import { parseMetricsCsv } from '@/lib/marketing/ads/csv'

const HEADER = 'data,identificador,impressoes,cliques,investimento,leads'
const ID = 'SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_VIDEO01_COPY01'

function single(line: string) {
  const result = parseMetricsCsv(`${HEADER}\n${line}`)
  expect(result.errors).toEqual([])
  expect(result.rows).toHaveLength(1)
  return result.rows[0]
}

describe('parseMetricsCsv — dinheiro (BRL → centavos)', () => {
  it('vírgula decimal com milhar: "R$ 1.234,56" → 123456', () => {
    expect(single(`2026-07-14,${ID},1000,50,"R$ 1.234,56",3`).spend_cents).toBe(123456)
  })

  it('ponto decimal sem milhar: "45.90" → 4590', () => {
    expect(single(`2026-07-14,${ID},1000,50,45.90,`).spend_cents).toBe(4590)
  })

  it('ponto de MILHAR sem centavos: "2.500" → 250000 (nunca 250)', () => {
    expect(single(`2026-07-14,${ID},1000,50,2.500,`).spend_cents).toBe(250000)
  })

  it('inteiro puro: "104" → 10400', () => {
    expect(single(`2026-07-14,${ID},1000,50,104,`).spend_cents).toBe(10400)
  })
})

describe('parseMetricsCsv — datas e cabeçalhos', () => {
  it('aceita DD/MM/YYYY e normaliza para YYYY-MM-DD', () => {
    expect(single(`14/07/2026,${ID},1000,50,10,`).metric_date).toBe('2026-07-14')
  })

  it('aceita cabeçalho em inglês e separador ;', () => {
    const csv = `date;identifier;impressions;clicks;spend;platform_leads\n2026-07-14;${ID};4310;57;104,50;3`
    const result = parseMetricsCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      metric_date: '2026-07-14',
      identifier: ID,
      impressions: 4310,
      clicks: 57,
      spend_cents: 10450,
      platform_leads: 3,
    })
  })

  it('linha inválida gera erro com o número da linha, sem derrubar as demais', () => {
    const csv = `${HEADER}\n2026-07-14,${ID},1000,50,10,\nlixo,,,x,,`
    const result = parseMetricsCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].line).toBe(3)
  })
})
