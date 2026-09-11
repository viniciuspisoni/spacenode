// ── Escopo de leitura do Histórico ─────────────────────────────────────────────
//
// O Histórico nasceu pessoal: toda listagem filtrava por user_id e a RLS das
// tabelas de geração (auth.uid() = user_id) fechava a porta por baixo. Num
// escritório isso deixa o DONO cego — ele paga os nodes da equipe e não via
// nada do que a equipe produzia (reportado por cliente em 2026-09-11: "aqui no
// meu acesso não tá aparecendo o que tá sendo produzido pela equipe").
//
// Decisão de produto: quem manda no workspace (owner/admin) passa a ver a
// produção do escritório inteiro no Histórico; MEMBRO comum continua vendo só a
// dele. É o mesmo critério de permissão da tela Equipe (/app/equipe) e a mesma
// autorização que /api/history/detail já fazia pra abrir a geração de um colega
// — aqui ela só desce da tela de detalhe para a listagem.
//
// Consequência operacional que não dá pra separar do escopo: em 'workspace' a
// leitura NÃO pode usar o client da sessão (a RLS por user_id devolveria só as
// próprias linhas). Vai de service-role, e quem autoriza passa a ser
// resolveHistoryScope() + applyHistoryScope() no lugar da RLS. Por isso escopo
// e client andam juntos — use historyReadClient() e não escolha na mão.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveWorkspace } from '@/lib/workspaces/context'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type HistoryScope =
  /** Só as gerações da própria pessoa — o padrão, e o de todo mundo até aqui. */
  | { kind: 'own';       userId: string }
  /** Tudo do escritório + as próprias (owner/admin de workspace 'office'). */
  | { kind: 'workspace'; userId: string; workspaceId: string }

/** O que a superfície PEDE. Ausente/'own' em toda rota por padrão: só quem
 *  pede escritório explicitamente entra nele. Isso mantém o plugin SketchUp e
 *  os modais de importação (Finalizar/Editar/Retocar, que consomem as mesmas
 *  rotas de listagem) exatamente como estavam — listas sem chip de autor não
 *  deveriam misturar o trabalho de três pessoas sem dizer de quem é. */
export type ScopeRequest = 'own' | 'office'

/** Lê o pedido de escopo da query string (?scope=office). Qualquer outro valor,
 *  inclusive ausente, é 'own'. Pedir não é poder: quem decide é o papel da
 *  pessoa no workspace, checado em resolveHistoryScope. */
export function requestedScope(params: URLSearchParams): ScopeRequest {
  return params.get('scope') === 'office' ? 'office' : 'own'
}

/**
 * Escopo do Histórico desta pessoa.
 *
 * `requested` é o pedido da superfície; o retorno é o que ela pode de fato ter.
 * Um pedido de escritório de quem é membro comum volta como pessoal — o
 * parâmetro nunca amplia acesso, só permite abrir mão dele.
 *
 * Três condições para o escopo de escritório, todas obrigatórias:
 *   1. tem workspace ativo;
 *   2. é owner ou admin dele (membro comum vê só o próprio — mesma regra da
 *      tela Equipe);
 *   3. o workspace é 'office'. Workspace individual tem um membro só, então o
 *      escopo de workspace seria idêntico ao pessoal — e aí vale manter o
 *      caminho antigo (client da sessão, RLS ligada) em vez de trocar a RLS por
 *      service-role sem ganho nenhum. Vale pra esmagadora maioria das contas.
 *
 * `admin` precisa ser service-role: a RLS de workspace_members não deixa ler a
 * linha de outro membro, e o caller já está num contexto server-side.
 */
