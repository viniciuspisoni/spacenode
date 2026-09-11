// ── Redação server-side das LISTAGENS do Histórico ─────────────────────────────
//
// O painel de detalhes redige a linha em /api/history/detail, mas as listagens
// (grid de renders, tab Vistas, tab Edições) alimentam a mesma tela — se elas
// entregarem select('*'), o usuário comum recebe pelo network tab exatamente o
// que o detail esconde (prompt final proprietário, fal_request_id, endpoints,
// upscale_meta.steps, generation_log). Este módulo é o ponto único de projeção
// e tradução para as listas.
//
// Regra: a lista só carrega o que a grid renderiza. Endpoint/model de provider
// nunca viajam crus — viram label de produto ANTES de sair do servidor
// (getVideoDisplayLabel/getUpscaleDisplayLabel aceitam a label traduzida).

import { videoEngineLabel, upscaleProviderLabel } from '@/lib/renderLabels'
import { applyHistoryScope, runScopedQuery, type HistoryScope } from './scope'

// Colunas que a grid de renders realmente usa (HistoryClient). Sem prompt,
// sem fal_request_id, sem config_snapshot/upscale_meta/generation_log.
// NB: não incluir colunas da migration 20260701 (user_prompt etc.) enquanto
// ela não estiver aplicada, nem `model` — nunca existiu na tabela em produção
// (era só um campo vestigial no tipo TS; select('*') nunca reclamava porque
// simplesmente não vinha na linha). Select com coluna inexistente falha A
// QUERY INTEIRA (PostgREST 42703), não apenas o campo — checar
// information_schema.columns antes de adicionar qualquer coluna nova aqui.
export const RENDER_LIST_COLUMNS =
  'id, user_id, input_url, output_url, preview_url, ambient, style, lighting, status, cost_credits, nodes_charged, engine, resolution, folder_id, created_at'

// Projeção sem preview_url — fallback pra janela entre o deploy do código e a
// migration 20260813000000 (42703 = coluna inexistente).
export const RENDER_LIST_COLUMNS_LEGACY =
  'id, user_id, input_url, output_url, ambient, style, lighting, status, cost_credits, nodes_charged, engine, resolution, folder_id, created_at'

/** Resposta das duas superfícies de listagem — linhas não-tipadas (a projeção
 *  varia com o fallback) + o error do PostgREST, cujo `code` é o que decide os
 *  retries. */
export interface RenderListResult {
  data:  Record<string, unknown>[] | null
  error: { code?: string; message?: string } | null
}

/** SELECT do histórico com fallback de projeção: tenta com preview_url e cai
 *  pra projeção legada se a coluna ainda não existir. Usado pela página do
 *  Histórico e pelo /api/renders/list — uma fonte, duas superfícies.
 *
 *  Quem decide QUAIS linhas entram é o `scope` (lib/history/scope.ts): as da
 *  própria pessoa, ou as do escritório inteiro quando quem lê é owner/admin.
 *  O client tem que combinar com o escopo — use historyReadClient(). */
export async function selectRenderList(
  sb: { from: (t: string) => any },  // eslint-disable-line @typescript-eslint/no-explicit-any -- aceita client SSR e admin
  scope: HistoryScope,
  opts: { cursor?: string | null; limit: number },
): Promise<RenderListResult> {
  const run = (cols: string, s: HistoryScope): PromiseLike<RenderListResult> => {
    // excludeInternalTest: `renders` é a tabela do piloto interno (Orion), e o
    // histórico de escritório é superfície de equipe — ver applyHistoryScope.
    let q = applyHistoryScope(sb.from('renders').select(cols), s, { excludeInternalTest: true })
    if (opts.cursor) q = q.lt('created_at', opts.cursor)
    return q.order('created_at', { ascending: false }).limit(opts.limit)
  }
  // Dois 42703 possíveis e independentes: a coluna preview_url (projeção) e a
  // coluna workspace_id (escopo). runScopedQuery cuida do segundo; o retry de
  // projeção abaixo, do primeiro — e roda dentro do escopo que sobrou.
  let res = await runScopedQuery(scope, s => run(RENDER_LIST_COLUMNS, s))
  if (res.error && res.error.code === '42703') {
    res = await runScopedQuery(scope, s => run(RENDER_LIST_COLUMNS_LEGACY, s))
  }
  return res
}

// Traduz campos que carregam identificadores de provider para labels de
// produto. Muta uma CÓPIA — usar no servidor antes de responder/serializar.
export function sanitizeRenderListRow<T extends Record<string, unknown>>(row: T): T {
  const r: Record<string, unknown> = { ...row }
  const style = typeof r.style === 'string' ? r.style : null

  if (r.ambient === 'video' && style) {
    // style de vídeo = endpoint fal cru → label ('Rápido', 'Cinemático'...).
    r.style = videoEngineLabel(style) ?? 'Vídeo'
  } else if (r.ambient === 'upscale' && style && !style.startsWith('upscale:')) {
    // upscale legado: style = endpoint 'fal-ai/...' → label do preset.
    r.style = upscaleProviderLabel(style) ?? 'Alta definição'
  }

  return r as T
}
