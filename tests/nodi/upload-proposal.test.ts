import { afterEach, expect, it, vi } from 'vitest'
import { actionTools, estimateCost } from '@/lib/nodi/v2/tools/action-tools'
import { verifyIntent } from '@/lib/nodi/v3/intents'
import type { ToolContext } from '@/lib/nodi/v2/tools/registry'

vi.mock('@/lib/workspaces/balance', () => ({ getPayerBalance: async () => ({ totalBalance: 500 }) }))
vi.mock('@/lib/nodi/v2/images', () => ({ resolveGenerationImages: async () => ({
  label: 'Renderizar', status: 'completed', engine: 'vega', inputUrl: 'https://test.supabase.co/original', outputUrl: 'https://test.supabase.co/drifted-output',
}) }))
vi.mock('@/lib/nodi/v2/uploads', () => ({ resolveUploadImages: async () => ({
  label: 'Print enviado', status: null, engine: null, inputUrl: 'https://test.supabase.co/signed', outputUrl: null,
}) }))
afterEach(() => vi.unstubAllEnvs())

it('uses the server cost and resolved print in the confirmation card and intent', async () => {
  vi.stubEnv('NODI_ACTION_SECRET', 'test-proposal-secret')
  const ctx = { supabase: {}, admin: {}, userId: 'owner', scratch: {},
    request: { attachment: { kind: 'upload', id: 'sealed' } },
    capabilities: { actions: true, execute: true },
  } as unknown as ToolContext
  const result = await actionTools.find(t => t.name === 'propor_acao')!.handler({
    tipo: 'start_generation', rotulo: 'Gerar por 10 nodes', module_id: 'renderizar',
    projeto: 'interior', imagem_rotulo: 'Imagem antiga', settings: { engine: 'vega', resolution: '2k' }, prompt: 'Preserve a geometria.',
  }, ctx)
  const proposal = result.artifact?.proposals?.[0]
  const cost = estimateCost('renderizar', { engine: 'vega', resolution: '2k' })
  expect(proposal?.label).toBe(`Gerar por ${cost} nodes`)
  expect(proposal?.preflight?.imageLabel).toBe('Print enviado')
  expect(proposal?.preflight?.risks.join(' ')).not.toContain('Nenhuma imagem')
  const intent = verifyIntent(proposal!.intentToken!, 'owner')
  expect(intent?.cost).toBe(cost)
  expect(intent?.params.inputUrl).toContain('/signed')
})

it('refaz pela entrada da geração sem perpetuar materiais alterados do resultado anterior', async () => {
  vi.stubEnv('NODI_ACTION_SECRET', 'test-proposal-secret')
  const ctx = { supabase: {}, admin: {}, userId: 'owner', scratch: {},
    request: { attachment: { kind: 'render', id: '00000000-0000-4000-8000-000000000001' } },
    capabilities: { actions: true, execute: true },
  } as unknown as ToolContext
  const result = await actionTools.find(t => t.name === 'propor_acao')!.handler({
    tipo: 'start_generation', rotulo: 'Refazer', module_id: 'renderizar', projeto: 'interior',
    settings: { engine: 'vega', resolution: '2k' }, prompt: 'Preserve os materiais da entrada.',
  }, ctx)
  const intent = verifyIntent(result.artifact!.proposals![0].intentToken!, 'owner')
  expect(intent?.params.inputUrl).toBe('https://test.supabase.co/original')
  expect(intent?.params.anchorUrl).toBeUndefined()
  expect(intent?.params.refinementText).toContain('Preserve os materiais')
})
