import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { readCostRows } from '@/lib/costs/service'

const adminFor = (range: ReturnType<typeof vi.fn>) => {
  const query = { select: () => query, gte: () => query, lt: () => query, order: () => query, range }
  return { from: () => query } as unknown as SupabaseClient
}
describe('cost source persistence', () => {
  it('paginates more than one page without losing rows', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }).mockResolvedValueOnce({ data: [{ id: 500 }, { id: 501 }], error: null })
    const result = await readCostRows(adminFor(range), 'renders', 'id', 'from', 'to')
    expect(result.rows).toHaveLength(502); expect(result.available).toBe(true); expect(range).toHaveBeenNthCalledWith(2, 500, 999)
  })
  it('does not present a partially read source as complete after an error', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: Array(500).fill({ id: 1 }), error: null }).mockResolvedValueOnce({ data: null, error: { code: 'network' } })
    const result = await readCostRows(adminFor(range), 'renders', 'id', 'from', 'to')
    expect(result.available).toBe(false); expect(result.rows).toEqual([])
  })
  it('has an idempotent schema with RLS, financial constraints and no customer-role access', async () => {
    const db = new PGlite()
    await db.exec('create role anon; create role authenticated; create role service_role;')
    const sql = readFileSync('supabase/api-cost-dashboard.sql', 'utf8')
    await db.exec(sql); await db.exec(sql)
    const checks = await db.query<{ rls: boolean; customer_select: boolean }>("select relrowsecurity as rls, has_table_privilege('authenticated',oid,'select') as customer_select from pg_class where relname in ('api_cost_events','api_cost_invoices')")
    expect(checks.rows).toHaveLength(2); expect(checks.rows.every(r => r.rls && !r.customer_select)).toBe(true)
    await expect(db.exec("insert into api_cost_invoices(provider,month,currency,amount,updated_by) values('fal','2026-10-02','USD',1,'00000000-0000-0000-0000-000000000001')")).rejects.toThrow()
    await expect(db.exec("insert into api_cost_events(id,module,provider,endpoint,status,estimated_usd) values('00000000-0000-0000-0000-000000000001','Renderizar','fal','model','completed',-1)")).rejects.toThrow()
    await db.close()
  })
})
