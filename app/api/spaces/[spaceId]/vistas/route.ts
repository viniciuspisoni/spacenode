// GET /api/spaces/[spaceId]/vistas
//
// Lista as vistas de um Space com URLs assinadas — molde do /api/renders/list.
// Criada pro plugin SketchUp (a página web lê via server component), mas serve
// qualquer cliente autenticado; posse garantida pela RLS de `vistas`.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestAuthContext } from '@/lib/auth/request-user'
import { signRows } from '@/lib/storage/signed'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE_SIZE = 60

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  if (!UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  // Cookie (browser) ou Bearer (plugin SketchUp) — query sob a RLS do usuário.
  const { user, supabase } = await getRequestAuthContext(req)
  if (!user || !supabase) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('vistas')
    .select('id, space_id, image_url, engine, quality, axis, axis_value, axis_label, nodes_cost, status, batch_id, created_at')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (error) {
    console.error('[GET /api/spaces/vistas]', error)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  }

  const vistas = await signRows(createAdminClient(), data ?? [], ['image_url'])
  return NextResponse.json({ vistas, pageSize: PAGE_SIZE })
}
