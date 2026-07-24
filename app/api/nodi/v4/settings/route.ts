// /api/nodi/v4/settings — modo de autonomia do usuário (GET lê, POST salva).
// RLS garante o isolamento; o servidor revalida limites na execução, então
// mesmo um POST malicioso não compra autonomia acima do que checkAutoAllowance
// permite.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { isNodiV2EnabledFor } from '@/lib/nodi/v2/flags'
import { readSettings, saveSettings } from '@/lib/nodi/v4/settings'
import { logNodiEvent } from '@/lib/nodi/telemetry'

async function guard() {
  if (!isNodiEnabled()) return { error: NextResponse.json({ error: 'Não disponível' }, { status: 404 }) }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  const admin = createAdminClient()
  if (!(await isNodiV2EnabledFor(admin, user))) {
    return { error: NextResponse.json({ error: 'Não disponível' }, { status: 404 }) }
  }
  return { supabase, admin, user }
}

export async function GET() {
  const g = await guard()
  if ('error' in g) return g.error
  return NextResponse.json({ settings: await readSettings(g.supabase, g.user.id) })
}

export async function POST(req: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const rl = await rateLimit(g.admin, `nodi-settings:${g.user.id}`, 20, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas alterações em sequência.' }, { status: 429 })
  const body = await req.json().catch(() => null)
  try {
    const settings = await saveSettings(g.supabase, g.user.id, body)
    void logNodiEvent(g.admin, { userId: g.user.id, event: 'action_clicked', meta: { action: `mode:${settings.mode}` } })
    return NextResponse.json({ settings })
  } catch (err) {
    if ((err as Error)?.message === 'SETTINGS_UNAVAILABLE') {
      return NextResponse.json({ error: 'Configuração indisponível neste ambiente.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Não consegui salvar. Tente de novo.' }, { status: 500 })
  }
}
