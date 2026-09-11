import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestAuthContext } from '@/lib/auth/request-user'
import { signRows } from '@/lib/storage/signed'
import { sanitizeRenderListRow, selectRenderList } from '@/lib/history/redact'
import { historyReadClient, requestedScope, resolveHistoryScope } from '@/lib/history/scope'

// GET /api/renders/list?cursor={ISO}
// Pagina o histórico em ordem desc por created_at. cursor = created_at do
// último render já carregado; retorna até PAGE_SIZE renders mais antigos.
// Sem cursor = primeira página (agora) — usado pelo plugin SketchUp.

const PAGE_SIZE = 60

export async function GET(req: NextRequest) {
  // Cookie (browser) ou Bearer (plugin SketchUp) — a query roda sob a RLS
  // do usuário nos dois modos, EXCETO no histórico de escritório (abaixo).
  const { user, supabase } = await getRequestAuthContext(req)
  if (!user || !supabase) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const cursor = req.nextUrl.searchParams.get('cursor') ?? new Date().toISOString()
  if (isNaN(Date.parse(cursor))) {
    return NextResponse.json({ error: 'cursor inválido' }, { status: 400 })
  }

  // ?scope=office: é esta rota que serve o "carregar mais" da grade do
  // Histórico, e a página pede escritório. Se a primeira página vem do
  // escritório e a segunda só das próprias, a grade some com a equipe ao rolar.
  // Sem o parâmetro (plugin SketchUp, modais de importação) segue pessoal.
  // Ver lib/history/scope.ts — em escopo de escritório a leitura vai de
  // service-role, com o filtro de escopo no lugar da RLS.
  const scope = await resolveHistoryScope(admin, user.id, requestedScope(req.nextUrl.searchParams))

  // Projeção explícita + tradução de provider→label: mesma redação da página
  // do Histórico (lib/history/redact.ts) — o JSON vai direto ao browser.
  const { data, error } = await selectRenderList(
    historyReadClient(scope, supabase, admin), scope, { cursor, limit: PAGE_SIZE },
  )

  if (error) {
    console.error('[GET /api/renders/list]', error)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  }

  // Assina input/output/preview (Supabase-hosted é assinado; FAL passa direto).
  const renders = await signRows(admin, (data ?? []).map(sanitizeRenderListRow), ['input_url', 'output_url', 'preview_url'])
  return NextResponse.json({ renders, pageSize: PAGE_SIZE })
}
