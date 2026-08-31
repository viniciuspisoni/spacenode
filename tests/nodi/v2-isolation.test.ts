// Isolamento V2: imagens só saem de linhas do PRÓPRIO usuário — a query
// sempre carrega eq('user_id', <dono>) além do id, e linha ausente vira null.

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveGenerationImages } from '@/lib/nodi/v2/images'

interface Captured { table: string; filters: Record<string, string> }

/** Stub encadeável do supabase-js que registra a query e devolve `row`. */
function stubClient(row: Record<string, unknown> | null, captured: Captured[]): SupabaseClient {
  const client = {
    from(table: string) {
      const cap: Captured = { table, filters: {} }
      captured.push(cap)
      const chain = {
        select() { return chain },
        eq(col: string, val: string) { cap.filters[col] = val; return chain },
        maybeSingle: async () => ({ data: row, error: null }),
      }
      return chain
    },
  }
  return client as unknown as SupabaseClient
}

const ROW = {
  id: 'g1', status: 'completed', engine: 'vega',
  input_url: 'https://x.supabase.co/storage/v1/object/public/b/in.jpg',
  output_url: 'https://x.supabase.co/storage/v1/object/public/b/out.jpg',
}

describe('resolveGenerationImages', () => {
  it('sempre filtra por user_id + id (defesa em profundidade sobre o RLS)', async () => {
    const captured: Captured[] = []
    await resolveGenerationImages(stubClient(ROW, captured), 'user-abc', 'render', 'g1')
    expect(captured[0].table).toBe('renders')
    expect(captured[0].filters.user_id).toBe('user-abc')
    expect(captured[0].filters.id).toBe('g1')
  })

  it('linha de outro usuário (não retornada) → null, sem vazamento', async () => {
    const captured: Captured[] = []
    const result = await resolveGenerationImages(stubClient(null, captured), 'user-abc', 'vista', 'g2')
    expect(result).toBeNull()
  })

  it('edit cai pra tabela legada `edits` quando edit_v3_jobs não tem a linha', async () => {
    const captured: Captured[] = []
    await resolveGenerationImages(stubClient(null, captured), 'u', 'edit', 'g3')
    expect(captured.map(c => c.table)).toEqual(['edit_v3_jobs', 'edits'])
    for (const cap of captured) expect(cap.filters.user_id).toBe('u')
  })

  it('vídeo analisa só a ENTRADA (saída é MP4)', async () => {
    const captured: Captured[] = []
    const result = await resolveGenerationImages(stubClient(ROW, captured), 'u', 'video', 'g4')
    expect(result?.inputUrl).toContain('in.jpg')
    expect(result?.outputUrl).toBeNull()
  })
})
