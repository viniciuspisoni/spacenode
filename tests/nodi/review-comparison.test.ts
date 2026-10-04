import { afterEach, describe, expect, it, vi } from 'vitest'
import { visionTools } from '@/lib/nodi/v2/tools/vision-tools'
import { runTool, type ToolContext } from '@/lib/nodi/v2/tools/registry'
import { reviewFollowUp } from '@/lib/nodi/review-followup'

const mock = vi.hoisted(() => ({ images: vi.fn(), compare: vi.fn() }))
vi.mock('@/lib/nodi/v2/images', () => ({ resolveGenerationImages: mock.images }))
vi.mock('@/lib/gemini', () => ({ geminiVisionJson: vi.fn(), geminiMultiVisionJson: mock.compare }))
afterEach(() => vi.clearAllMocks())

const id = '00000000-0000-4000-8000-000000000001'
const ctx = () => ({ userId: 'owner', supabase: {}, admin: {}, request: {},
  capabilities: { multimodal: true }, budget: { visionCallsUsed: 0 },
  deadline: { remaining: () => 30000 },
}) as unknown as ToolContext

describe('comparação original × resultado com próximo passo', () => {
  it('ordena original/resultado, retorna diferenças e mantém a referência avaliada no ajuste', async () => {
    mock.images.mockResolvedValue({ label: 'Renderizar', engine: 'vega', inputUrl: 'https://storage/original', outputUrl: 'https://storage/result' })
    mock.compare.mockResolvedValue(JSON.stringify({ resumo: 'Ajustar só o piso.', culpa: 'nenhum',
      achados: [{ dimensao: 'escala de textura', gravidade: 'problema', nota: 'piso grande' }],
      preservado: ['janela e geometria'], alterado: ['textura do piso'], veredito: 'Priorizar edição pontual.' }))
    const context = ctx()
    const result = await runTool(visionTools, 'comparar_imagens', { kind: 'render', id }, context)
    expect(mock.images).toHaveBeenCalledWith(context.supabase, 'owner', 'render', id)
    expect(mock.compare.mock.calls[0][0].imageUrls).toEqual(['https://storage/original', 'https://storage/result'])
    expect(context.budget.visionCallsUsed).toBe(1)
    const review = result.artifact?.review
    expect(review?.comparison?.changed).toContain('textura do piso')
    expect(review?.decision).toBe('editar_local')
    expect(review?.reference).toEqual({ kind: 'render', id })
    expect(reviewFollowUp(review!.decision, review!.summary, review!.reference)?.attachment.id).toBe(id)
  })
  it('não pede visão nem oferece próximo passo se a geração não for resolvida para o dono', async () => {
    mock.images.mockResolvedValue(null)
    const result = await runTool(visionTools, 'comparar_imagens', { kind: 'render', id }, ctx())
    expect(mock.compare).not.toHaveBeenCalled()
    expect(result.artifact).toBeUndefined()
  })
})
