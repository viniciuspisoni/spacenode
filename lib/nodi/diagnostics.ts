// ── Diagnóstico de gerações (server-only) ─────────────────────────────────────
//
// Busca as gerações do usuário nas tabelas reais (renders — que também guarda
// vídeo e ampliação via `ambient` —, edits, edit_v3_jobs, vistas), normaliza
// num resumo de PRODUTO e mapeia o erro bruto para um problema conhecido.
//
// Política de redação (a mesma do /api/history/detail): o texto bruto de erro
// do provider NUNCA sai daqui — usuário recebe só o problema conhecido mapeado
// (known-issues) e labels de produto. As queries usam o client do USUÁRIO
// (cookies/RLS) + filtro explícito por user_id: dado de outro usuário não
// entra nem por engano de policy.
//
// Selects são resilientes a coluna ausente (42703): tenta a projeção completa
// e cai pra base — mesmo padrão dos inserts resilientes do produto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { engineDisplayLabel, statusDisplayLabel } from '@/lib/history/generation-detail'
import { getVideoModel } from '@/lib/video/models'
import { matchKnownIssue } from './known-issues'
import type { DiagnosisReport, GenerationKind, GenerationSummary, TicketContext } from './types'

const TOOL_LABEL: Record<GenerationKind, string> = {
  render:  'Renderizar',
  video:   'Animar',
  upscale: 'Ampliar',
  edit:    'Editar',
  vista:   'Spaces',
}

type Row = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Kind de uma linha de `renders` a partir do ambient. */
function renderKind(ambient: string | null): GenerationKind {
  if (ambient === 'video') return 'video'
  if (ambient === 'upscale') return 'upscale'
  return 'render'
}

function engineLabelFor(kind: GenerationKind, rawEngine: string | null): string | null {
  if (!rawEngine) return null
  if (kind === 'video') return getVideoModel(rawEngine)?.label ?? engineDisplayLabel(rawEngine)
  return engineDisplayLabel(rawEngine)
}

function summaryFromRender(row: Row): GenerationSummary {
  const kind = renderKind(str(row.ambient))
  const charged = num(row.nodes_charged) ?? num(row.cost_credits)
  const status = str(row.status) ?? 'unknown'
  return {
    kind,
    id: String(row.id),
    tool: TOOL_LABEL[kind],
    status,
    engine: engineLabelFor(kind, str(row.engine)),
    createdAt: str(row.created_at),
    errorCode: null,
    errorMessage: null,
    nodesCharged: charged,
    nodesRefunded: status === 'refunded' ? charged : null,
  }
}

function summaryFromEdit(row: Row, model?: string | null): GenerationSummary {
  const status = str(row.status) ?? 'unknown'
  // edit_v3_jobs tem `charged` booleano; `edits` cobra sempre que completa.
  const cost = num(row.nodes_cost)
  const charged = typeof row.charged === 'boolean' ? (row.charged ? cost : 0) : cost
  const issue = matchKnownIssue(str(row.error_message), status)
  return {
    kind: 'edit',
    id: String(row.id),
    tool: TOOL_LABEL.edit,
    status,
    engine: engineDisplayLabel(model ?? str(row.engine)),
    createdAt: str(row.created_at),
    errorCode: issue?.id ?? (status === 'failed' && str(row.error_message) ? 'unknown' : null),
    errorMessage: null, // texto bruto nunca sai — ver cabeçalho
    nodesCharged: charged,
    nodesRefunded: status === 'refunded' ? cost : null,
  }
}

function summaryFromVista(row: Row): GenerationSummary {
  const status = str(row.status) ?? 'unknown'
  return {
    kind: 'vista',
    id: String(row.id),
    tool: TOOL_LABEL.vista,
    status,
    engine: null,
    createdAt: str(row.created_at),
    errorCode: null,
    errorMessage: null,
    nodesCharged: num(row.nodes_charged) ?? num(row.cost_credits),
    nodesRefunded: null,
  }
}

/** Select com fallback pra projeção base quando alguma coluna não existe (42703). */
async function resilientSelect(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  full: string,
  base: string,
  limit: number,
  id?: string,
): Promise<Row[]> {
  for (const projection of [full, base]) {
    let q = supabase
      .from(table)
      .select(projection)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (id) q = q.eq('id', id)
    const { data, error } = await q
    if (!error) return (data ?? []) as unknown as Row[]
    if (error.code !== '42703') return [] // tabela ausente/permissão → fonte fora do ar, segue o baile
  }
  return []
}

const SOURCES = {
  renders: {
    full: 'id, status, engine, ambient, resolution, created_at, nodes_charged, cost_credits',
    base: 'id, status, engine, ambient, created_at',
    map: (r: Row) => summaryFromRender(r),
  },
  edits: {
    full: 'id, status, engine, created_at, nodes_cost, error_message',
    base: 'id, status, created_at',
    map: (r: Row) => summaryFromEdit(r),
  },
  edit_v3_jobs: {
    full: 'id, status, model, provider, created_at, nodes_cost, charged, error_message',
    base: 'id, status, created_at',
    map: (r: Row) => summaryFromEdit(r, str(r.model)),
  },
  vistas: {
    full: 'id, status, created_at, nodes_charged, cost_credits',
    base: 'id, status, created_at',
    map: (r: Row) => summaryFromVista(r),
  },
} as const

/** Últimas gerações do usuário, todas as fontes, mais recentes primeiro. */
export async function listRecentGenerations(
  supabase: SupabaseClient,
  userId: string,
  limit = 6,
): Promise<GenerationSummary[]> {
  const perSource = await Promise.all(
    (Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map(async (table) => {
      try {
        const rows = await resilientSelect(supabase, table, userId, SOURCES[table].full, SOURCES[table].base, limit)
        return rows.map(SOURCES[table].map)
      } catch {
        return [] as GenerationSummary[]
      }
    }),
  )
  return perSource
    .flat()
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, limit)
}

/** Reexecuta a consulta de UMA geração e monta o relatório de diagnóstico. */
export async function diagnoseGeneration(
  supabase: SupabaseClient,
  userId: string,
  kind: GenerationKind,
  id: string,
): Promise<DiagnosisReport | null> {
  // edit pode morar em `edits` (router v2) ou `edit_v3_jobs` (editor padrão) —
  // procura nos dois; as demais kinds têm tabela única.
  const tables: (keyof typeof SOURCES)[] =
    kind === 'edit' ? ['edit_v3_jobs', 'edits']
    : kind === 'vista' ? ['vistas']
    : ['renders']

  for (const table of tables) {
    const rows = await resilientSelect(supabase, table, userId, SOURCES[table].full, SOURCES[table].base, 1, id)
    const row = rows[0]
    if (!row) continue

    const summary = SOURCES[table].map(row)
    // Pro mapeamento de problema conhecido podemos usar o erro BRUTO — ele não
    // sai daqui; só o resultado curado (known) vai pro painel.
    const rawError = str(row.error_message)
    const known = matchKnownIssue(rawError, summary.status)

    const collected: TicketContext = {
      generationKind: summary.kind,
      generationId: summary.id,
      engine: summary.engine ?? undefined,
      status: summary.status,
      errorCode: summary.errorCode ?? known?.id ?? undefined,
      occurredAt: summary.createdAt ?? undefined,
      nodesCharged: summary.nodesCharged ?? undefined,
      nodesRefunded: summary.nodesRefunded ?? undefined,
    }

    return { generation: summary, known, collected }
  }
  return null
}

/** Label de produto pro status (reexportado pra UI do painel). */
export { statusDisplayLabel }
