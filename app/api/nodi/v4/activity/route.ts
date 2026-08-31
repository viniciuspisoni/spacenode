// GET /api/nodi/v4/activity — registro simples e revisável das ações do Nodi
// (execuções, confirmações, memória, chamados) do PRÓPRIO usuário. nodi_events
// é deny-all no browser; o admin lê aqui e devolve só campos sanitizados —
// nunca meta bruta além da whitelist.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { isNodiV2EnabledFor } from '@/lib/nodi/v2/flags'

const EVENTS = ['v3_executed', 'v2_action_confirmed', 'v2_memory_saved', 'ticket_created']

export async function GET() {
  if (!isNodiEnabled()) return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  if (!(await isNodiV2EnabledFor(admin, user))) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }

  const { data } = await admin
    .from('nodi_events')
    .select('event, module, meta, created_at')
    .eq('user_id', user.id)
    .in('event', EVENTS)
    .order('created_at', { ascending: false })
    .limit(20)

  const items = (data ?? []).map(row => {
    const meta = (row.meta ?? {}) as Record<string, unknown>
    return {
      event: row.event as string,
      at: row.created_at as string,
      module: (row.module as string | null) ?? null,
      kind: typeof meta.kind === 'string' ? meta.kind : null,
      cost: typeof meta.cost === 'number' ? meta.cost : null,
      auto: meta.auto === true,
      type: typeof meta.type === 'string' ? meta.type : null,
      category: typeof meta.category === 'string' ? meta.category : null,
    }
  })
  return NextResponse.json({ items })
}
