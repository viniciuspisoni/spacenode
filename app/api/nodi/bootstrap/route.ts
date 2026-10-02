// GET /api/nodi/bootstrap?route=<pathname>
//
// Primeira carga do painel: contexto derivado + sugestões do módulo + índice
// do FAQ. Só títulos/ids — a resposta em si vem de /api/nodi/ask (a base de
// conhecimento mora no servidor; o client não embarca o conteúdo).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { capabilitiesFor, isNodiV2EnabledFor } from '@/lib/nodi/v2/flags'
import { deriveNodiContext } from '@/lib/nodi/context'
import { readRecentGenerations } from '@/lib/nodi/diagnostics'
import { getFaqIndex, getSuggestions } from '@/lib/nodi/knowledge'
import { computeNextBestAction } from '@/lib/nodi/v4/next-action'
import { computeJourney } from '@/lib/nodi/journey'
import { readSettings } from '@/lib/nodi/v4/settings'
import { getPayerBalance } from '@/lib/workspaces/balance'

export async function GET(req: Request) {
  if (!isNodiEnabled()) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const route = (url.searchParams.get('route') ?? '/app').slice(0, 200)
  const context = deriveNodiContext(route)

  // V2 (copiloto) por usuário: flag geral + gate de internos. O painel decide
  // o endpoint (chat V2 × ask V1) por estas capacidades — nunca por env no client.
  const admin = createAdminClient()
  const v2Allowed = await isNodiV2EnabledFor(admin, user)

  // V4: próxima melhor ação (determinística) + modo de autonomia do usuário.
  let nextAction = null
  let settings = null
  let journey = null
  if (v2Allowed) {
    settings = await readSettings(supabase, user.id)
    try {
      const [recent, payer] = await Promise.all([
        readRecentGenerations(supabase, user.id, 8),
        getPayerBalance(admin, user.id).catch(() => null),
      ])
      journey = computeJourney({ recent: recent.generations, available: recent.available,
        balance: payer?.totalBalance ?? null, multimodal: capabilitiesFor(v2Allowed).multimodal })
      nextAction = recent.available ? computeNextBestAction({
        recent: recent.generations,
        balance: payer?.totalBalance ?? null,
        moduleId: context.moduleId,
      }) : null
    } catch {} // sugestão é açúcar — nunca derruba o bootstrap
  }

  return NextResponse.json({
    moduleId: context.moduleId,
    moduleLabel: context.moduleLabel,
    suggestions: getSuggestions(context.moduleId, 3),
    faq: getFaqIndex(),
    capabilities: capabilitiesFor(v2Allowed),
    nextAction,
    journey,
    settings,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
