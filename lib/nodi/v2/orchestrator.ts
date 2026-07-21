// ── Orquestrador agentic do Nodi V2 ──────────────────────────────────────────
//
// Loop: contexto + mensagem → modelo (function calling) → tools server-side →
// modelo → … → texto final + artefatos validados. Limites de etapas, tools,
// visão, tokens e uma deadline única governam o request. Qualquer falha do
// provedor alimenta o circuit breaker e devolve null — a ROTA cai na V1
// (o usuário sempre recebe resposta; a V2 é um upgrade, nunca um risco).

import type { SupabaseClient } from '@supabase/supabase-js'
import { clampText } from '../redact'
import { logNodiEvent } from '../telemetry'
import type { NodiTurn } from '../types'
import { verifyIntent } from '../v3/intents'
import { executeRenderIntent } from '../v4/executor'
import { runAutoReview } from '../v4/review'
import { DEFAULT_SETTINGS, checkAutoAllowance, getAutoSpentToday, type NodiSettings } from '../v4/settings'
import {
  V2_LIMITS, breakerOpen, reportProviderFailure, reportProviderSuccess, startDeadline,
} from './budget'
import { buildRequestContext, contextBlock } from './context-pack'
import type { NodiV2Capabilities } from './flags'
import { createNodiLlmSession, nodiV2Model, type LlmStep } from './llm'
import { readProjectMemory } from './memory'
import { NODI_V2_SYSTEM_PROMPT, modeBlock, wrapUntrusted } from './system-prompt'
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
  /** V4: modo de autonomia + limites (default copiloto) */
  settings?: NodiSettings
  /** V4: necessários pro autopiloto executar (chamada interna autenticada) */
  origin?: string
  cookie?: string
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
  const settings = input.settings ?? DEFAULT_SETTINGS
  const request = await buildRequestContext(input.admin, input.userId, input.route, input.attachment)
  // consultor: analisa e recomenda — a tool de ação nem entra no toolset
  const tools = buildToolset(input.capabilities).filter(
    t => !(settings.mode === 'consultor' && t.name === 'propor_acao'),
  )

  // memória do projeto entra de série no contexto (nunca re-perguntar o que já se sabe)
  let memoryBlock = ''
  if (input.capabilities.memory && request.nodi.projectId) {
    const memory = await readProjectMemory(input.supabase, input.userId, request.nodi.projectId).catch(() => null)
    if (memory) {
      const lines = [
        memory.style && `estilo: ${memory.style}`,
        memory.materials && `materiais: ${memory.materials}`,
        memory.lighting && `iluminação: ${memory.lighting}`,
        memory.lockedElements && `não pode mudar: ${memory.lockedElements}`,
        memory.decisions?.length && `decisões aprovadas: ${memory.decisions.join('; ')}`,
        memory.plan && `plano do projeto: "${memory.plan.objective}" — próxima etapa pendente: ${
          memory.plan.steps.find(s => s.status === 'pendente')?.goal ?? 'todas concluídas'}`,
      ].filter(Boolean) as string[]
      if (lines.length) memoryBlock = wrapUntrusted('MEMÓRIA DO PROJETO', lines.join('\n'))
    }
  }

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
    system: NODI_V2_SYSTEM_PROMPT + modeBlock(settings.mode),
    tools: toDeclarations(tools),
    maxOutputTokens: V2_LIMITS.maxOutputTokens,
    turnTimeoutMs: 20_000,
  })

  try {
    const ctxBlock = memoryBlock ? `${contextBlock(request)}\n\n${memoryBlock}` : contextBlock(request)
    let step: LlmStep = await session.start(buildFirstTurn(input, ctxBlock))

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

    // ── V4 · Autopiloto: executa a primeira proposta executável DENTRO dos
    //    limites; fora deles, a proposta fica aguardando confirmação normal.
    if (settings.mode === 'autopiloto' && input.origin && input.cookie) {
      const idx = (answer.proposals ?? []).findIndex(p => p.executable && p.intentToken)
      const proposal = idx >= 0 ? answer.proposals![idx] : null
      const intent = proposal?.intentToken ? verifyIntent(proposal.intentToken, input.userId) : null
      if (proposal && intent) {
        const spentToday = await getAutoSpentToday(input.admin, input.userId)
        const allowance = checkAutoAllowance(settings, intent.cost, spentToday)
        if (allowance.allowed) {
          const result = await executeRenderIntent(input.origin, input.cookie, intent)
          if (result.ok && result.outputUrl) {
            answer.executed = { outputUrl: result.outputUrl, renderId: result.renderId ?? null, cost: intent.cost, auto: true }
            answer.proposals!.splice(idx, 1)
            void logNodiEvent(input.admin, {
              userId: input.userId, event: 'v3_executed', route: input.route,
              meta: { kind: 'render', cost: intent.cost, auto: true, count: 1 },
            })
            if (settings.autoReview && input.capabilities.multimodal) {
              const review = await runAutoReview(intent.params.inputUrl, result.outputUrl, 30_000)
              if (review) {
                answer.review = {
                  summary: review.report.summary,
                  decision: review.outcome.decision,
                  reason: review.outcome.reason,
                  findings: review.report.findings,
                }
              }
            }
          } else {
            answer.text += `\n\nAutopiloto: a execução falhou (${result.error ?? 'erro'}). Nodes estornados quando debitados.`
          }
        } else {
          answer.text += `\n\nAutopiloto: ${allowance.reason} — deixei a proposta aguardando sua confirmação.`
        }
      }
    }

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
