import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeActivatedUsers, reconcileActivationUsers } from '@/lib/marketing/ads/activation'

type Row = Record<string, unknown>
function client(tables: Record<string, Row[]>, unavailable?: string): SupabaseClient {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return query },
      neq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] !== value); return query },
      in: (key: string, values: unknown[]) => { rows = rows.filter(r => values.includes(r[key])); return query },
      not: (key: string, op: string, value: unknown) => {
        if (op !== 'is' || value !== null) throw new Error('Unexpected filter')
        rows = rows.filter(r => r[key] != null); return query
      },
      or: (filter: string) => {
        if (filter !== 'is_internal_test.is.null,is_internal_test.eq.false') throw new Error('Unexpected filter')
        rows = rows.filter(r => r.is_internal_test == null || r.is_internal_test === false); return query
      },
      order: (key: string) => { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return query },
      range: async (start: number, end: number) => unavailable === table
        ? { data: null, error: { message: 'unavailable' } }
        : { data: rows.slice(start, end + 1), error: null },
    }
    return query
  }
  return { from, schema: () => ({ from }) } as unknown as SupabaseClient
}
const render = (user: string, extra: Row = {}) => ({
  id: `render-${user}`, user_id: user, status: 'completed', output_url: 'https://example.com/result.png',
  is_internal_test: false, ...extra,
})
const event = (user: string, extra: Row = {}) => ({
  id: `event-${user}`, user_id: user, event_type: 'first_generation', is_internal: false, ...extra,
})

describe('activation reconciled per external account', () => {
  it('keeps a legacy completed render when another account has first_generation', async () => {
    const admin = client({ acquisition_events: [event('new')], renders: [render('new'), render('legacy', { style: null })] })
    const result = await reconcileActivationUsers(admin, ['new', 'legacy', 'legacy'])
    expect(result.activated).toEqual(new Set(['new', 'legacy']))
    expect(result.legacy).toEqual(new Set(['legacy']))
    expect(result.eventOnly.size).toBe(0)
    expect(await computeActivatedUsers(admin, ['new', 'legacy'])).toEqual(result.activated)
  })
  it('does not turn failed or pending attempts into activation', async () => {
    const result = await reconcileActivationUsers(client({
      acquisition_events: [event('failed', { event_type: 'generation_failed' })],
      renders: [render('failed', { status: 'failed' }), render('pending', { status: 'processing' })],
    }), ['failed', 'pending'])
    expect(result.activated.size).toBe(0)
    expect(result.eventOnly.size).toBe(0)
  })
  it('excludes test renders, internal events and internal actors', async () => {
    const result = await reconcileActivationUsers(client({
      internal_actors: [{ user_id: 'staff' }],
      acquisition_events: [event('staff'), event('test', { is_internal: true })],
      renders: [render('staff'), render('test', { is_internal_test: true })],
    }), ['staff', 'test'])
    expect(result.activated.size).toBe(0)
    expect(result.internal).toEqual(new Set(['staff']))
    expect(result.eventOnly.size).toBe(0)
  })
  it('keeps orphan events unknown rather than confirming absent or failed output', async () => {
    const result = await reconcileActivationUsers(client({
      acquisition_events: [event('orphan'), event('failed')],
      renders: [render('failed', { status: 'failed' })],
    }), ['orphan', 'failed'])
    expect(result.activated.size).toBe(0)
    expect(result.eventOnly).toEqual(new Set(['orphan', 'failed']))
  })
  it('requires available output while preserving valid legacy rows', async () => {
    const result = await reconcileActivationUsers(client({ renders: [
      render('empty', { output_url: '' }), render('missing', { output_url: null }),
      render('legacy', { is_internal_test: null }),
    ] }), ['empty', 'missing', 'legacy'])
    expect(result.activated).toEqual(new Set(['legacy']))
  })
  it('paginates beyond a prolific account so later users remain visible', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => render('prolific', { id: `a-${String(i).padStart(4, '0')}` }))
    rows.push(render('later', { id: 'z-later' }))
    const result = await reconcileActivationUsers(client({ renders: rows }), ['prolific', 'later'])
    expect(result.activated).toEqual(new Set(['prolific', 'later']))
  })
  it('covers users beyond the former 500 account cap', async () => {
    const users = Array.from({ length: 501 }, (_, i) => `user-${i}`)
    const result = await reconcileActivationUsers(client({ renders: [render(users[500])] }), users)
    expect(result.activated).toEqual(new Set([users[500]]))
  })
  it('fails instead of interpreting unavailable evidence as non-use', async () => {
    await expect(reconcileActivationUsers(client({}, 'renders'), ['one'])).rejects.toThrow('renders concluídos')
  })
})
