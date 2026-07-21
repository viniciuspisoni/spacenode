import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { resolveMetricIdentifiers, upsertDailyMetrics } from '@/lib/marketing/ads/service'
import { parseMetricsCsv } from '@/lib/marketing/ads/csv'
import type { MetricUpsertRow } from '@/lib/marketing/ads/types'

// Importação de métricas diárias: body {rows: MetricUpsertRow[]} (já resolvidas
// por entity_id) OU {csv: string} (cabeçalho data,identificador,impressoes,
// cliques,investimento[,leads] — identificadores traduzidos para o nível certo).
// Resposta sempre {upserted, errors} — importação parcial é esperada.

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()

    if (typeof body.csv === 'string') {
      const parsed = parseMetricsCsv(body.csv)
      const resolved = await resolveMetricIdentifiers(gate.ctx.admin, parsed.rows)
      const errors = [...parsed.errors, ...resolved.errors].sort((a, b) => a.line - b.line)
      let upserted = 0
      if (resolved.rows.length > 0) {
        ({ upserted } = await upsertDailyMetrics(gate.ctx.admin, resolved.rows))
      }
      return NextResponse.json({ upserted, errors })
    }

    if (Array.isArray(body.rows)) {
      const { upserted } = await upsertDailyMetrics(gate.ctx.admin, body.rows as MetricUpsertRow[])
      return NextResponse.json({ upserted, errors: [] })
    }

    throw new Error('Envie rows (linhas resolvidas) ou csv (texto) para importar métricas')
  } catch (err) {
    return errorResponse(err)
  }
}
