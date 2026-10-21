import { afterEach, describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { nominalPilotCost, runFirstImagePilot } from '@/lib/nodi/first-image/agent'
import type { PilotRequest } from '@/lib/nodi/first-image/contract'

// These are provider fault simulations, not evidence about real Gemini answers.
const request: PilotRequest = {
  variant: 'control', caseId: '00000000-0000-4000-8000-000000000001', attachmentId: 'a'.repeat(100),
  message: 'Prepare a apresentação sem mudar o projeto.', history: [],
  context: { projectType: 'interior', goal: 'presentation', referenceKind: 'model', qa: true },
}
const decision = { kind: 'prepare', message: '', goal: 'presentation', lighting: null, materialField: null, material: null }
const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } }
const response = (text = JSON.stringify(decision), finish: 'stop' | 'length' | 'content-filter' = 'stop') => ({
  content: [{ type: 'text' as const, text }], finishReason: { unified: finish, raw: undefined }, usage, warnings: [],
})
const run = (model: MockLanguageModelV4, reserve = vi.fn(async () => 'allowed' as const), signal = new AbortController().signal) =>
  runFirstImagePilot(request, new Uint8Array([1, 2, 3]), signal, model, reserve)
afterEach(() => vi.restoreAllMocks())

describe('Gemini first-image fault containment', () => {
  it('does not retry a content-filter response or return its raw content', async () => {
    const reserve = vi.fn(async () => 'allowed' as const)
    const model = new MockLanguageModelV4({ doGenerate: response('PRIVATE blocked response', 'content-filter') })
    const error = await run(model, reserve).catch(e => e)
    expect(error).toMatchObject({ issue: 'output-blocked', usage: { attempts: 1, inputTokens: 100, outputTokens: 20 } })
    expect(JSON.stringify(error)).not.toContain('PRIVATE')
    expect(reserve).not.toHaveBeenCalled()
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it.each(['Error', 'TimeoutError'])('contains an unclassified or timed-out provider error (%s) without retrying', async name => {
    const reserve = vi.fn(async () => 'allowed' as const)
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw Object.assign(new Error('PRIVATE credentials or prompt'), { name }) } })
    const error = await run(model, reserve).catch(e => e)
    expect(error).toMatchObject({ issue: name === 'Error' ? 'unavailable' : 'timeout-or-abort', usage: { attempts: 1, costComplete: false } })
    expect(JSON.stringify(error)).not.toContain('PRIVATE')
    expect(reserve).not.toHaveBeenCalled()
  })

  it.each([400, 403, 404, 408, 424])('does not retry non-transient HTTP %s responses', async statusCode => {
    const reserve = vi.fn(async () => 'allowed' as const)
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      throw new APICallError({ message: 'PRIVATE', url: 'https://provider.invalid', requestBodyValues: {}, statusCode })
    } })
    await expect(run(model, reserve)).rejects.toMatchObject({ issue: `http-${statusCode}`, usage: { attempts: 1 } })
    expect(reserve).not.toHaveBeenCalled()
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('cancels an in-flight provider call without starting another one', async () => {
    const controller = new AbortController(), reserve = vi.fn(async () => 'allowed' as const)
    const model = new MockLanguageModelV4({ doGenerate: async ({ abortSignal }) => {
      controller.abort()
      abortSignal!.throwIfAborted()
      return response()
    } })
    await expect(run(model, reserve, controller.signal)).rejects.toMatchObject({ issue: 'timeout-or-abort', usage: { attempts: 1 } })
    expect(reserve).not.toHaveBeenCalled()
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('does not reserve another call when the first failure arrives at 20 seconds', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const reserve = vi.fn(async () => 'allowed' as const)
    const model = new MockLanguageModelV4({ doGenerate: async () => { now += 20_000; return response('invalid') } })
    await expect(run(model, reserve)).rejects.toMatchObject({ issue: 'output-invalid', usage: { attempts: 1, durationMs: 20_000 } })
    expect(reserve).not.toHaveBeenCalled()
  })

  it('does not start recovery after a slow quota check crosses the 20-second cutoff', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const reserve = vi.fn(async () => { now += 20_001; return 'allowed' as const })
    const model = new MockLanguageModelV4({ doGenerate: [response('invalid'), response()] })
    await expect(run(model, reserve)).rejects.toMatchObject({ issue: 'output-invalid', usage: { attempts: 1 } })
    expect(model.doGenerateCalls).toHaveLength(1)
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it('fails closed if the additional quota check throws', async () => {
    const model = new MockLanguageModelV4({ doGenerate: response('invalid') })
    const reserve = vi.fn(async (): Promise<'allowed'> => { throw new Error('PRIVATE database details') })
    const error = await run(model, reserve).catch(e => e)
    expect(error).toMatchObject({ issue: 'output-invalid', retryBudget: 'unavailable', usage: { attempts: 1, costComplete: true } })
    expect(JSON.stringify(error)).not.toContain('PRIVATE')
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('does not start another call if the user cancels during the additional quota check', async () => {
    const controller = new AbortController()
    const reserve = vi.fn(async () => { controller.abort(); return 'allowed' as const })
    const model = new MockLanguageModelV4({ doGenerate: [response('invalid'), response()] })
    await expect(run(model, reserve, controller.signal)).rejects.toMatchObject({ issue: 'timeout-or-abort', usage: { attempts: 1, costComplete: true } })
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('marks successful usage as incomplete when a provider omits token counts', async () => {
    const model = new MockLanguageModelV4({ doGenerate: { ...response(), usage: {
      inputTokens: { ...usage.inputTokens, total: undefined }, outputTokens: { ...usage.outputTokens, total: undefined },
    } } })
    const answer = await run(model)
    expect(answer.recommendation?.nodeCost).toBe(20)
    expect(answer.usage.costComplete).toBe(false)
  })

  it('includes reasoning tokens from a truncated response in the known recovery cost', async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      { ...response('{"kind":', 'length'), usage: { ...usage, outputTokens: { total: 1183, text: 35, reasoning: 1148 } } },
      response(),
    ] })
    const answer = await run(model)
    expect(answer.usage).toMatchObject({ attempts: 2, recoveredFrom: 'output-truncated', inputTokens: 200, outputTokens: 1203, costComplete: true,
      nominalUsd: nominalPilotCost('control', 200, 1203) })
  })
})
