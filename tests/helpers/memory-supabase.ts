// Duplo do cliente Supabase com tabelas EM MEMÓRIA — o suficiente para rodar
// o código real do painel de anúncios, das rotas de cadastro/checkout e do
// webhook sem banco nem rede. Suporta o subconjunto do PostgREST que esses
// caminhos usam: select · eq · in · gte · lte · is · order · limit ·
// maybeSingle · single · insert(+select/single) · update · upsert · rpc.
//
// Defaults de coluna que o código pressupõe do banco: id, created_at e, em
// marketing.acquisition_events, occurred_at = agora e is_internal = false.

type Row = Record<string, unknown>
type Result = { data: unknown; error: { code?: string; message: string } | null }

const asTime = (v: unknown): number | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}
const compare = (a: unknown, b: unknown): number => {
  const ta = asTime(a)
  const tb = asTime(b)
  if (ta !== null && tb !== null) return ta - tb
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

export interface MemorySupabase {
  from: (table: string) => QueryBuilder
  schema: (schema: string) => { from: (table: string) => QueryBuilder }
  rpc: (fn: string, args: Record<string, unknown>) => Promise<Result>
  rows: (table: string) => Row[]
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>
}

type QueryBuilder = Record<string, (...args: never[]) => unknown> & PromiseLike<Result>

export function createMemorySupabase(
  seed: Record<string, Row[]> = {},
  rpcHandlers: Record<string, (args: Record<string, unknown>) => Result> = {},
): MemorySupabase {
  const tables = new Map<string, Row[]>()
  for (const [name, rows] of Object.entries(seed)) tables.set(name, rows.map(r => ({ ...r })))
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)!
  }
  let seq = 0
  const withDefaults = (name: string, row: Row): Row => {
    const now = new Date().toISOString()
    const base: Row = { id: `${name.split('.').pop()}-${++seq}`, created_at: now }
    if (name === 'marketing.acquisition_events') Object.assign(base, { occurred_at: now, is_internal: false })
    return { ...base, ...row }
  }

  function query(name: string): QueryBuilder {
    const filters: Array<(r: Row) => boolean> = []
    let limit = Infinity
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: Row | Row[] = {}
    let upsertIgnore = false
    let single: 'one' | 'maybe' | null = null

    const run = (): Result => {
      if (mode === 'insert' || mode === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map(r => withDefaults(name, r))
        const inserted: Row[] = []
        for (const row of list) {
          const existing = mode === 'upsert' ? table(name).find(r => r.id === row.id) : undefined
          if (existing) { if (!upsertIgnore) Object.assign(existing, row) }
          else { table(name).push(row); inserted.push(row) }
        }
        return { data: single ? inserted[0] ?? null : inserted, error: null }
      }
      const matched = table(name).filter(r => filters.every(f => f(r)))
      if (mode === 'update') {
        matched.forEach(r => Object.assign(r, payload))
        return { data: matched, error: null }
      }
      const rows = matched.slice(0, limit)
      if (single === 'maybe') return { data: rows[0] ?? null, error: null }
      if (single === 'one') {
        return rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'linha não encontrada' } }
      }
      return { data: rows, error: null }
    }

    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return builder },
      in: (col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[col])); return builder },
      gte: (col: string, val: unknown) => { filters.push(r => r[col] != null && compare(r[col], val) >= 0); return builder },
      lte: (col: string, val: unknown) => { filters.push(r => r[col] != null && compare(r[col], val) <= 0); return builder },
      is: (col: string, val: unknown) => { filters.push(r => (r[col] ?? null) === val); return builder },
      order: () => builder,
      limit: (n: number) => { limit = n; return builder },
      maybeSingle: () => { single = 'maybe'; return builder },
      single: () => { single = 'one'; return builder },
      insert: (rows: Row | Row[]) => { mode = 'insert'; payload = rows; return builder },
      update: (patch: Row) => { mode = 'update'; payload = patch; return builder },
      upsert: (rows: Row | Row[], opts?: { ignoreDuplicates?: boolean }) => {
        mode = 'upsert'; payload = rows; upsertIgnore = Boolean(opts?.ignoreDuplicates); return builder
      },
      then: <T1 = Result, T2 = never>(
        onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
        onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ) => Promise.resolve().then(run).then(onFulfilled, onRejected),
    }
    return builder as unknown as QueryBuilder
  }

  const rpcCalls: MemorySupabase['rpcCalls'] = []
  return {
    from: (t: string) => query(`public.${t}`),
    schema: (s: string) => ({ from: (t: string) => query(`${s}.${t}`) }),
    rpc: async (fn, args) => {
      rpcCalls.push({ fn, args })
      const handler = rpcHandlers[fn]
      return handler ? handler(args) : { data: null, error: { message: `rpc ${fn} não simulada` } }
    },
    rows: (t: string) => table(t),
    rpcCalls,
  }
}
