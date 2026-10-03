import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runNodiV2 } from '@/lib/nodi/v2/orchestrator'
import { signIntent } from '@/lib/nodi/v3/intents'
import { DEFAULT_SETTINGS } from '@/lib/nodi/v4/settings'

const mock = vi.hoisted(() => ({ token: '', execute: vi.fn() }))
vi.mock('@/lib/nodi/v2/llm', () => ({
  nodiV2Model: () => 'test',
  createNodiLlmSession: () => ({
    start: async () => ({ type: 'calls', calls: [{ name: 'propor_acao', args: {} }] }),
    continueWithToolResults: async () => ({ type: 'text', text: 'Geração proposta, com custo de 20 nodes.' }),
    usage: () => ({ inputTokens: 10, outputTokens: 10 }),
  }),
}))
vi.mock('@/lib/nodi/v2/context-pack', () => ({
  buildRequestContext: async () => ({ nodi: { route: '/app', projectId: null } }), contextBlock: () => 'context',
}))
vi.mock('@/lib/nodi/v2/tools', () => ({ buildToolset: () => [], toDeclarations: () => [],
  runTool: async () => ({ output: { custo: 20 }, artifact: { proposals: [{
    id: 'proposal', type: 'start_generation', label: 'Gerar por 20 nodes', executable: true, intentToken: mock.token,
  }] } }),
}))
vi.mock('@/lib/nodi/v4/executor', () => ({ executeRenderIntent: mock.execute }))
vi.mock('@/lib/nodi/v4/settings', async original => ({
  ...await original<typeof import('@/lib/nodi/v4/settings')>(), getAutoSpentToday: async () => 0,
}))
vi.mock('@/lib/nodi/telemetry', () => ({ logNodiEvent: async () => {} }))
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('first-print confirmation before spending', () => {
  it('retains the paid proposal without invoking the executor, even in Autopiloto', async () => {
    vi.stubEnv('NODI_ACTION_SECRET', 'test-autonomy-upload')
    mock.token = signIntent({ userId: 'owner', action: 'render', cost: 20,
      params: { inputUrl: 'https://test.supabase.co/signed', projectType: 'interior', engine: 'vega', resolution: '2k' } })
    const answer = await runNodiV2({
      admin: {} as SupabaseClient, supabase: {} as SupabaseClient, userId: 'owner',
      route: '/app', message: 'Prepare esta imagem', history: [], attachment: { kind: 'upload', id: 'sealed' },
      capabilities: { v2: true, multimodal: true, memory: false, actions: true, execute: true },
      settings: { ...DEFAULT_SETTINGS, mode: 'autopiloto', maxNodesPerAction: 60, maxNodesPerDay: 200 },
      origin: 'https://spacenode.app', cookie: 'test-only-cookie',
    })
    expect(answer?.proposals?.[0].executable).toBe(true)
    expect(answer?.executed).toBeUndefined()
    expect(mock.execute).not.toHaveBeenCalled()
  })
})
