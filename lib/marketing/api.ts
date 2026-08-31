// lib/marketing/api.ts
//
// Boilerplate comum das rotas /api/admin/marketing/*: gate de staff (404 para
// não-staff — o painel não anuncia a própria existência) e resposta de erro
// padronizada. Toda rota do namespace começa com staffOr404().

import { NextResponse } from 'next/server'
import { getMarketingStaffContext, type MarketingStaffContext } from './auth'

export type StaffGate =
  | { ok: true; ctx: MarketingStaffContext }
  | { ok: false; res: NextResponse }

export async function staffOr404(): Promise<StaffGate> {
  const ctx = await getMarketingStaffContext()
  if (!ctx) {
    return { ok: false, res: NextResponse.json({ error: 'Não encontrado' }, { status: 404 }) }
  }
  return { ok: true, ctx }
}

/** Erros de serviço viram 400 com a mensagem (são todos de validação/fluxo);
 *  o inesperado vira 500 sem vazar detalhe interno. */
export function errorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : ''
  if (message) {
    console.warn(`[admin/marketing] ${message}`)
    return NextResponse.json({ error: message }, { status: 400 })
  }
  console.error('[admin/marketing] erro inesperado', err)
  return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
}
