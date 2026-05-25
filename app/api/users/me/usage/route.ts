// GET /api/users/me/usage — consumo dos últimos 7 dias + projeção simples.
// Lê da view node_usage_daily que combina renders + vistas.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const today = new Date()
  const days: { day: string; nodes: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    days.push({ day: d.toISOString().slice(0, 10), nodes: 0 })
  }

  const sinceISO = days[0].day

  const { data } = await supabase
    .from('node_usage_daily')
    .select('day, nodes')
    .eq('user_id', user.id)
    .gte('day', sinceISO)
    .order('day', { ascending: true })

  for (const row of data ?? []) {
    const ymd = (row.day as string).slice(0, 10)
    const tgt = days.find(d => d.day === ymd)
    if (tgt) tgt.nodes = (row.nodes as number) ?? 0
  }

  const total = days.reduce((s, d) => s + d.nodes, 0)
  const avgPerDay = total / 7

  return NextResponse.json({
    days,
    total_7d: total,
    avg_per_day: Number(avgPerDay.toFixed(1)),
  })
}
