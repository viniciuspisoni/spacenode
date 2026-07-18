// Orquestrador V2: loop com LLM simulado (function calling → tool → resposta),
// merge de artefatos, circuit breaker e fallback (null → rota cai na V1).

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LlmStep } from '@/lib/nodi/v2/llm'
import { mergeArtifact, runNodiV2 } from '@/lib/nodi/v2/orchestrator'
import { reportProviderFailure, resetBreakerForTests } from '@/lib/nodi/v2/budget'
import type { NodiV2Answer, SupervisedAction } from '@/lib/nodi/v2/types'

// LLM roteirizado: 1º passo pede consultar_contexto; 2º devolve texto final.
vi.mock('@/lib/nodi/v2/llm', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/nodi/v2/llm')>()
  return {
    ...original,
    createNodiLlmSession: () => {
      let calls = 0
      return {
        start: async (): Promise<LlmStep> => {
          calls++
          return { type: 'calls', calls: [{ name: 'consultar_contexto', args: {} }] }
        },
        continueWithToolResults: async (): Promise<LlmStep> => {
          calls++
          return { type: 'text', text: `resposta final após ${calls} passos` }
        },
        usage: () => ({ inputTokens: 100, outputTokens: 50 }),
      }
    },
  }
})

/** Stub mínimo: qualquer query resolve vazio (contexto tolera). */
function stubSupabase(): SupabaseClient {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    from: self, select: self, eq: self, order: self, limit: self, upsert: self, insert: self,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: { message: 'stub' } }),
    then: undefined,
    rpc: async () => ({ data: 0, error: null }),
  })
  return chain as unknown as SupabaseClient
}

const baseInput = () => ({
  supabase: stubSupabase(),
  admin: stubSupabase(),
  userId: 'u1',
  route: '/app/generate',
  message: 'o que consigo fazer aqui?',
  history: [],
  attachment: null,
  capabilities: { v2: true, multimodal: false, memory: false, actions: false, execute: false },
})

afterEach(() => resetBreakerForTests())

describe('runNodiV2', () => {
  it('roda o loop: tool chamada → texto final + usage', async () => {
    const answer = await runNodiV2(baseInput())
    expect(answer).not.toBeNull()
    expect(answer!.text).toContain('resposta final')
    expect(answer!.source).toBe('v2')
    expect(answer!.usage?.toolCalls).toContain('consultar_contexto')
    expect(answer!.usage?.inputTokens).toBeGreaterThan(0)
  })

  it('circuit breaker aberto → null (rota cai na V1)', async () => {
    reportProviderFailure()
    reportProviderFailure()
    reportProviderFailure() // 3 falhas seguidas abrem o circuito
    const answer = await runNodiV2(baseInput())
    expect(answer).toBeNull()
  })
})

describe('mergeArtifact', () => {
  const action = (id: string): SupervisedAction => ({ id, type: 'navigate', label: id, href: '/app' })

  it('campos únicos: último vence; propostas acumulam até 3', () => {
    const target: NodiV2Answer = { text: '', source: 'v2' }
    mergeArtifact(target, { promptSuggestion: { prompt: 'a', rationale: 'r1' } })
    mergeArtifact(target, { promptSuggestion: { prompt: 'b', rationale: 'r2' } })
    mergeArtifact(target, { proposals: [action('1'), action('2')] })
    mergeArtifact(target, { proposals: [action('3'), action('4')] })
    expect(target.promptSuggestion?.prompt).toBe('b')
    expect(target.proposals?.map(p => p.id)).toEqual(['1', '2', '3'])
  })
})
