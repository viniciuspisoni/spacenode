import { NextResponse } from 'next/server'
import { staffOr404 } from '@/lib/marketing/api'
import { apiInventory } from '@/lib/costs/catalog'
import { validMonth } from '@/lib/costs/aggregate'

export async function POST(req: Request) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 })
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || !apiInventory().some(p => p.id === body.provider) ||
    typeof body.month !== 'string' || !validMonth(body.month) || !['USD', 'BRL'].includes(body.currency) ||
    typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0 || body.amount > 1_000_000 ||
    typeof body.note !== 'string' || body.note.length > 500) {
    return NextResponse.json({ error: 'Revise fornecedor, mês, moeda e valor da fatura.' }, { status: 400 })
  }
  const { error } = await gate.ctx.admin.from('api_cost_invoices').upsert({ provider: body.provider, month: `${body.month}-01`, currency: body.currency, amount: body.amount, note: body.note.trim(), updated_by: gate.ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: 'provider,month' })
  if (error) return NextResponse.json({ error: 'Não foi possível salvar a fatura. Verifique o schema de custos.' }, { status: 503 })
  return NextResponse.json({ saved: true }, { headers: { 'Cache-Control': 'private, no-store' } })
}
