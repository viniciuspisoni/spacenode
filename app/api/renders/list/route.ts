import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RENDER_LIST_COLUMNS, sanitizeRenderListRow } from '@/lib/history/redact'

// GET /api/renders/list?cursor={ISO}
// Pagina o histórico em ordem desc por created_at. cursor = created_at do
// último render já carregado; retorna até PAGE_SIZE renders mais antigos.

const PAGE_SIZE = 60

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const cursor = req.nextUrl.searchParams.get('cursor')
  if (!cursor || isNaN(Date.parse(cursor))) {
    return NextResponse.json({ error: 'cursor inválido' }, { status: 400 })
  }

  // Projeção explícita + tradução de provider→label: mesma redação da página
  // do Histórico (lib/history/redact.ts) — o JSON vai direto ao browser.
  const { data, error } = await supabase
    .from('renders')
    .select(RENDER_LIST_COLUMNS)
    .eq('user_id', user.id)
    .lt('created_at', cursor)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (error) {
    console.error('[GET /api/renders/list]', error)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  }

  return NextResponse.json({ renders: (data ?? []).map(sanitizeRenderListRow), pageSize: PAGE_SIZE })
}
