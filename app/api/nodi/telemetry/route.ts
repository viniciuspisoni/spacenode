// POST /api/nodi/telemetry — eventos de uso do painel (client → servidor)
//
// Aceita SÓ eventos da whitelist e meta com chaves conhecidas (valores curtos)
// — texto livre não entra nem por engano (política em lib/nodi/telemetry).
// Resposta sempre 204: telemetria não tem erro visível pro usuário.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { isNodiEvent, logNodiEvent, sanitizeEventMeta } from '@/lib/nodi/telemetry'

export async function POST(req: Request) {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `nodi-telemetry:${user.id}`, 60, 60)
  if (rl.allowed) {
    const body = await req.json().catch(() => null) as {
      event?: unknown; route?: unknown; module?: unknown; meta?: unknown
    } | null
    if (body && isNodiEvent(body.event)) {
      void logNodiEvent(admin, {
        userId: user.id,
        event: body.event,
        route: typeof body.route === 'string' ? body.route : null,
        module: typeof body.module === 'string' ? body.module : null,
        meta: sanitizeEventMeta(body.meta),
      })
    }
  }
  return new NextResponse(null, { status: 204 })
}
