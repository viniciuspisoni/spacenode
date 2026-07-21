// ── Orquestrador agentic do Nodi V2 ──────────────────────────────────────────
//
// Loop: contexto + mensagem → modelo (function calling) → tools server-side →
// modelo → … → texto final + artefatos validados. Limites de etapas, tools,
// visão, tokens e uma deadline única governam o request. Qualquer falha do
// provedor alimenta o circuit breaker e devolve null — a ROTA cai na V1
// (o usuário sempre recebe resposta; a V2 é um upgrade, nunca um risco).

import type { SupabaseClient } from '@supabase/supabase-js'
import { clampText } from '../redact'
import type { NodiTurn } from '../types'
import {
  V2_LIMITS, breakerOpen, reportProviderFailure, reportProviderSuccess, startDeadline,
} from './budget'
import { buildRequestContext, contextBlock } from './context-pack'
import type { NodiV2Capabilities } from './flags'
import { createNodiLlmSession, nodiV2Model, type LlmStep } from './llm'
import { NODI_V2_SYSTEM_PROMPT, wrapUntrusted } from './system-prompt'
import { buildToolset, runTool, toDeclarations, type ToolContext } from './tools'
import type { NodiAttachment, NodiV2Answer } from './types'

export interface OrchestratorInput {
  supabase: SupabaseClient
  admin: SupabaseClient
  userId: string
  route: string
  message: string
  history: NodiTurn[]
  attachment: NodiAttachment | null
  capabilities: NodiV2Capabilities
}

const FINAL_FALLBACK_TEXT =
  'Cheguei ao limite deste pedido antes de fechar tudo. O que consegui está nos cartões acima — se quiser, refine a pergunta que eu continuo de onde parei.'

/** Merge de artefatos: campos únicos ficam com o ÚLTIMO; propostas acumulam (máx. 3). */
export function mergeArtifact(target: NodiV2Answer, artifact: Partial<NodiV2Answer>): void {
  if (artifact.analysis) target.analysis = artifact.analysis
  if (artifact.plan) target.plan = artifact.plan
  if (artifact.promptSuggestion) target.promptSuggestion = artifact.promptSuggestion
  if (artifact.recommendation) target.recommendation = artifact.recommendation
  if (artifact.ticketDraft) target.ticketDraft = artifact.ticketDraft
  if (artifact.memoryProposal) target.memoryProposal = artifact.memoryProposal
  if (artifact.proposals?.length) {
    target.proposals = [...(target.proposals ?? []), ...artifact.proposals].slice(0, 3)
  }
}

function buildFirstTurn(input: OrchestratorInput, ctxBlock: string): string {
  const hist = input.history.length
    ? wrapUntrusted(
        'CONVERSA ANTERIOR',
        input.history.slice(-8).map(t => `${t.role === 'user' ? 'Usuário' : 'Nodi'}: ${clampText(t.text, 300)}`).join('\n'),
      )
    : ''
  return [ctxBlock, hist, `Mensagem do usuário: ${clampText(input.message, 900)}`]
    .filter(Boolean)
    .join('\n\n')
}

/** Roda o pedido na V2. Devolve null quando a rota deve cair na V1. */
export async function runNodiV2(input: OrchestratorInput): Promise<NodiV2Answer | null> {
  if (breakerOpen()) return null

  const startedAt = Date.now()
  const deadline = startDeadline()
  const request = await buildRequestContext(input.admin, input.userId, input.route, input.attachment)
  const tools = buildToolset(input.capabilities)

  const toolCtx: ToolContext = {
    supabase: input.supabase,
    admin: input.admin,
    userId: input.userId,
    request,
    capabilities: input.capabilities,
    budget: { toolCallsUsed: 0, visionCallsUsed: 0 },
    scratch: {},
    deadline,
  }

  const answer: NodiV2Answer = { text: '', source: 'v2' }
  const toolNames: string[] = []

  const session = createNodiLlmSession({
    system: NODI_V2_SYSTEM_PROMPT,
    tools: toDeclarations(tools),
    maxOutputTokens: V2_LIMITS.maxOutputTokens,
    turnTimeoutMs: 20_000,
  })

  try {
    let step: LlmStep = await session.start(buildFirstTurn(input, contextBlock(request)))

    for (let i = 0; i < V2_LIMITS.maxSteps; i++) {
      if (step.type === 'text') {
        answer.text = clampText(step.text || FINAL_FALLBACK_TEXT, 1400)
        break
      }

      // orçamento de tools e tempo — estourou, encerra com instrução final
      const overBudget =
        toolCtx.budget.toolCallsUsed + step.calls.length > V2_LIMITS.maxToolCalls ||
        deadline.remaining() < 5_000 ||
        i === V2_LIMITS.maxSteps - 1

      const results = [] as { call: (typeof step.calls)[number]; output: unknown }[]
      for (const call of step.calls.slice(0, 4)) {
        if (overBudget) {
          results.push({ call, output: { erro: 'limite do pedido atingido — responda agora com o que já tem' } })
          continue
        }
        toolCtx.budget.toolCallsUsed += 1
        toolNames.push(call.name)
        const run = await runTool(tools, call.name, call.args, toolCtx)
        if (run.artifact) mergeArtifact(answer, run.artifact)
        results.push({ call, output: run.output })
      }

      step = await session.continueWithToolResults(results)
    }

    if (!answer.text) answer.text = FINAL_FALLBACK_TEXT

    reportProviderSuccess()
    const usage = session.usage()
    answer.usage = {
      steps: Math.min(V2_LIMITS.maxSteps, toolNames.length + 1),
      toolCalls: toolNames,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      visionCalls: toolCtx.budget.visionCallsUsed,
      durationMs: Date.now() - startedAt,
      model: nodiV2Model(),
    }
    return answer
  } catch (err) {
    reportProviderFailure()
    console.warn('[nodi-v2] orquestrador falhou — fallback V1:', (err as Error)?.message?.slice(0, 160))
    return null
  }
}
