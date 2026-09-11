import type { ComponentProps } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { sanitizeRenderListRow, selectRenderList } from '@/lib/history/redact'
import {
  applyHistoryScope,
  historyReadClient,
  resolveHistoryScope,
  runScopedQuery,
  scopeAuthorIds,
} from '@/lib/history/scope'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { signRows } from '@/lib/storage/signed'
import { HistoryClient } from './HistoryClient'

const PAGE_SIZE = 60

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()

  // ── Escopo ───────────────────────────────────────────────────────────────────
  // Pessoal por padrão; escritório inteiro quando quem abre é owner/admin de um
  // workspace 'office'. O escopo escolhe também o client de leitura: em
  // escritório a RLS por user_id não deixa passar a linha do colega, então a
  // leitura vai de service-role com o filtro de escopo no lugar da RLS.
  // Ver lib/history/scope.ts. O 'office' aqui é o PEDIDO desta tela — as outras
  // superfícies que usam as mesmas listagens (plugin SketchUp, modais de
  // importação) não pedem, e seguem pessoais.
  const scope  = await resolveHistoryScope(admin, user.id, 'office')
  const readSb = historyReadClient(scope, supabase, admin)

  const [balance, { data: renders }, { data: folders }] = await Promise.all([
    // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
    getPayerBalance(admin, user.id),
    // Projeção explícita + tradução de campos de provider: as linhas viram
    // props do client component (serializam no payload RSC) — nada de prompt
    // final, fal_request_id ou endpoints aqui. Ver lib/history/redact.ts
    // (selectRenderList tem fallback pra janela pré-migration do preview_url).
    selectRenderList(readSb, scope, { limit: PAGE_SIZE }),
    // parent_id: null = pasta de topo (cliente), preenchido = subpasta (projeto).
    // Pastas seguem PESSOAIS mesmo no histórico de escritório: são organização
    // de quem abre a tela, e ninguém arquiva na pasta do outro.
    supabase.from('render_folders').select('id, name, parent_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  // ── Contagens dos chips ──────────────────────────────────────────────────────
  // count exato no servidor (head: true — zero linha no payload), no MESMO
  // escopo da grade: se "Todos" contar uma coisa e a grade mostrar outra, o
  // "carregar mais" some no meio do histórico (hasMore compara os dois).
  //
  // Antes isto trazia UMA LINHA POR RENDER só pra contar no Node. Além do
  // desperdício, o PostgREST corta a resposta no teto de linhas do projeto
  // (Max rows, 1000 por padrão no Supabase) — a conta empacava em 1000 e o
  // histórico parecia terminar ali. Com um usuário só isso era um teto
  // distante; somando o escritório inteiro, deixa de ser.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const countScoped = (narrow?: (q: any) => any) =>
    runScopedQuery(scope, s => {
      const q = applyHistoryScope(
        readSb.from('renders').select('id', { count: 'exact', head: true }), s,
        { excludeInternalTest: true },  // mesmo recorte da grade, ou a conta não bate
      )
      return (narrow ? narrow(q) : q) as PromiseLike<{ count: number | null; error: { code?: string } | null }>
    })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const [totalRes, unfiledRes, ...folderCountRes] = await Promise.all([
    countScoped(),
    countScoped(q => q.is('folder_id', null)),
    ...(folders ?? []).map(f => countScoped(q => q.eq('folder_id', f.id))),
  ])

  const counts: Record<string, number> = {}
  ;(folders ?? []).forEach((f, i) => { counts[f.id] = folderCountRes[i]?.count ?? 0 })
  const unfiled = unfiledRes.count ?? 0
  const total   = totalRes.count ?? 0

  // ── Autoria ──────────────────────────────────────────────────────────────────
  // Mapa user_id → perfil para o chip "Gerado por" na grid. Em escopo de
  // escritório o mapa cobre TODOS os membros ativos, não só os autores da
  // primeira página: quem só aparece depois do "carregar mais" cairia como
  // "Autor não registrado". Admin client porque a RLS de profiles não permite
  // ler perfis de outros membros.
  const authorIds = Array.from(new Set([
    ...(await scopeAuthorIds(admin, scope)),
    ...(renders ?? []).map(r => r.user_id as string).filter(Boolean),
  ]))
  const { data: authorRows } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', authorIds)

  // Assina input/output/preview server-side antes de passar pro client (bucket
  // privado após o flip). Renders são FAL hoje → no-op, mas embrulhamos igual.
  const signedRenders = await signRows(admin, renders ?? [], ['input_url', 'output_url', 'preview_url'])

  const authors: Record<string, { name: string | null; email: string | null }> = {}
  for (const a of authorRows ?? []) {
    authors[a.id] = { name: a.full_name ?? null, email: a.email ?? null }
  }

  return (
    <HistoryClient
      // selectRenderList devolve linhas não-tipadas (fallback de projeção);
      // a forma real é a da projeção — cast único na fronteira do client.
      renders={signedRenders.map(sanitizeRenderListRow) as unknown as ComponentProps<typeof HistoryClient>['renders']}
      folderCounts={{ counts, unfiled, total }}
      pageSize={PAGE_SIZE}
      credits={balance.planBalance}
      folders={folders ?? []}
      authors={authors}
      currentUserId={user.id}
      teamView={scope.kind === 'workspace'}
    />
  )
}
