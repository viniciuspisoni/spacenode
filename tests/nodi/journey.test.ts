import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeJourney } from '@/lib/nodi/journey'
import { readRecentGenerations } from '@/lib/nodi/diagnostics'
import { canUseKnowledgeShortcut } from '@/lib/nodi/v2/routing'
import type { GenerationSummary } from '@/lib/nodi/types'

const gen = (patch: Partial<GenerationSummary> = {}): GenerationSummary => ({
  kind: 'render', id: 'owned-generation', tool: 'Renderizar', status: 'completed', ...patch,
})
const journey = (recent: GenerationSummary[], patch = {}) => computeJourney({
  recent, available: true, balance: 500, multimodal: true, ...patch,
})

describe('jornada baseada em fatos', () => {
  it('conta sem histórico começa pelo objetivo, antes da despesa', () => {
    const j = journey([])
    expect(j.stage).toBe('prepare')
    expect(j.next.chatPrompt).toContain('objetivo')
    expect(j.next.estimatedNodes).toBe(0)
    expect(j.generation).toBeNull()
  })
  it('indisponibilidade não vira conta nova', () => {
    expect(journey([], { available: false }).stage).toBe('unavailable')
    expect(journey([gen()], { available: false }).next.kind).toBe('navigate')
  })
  it.each(['processing', 'pending', 'queued'])('geração %s acompanha sem duplicar, mesmo sem saldo', status => {
    const j = journey([gen({ status })], { balance: 0 })
    expect(j.stage).toBe('wait')
    expect(j.next.href).toBe('/app/history')
  })
  it.each(['failed', 'refunded'])('geração %s exige diagnóstico antes de repetir', status => {
    expect(journey([gen({ status })]).next.kind).toBe('problem')
  })
  it.each(['render', 'edit', 'upscale', 'vista'] as const)('%s concluída não significa aprovada', kind => {
    const j = journey([gen({ kind })])
    expect(j.stage).toBe('review')
    expect(j.generation).toEqual({ kind, id: 'owned-generation' })
    expect(j.next.chatPrompt).toContain('sem iniciar outra geração')
    expect(j.scope).toBe('account')
  })
  it('sem visão, revisão acontece no produto, sem prometer análise', () => {
    expect(journey([gen()], { multimodal: false }).next.href).toBe('/app/history')
  })
  it('vídeo pronto pode ser conferido para apresentação, sem alegar entrega', () => {
    const j = journey([gen({ kind: 'video' })])
    expect(j.stage).toBe('deliver')
    expect(j.next.why).toContain('não confirma')
  })
  it('estado desconhecido não avança a jornada', () => {
    expect(journey([gen({ status: 'unexpected' })]).stage).toBe('unavailable')
  })
})

describe('leitura do histórico: isolamento e indisponibilidade', () => {
  function client(errorTable?: string, missingColumn = false) {
    const filters: { table: string; user: string }[] = []
    let attempts = 0
    const db = { from(table: string) {
      const row = { table, user: '' }; filters.push(row)
      const q = { select: () => q, eq: (key: string, value: string) => { if (key === 'user_id') row.user = value; return q },
        order: () => q, limit: () => q,
        then: (resolve: (r: unknown) => void) => {
          attempts++
          const error = table === errorTable ? { code: '42501' } : missingColumn && table === 'renders' && attempts === 1 ? { code: '42703' } : null
          return Promise.resolve({ data: [], error }).then(resolve)
        },
      }; return q
    } }
    return { db: db as unknown as SupabaseClient, filters }
  }
  it('conta vazia confirmada: todas as fontes filtradas por usuário', async () => {
    const c = client(); const result = await readRecentGenerations(c.db, 'user-a')
    expect(result).toEqual({ generations: [], available: true })
    expect(c.filters).toHaveLength(4)
    expect(c.filters.every(r => r.user === 'user-a')).toBe(true)
  })
  it('erro em uma fonte marca a leitura parcial como indisponível', async () => {
    expect((await readRecentGenerations(client('edits').db, 'user-a')).available).toBe(false)
  })
  it('fallback de coluna compatível não vira indisponibilidade', async () => {
    expect((await readRecentGenerations(client(undefined, true).db, 'user-a')).available).toBe(true)
  })
})

describe('atalho de conhecimento respeita intenção e continuidade', () => {
  it('pergunta isolada pode usar a base', () => expect(canUseKnowledgeShortcut('Quanto custa renderizar?', 0, false)).toBe(true))
  it.each(['Quero renderizar', 'Como faço? Gere com Vega', 'Me ajude a preparar um print', 'Compare minha imagem', 'Monte um plano'])('pedido %s vai ao copiloto', text => {
    expect(canUseKnowledgeShortcut(text, 0, false)).toBe(false)
  })
  it('continuação e imagem exigem contexto', () => {
    expect(canUseKnowledgeShortcut('Quanto custa?', 2, false)).toBe(false)
    expect(canUseKnowledgeShortcut('Como faço?', 0, true)).toBe(false)
  })
})


describe('compatibilidade com edições síncronas legadas', () => {
  it.each([['https://storage.example/result.jpg', 'completed'], [null, 'unknown']])('resultado %s normaliza para %s sem exigir status', async (result, expected) => {
    const projections: string[] = []
    const db = { from(table: string) {
      let projection = ''
      const q = { select: (cols: string) => { projection = cols; if (table === 'edits') projections.push(cols); return q },
        eq: () => q, order: () => q, limit: () => q,
        then: (resolve: (r: unknown) => void) => Promise.resolve(table === 'edits'
          ? projection.split(',').map(c => c.trim()).includes('status')
            ? { data: null, error: { code: '42703' } }
            : { data: [{ id: 'legacy-edit', created_at: '2026-10-02', result_image_url: result }], error: null }
          : { data: [], error: null }).then(resolve),
      }; return q
    } }
    const read = await readRecentGenerations(db as unknown as SupabaseClient, 'user-a')
    expect(read.available).toBe(true)
    expect(read.generations[0].status).toBe(expected)
    expect(JSON.stringify(read.generations)).not.toContain('storage.example')
    expect(projections.every(p => !p.split(',').map(c => c.trim()).includes('status'))).toBe(true)
  })
})