export async function resolveHistoryScope(
  admin: SupabaseClient,
  userId: string,
  requested: ScopeRequest = 'own',
): Promise<HistoryScope> {
  const own: HistoryScope = { kind: 'own', userId }
  if (requested !== 'office') return own
  if (!UUID_RE.test(userId)) return own

  const ws = await getActiveWorkspace(admin, userId)
  if (!ws || ws.type !== 'office') return own
  if (ws.role !== 'owner' && ws.role !== 'admin') return own
  // Interpolamos os dois ids num filtro PostgREST (applyHistoryScope) — só
  // seguem adiante se forem uuid de verdade.
  if (!UUID_RE.test(ws.workspaceId)) return own

  return { kind: 'workspace', userId, workspaceId: ws.workspaceId }
}

/** Client de leitura do escopo: sessão (RLS) em 'own', service-role em
 *  'workspace'. Ver o cabeçalho deste arquivo. */
export function historyReadClient<C>(scope: HistoryScope, session: C, admin: C): C {
  return scope.kind === 'workspace' ? admin : session
}

// Builder PostgREST — o mesmo `any` que selectRenderList já usa pra aceitar
// client SSR e admin na mesma assinatura.
/* eslint-disable @typescript-eslint/no-explicit-any */
type ScopedQuery = { eq: (c: string, v: string) => any; or: (f: string) => any }

/**
 * Aplica o escopo a um builder PostgREST de tabela de geração.
 *
 * Em 'workspace' o filtro é um OR (linhas do escritório OU as minhas), nunca só
 * workspace_id: geração cujo carimbo não resolveu na hora do insert — trigger
 * sem membership ativa, import antigo, linha anterior ao backfill — tem
 * workspace_id nulo, e trocar o filtro por workspace_id puro sumiria com ela do
 * histórico do próprio dono. Regressão silenciosa, e justo pra quem está há
 * mais tempo na casa.
 */
export function applyHistoryScope<Q>(query: Q, scope: HistoryScope): Q {
  // Q sem `extends ScopedQuery` de propósito: checar o builder do supabase-js
  // contra uma constraint estrutural estoura o limite de profundidade do TS
  // (TS2589) nas projeções longas. Sem a constraint, Q infere direto do
  // argumento — o tipo do builder atravessa a função intacto — e o contrato
  // fica no cast local.
  const q = query as unknown as ScopedQuery
  if (scope.kind === 'own') return q.eq('user_id', scope.userId) as Q
  return q.or(`workspace_id.eq.${scope.workspaceId},user_id.eq.${scope.userId}`) as Q
}

/**
 * Roda uma query escopada e cai pro escopo pessoal se a tabela ainda não tiver
 * a coluna workspace_id (PostgREST 42703 — janela entre o deploy do código e a
 * migration, que é a convenção da casa: ver o fallback de projeção em
 * selectRenderList e a resiliência de edit_v3_jobs).
 *
 * Degradar aqui é degradar para o comportamento de ontem — a pessoa vê o
 * histórico dela — em vez de derrubar a tela inteira: um select com coluna
 * inexistente falha A QUERY TODA, não só o campo.
 */
export async function runScopedQuery<R extends { error: { code?: string } | null }>(
  scope: HistoryScope,
  run: (scope: HistoryScope) => PromiseLike<R>,
): Promise<R> {
  const res = await run(scope)
  if (res.error?.code === '42703' && scope.kind === 'workspace') {
    console.warn('[history/scope] workspace_id ausente — caindo pro escopo pessoal')
    return run({ kind: 'own', userId: scope.userId })
  }
  return res
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** user_ids que podem assinar uma geração no escopo — alimenta o mapa de
 *  autores da grid. Em 'workspace' são todos os membros ATIVOS (não só os que
 *  aparecem na primeira página): sem isso, o autor de um render que só chega no
 *  "carregar mais" cairia como "Autor não registrado". */
export async function scopeAuthorIds(
  admin: SupabaseClient,
  scope: HistoryScope,
): Promise<string[]> {
  if (scope.kind === 'own') return [scope.userId]

  const { data } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', scope.workspaceId)
    .eq('status', 'active')

  const ids = (data ?? []).map(m => m.user_id as string)
  return Array.from(new Set([scope.userId, ...ids]))
}
