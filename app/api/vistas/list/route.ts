import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestAuthContext } from '@/lib/auth/request-user'
import { signRows } from '@/lib/storage/signed'
import { applyHistoryScope, historyReadClient, requestedScope, resolveHistoryScope, runScopedQuery } from '@/lib/history/scope'

// GET /api/vistas/list
//
// Aba "Vistas" do Histórico. Antes a aba consultava `vistas` DIRETO do browser
// (supabase client no VistasTabView), o que travava duas coisas de uma vez:
//
//   1. escopo — a RLS por user_id é o único filtro, então não havia como o
//      dono do escritório ver as vistas da equipe;
//   2. bucket privado — sem emissão server-side não há o que assinar, e a aba
//      dependia do proxy /api/media, que recusa chave fora do namespace de quem
//      pede (`${user.id}/`): a imagem do colega voltaria 403.
//
// Servindo daqui, os dois somem: o escopo decide as linhas e as URLs saem
// assinadas, igual renders e edições.
//
// Projeção explícita, pelo mesmo motivo das outras listas (lib/history/redact.ts):
// a aba só recebe o que a grid desenha — nada de prompt, dna ou uuid interno.

const PAGE_SIZE = 60

const VISTA_LIST_COLUMNS =
  'id, space_id, user_id, image_url, axis_label, quality, is_edited, created_at'

export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestAuthContext(req)
  if (!user || !supabase) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin  = createAdminClient()
  const scope  = await resolveHistoryScope(admin, user.id, requestedScope(req.nextUrl.searchParams))
  const readSb = historyReadClient(scope, supabase, admin)

  const { data, error } = await runScopedQuery(scope, s => applyHistoryScope(
    readSb.from('vistas').select(VISTA_LIST_COLUMNS),
    s,
  )
    .eq('status', 'completed')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE))

  if (error) {
    console.error('[GET /api/vistas/list]', error)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  }

  const vistas = await signRows(admin, (data ?? []) as Record<string, unknown>[], ['image_url'])
  return NextResponse.json({ vistas })
}
