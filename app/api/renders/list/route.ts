import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestAuthContext } from '@/lib/auth/request-user'
import { signRows } from '@/lib/storage/signed'
import { sanitizeRenderListRow, selectRenderList } from '@/lib/history/redact'

// GET /api/renders/list?cursor={ISO}
// Pagina o histórico em ordem desc por created_at. cursor = created_at do
// último render já carregado; retorna até PAGE_SIZE renders mais antigos.
// Sem cursor = primeira página (agora) — usado pelo plugin SketchUp.

const PAGE_SIZE = 60

export async function GET(req: NextRequest) {
  // Cookie (browser) ou Bearer (plugin SketchUp) — a query roda sob a RLS
  // do usuário nos dois modos.
  const { user, supabase } = await getRequestAuthContext(req)
  if (!user || !supabase) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const cursor = req.nextUrl.searchParams.get('cursor') ?? new Date().toISOString()
  if (isNaN(Date.parse(cursor))) {
    return NextResponse.json({ error: 'cursor inválido' }, { status: 400 })
  }

  // Projeção explícita + tradução de provider→label: mesma redação da página
  // do Histórico (lib/history/redact.ts) — o JSON vai direto ao browser.
  const { data, error } = await selectRenderList(supabase, user.id, { cursor, limit: PAGE_SIZE })

  if (error) {
    console.error('[GET /api/renders/list]', error)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  }

  // Assina input/output/preview (Supabase-hosted é assinado; FAL passa direto).
  const renders = await signRows(createAdminClient(), (data ?? []).map(sanitizeRenderListRow), ['input_url', 'output_url', 'preview_url'])
  return NextResponse.json({ renders, pageSize: PAGE_SIZE })
}
