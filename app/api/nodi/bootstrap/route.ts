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
import { getFaqIndex, getSuggestions } from '@/lib/nodi/knowledge'

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
  const v2Allowed = await isNodiV2EnabledFor(createAdminClient(), user)

  return NextResponse.json({
    moduleId: context.moduleId,
    moduleLabel: context.moduleLabel,
    suggestions: getSuggestions(context.moduleId, 3),
    faq: getFaqIndex(),
    capabilities: capabilitiesFor(v2Allowed),
  })
}
