import type { NodiTurn } from './types'
import type { NodiAttachment, NodiV2Answer } from './v2/types'

/** A paid proposal must remain in chat until confirmed, not navigate away. */
export function automaticHandoff(answer: NodiV2Answer, attachment: NodiAttachment | null) {
  if (attachment?.kind === 'upload' || answer.proposals?.some(p => p.executable)) return null
  return answer.proposals?.find(p => !p.executable &&
    (p.type === 'navigate' || p.type === 'fill_prompt' || p.type === 'apply_settings')) ?? null
}

export interface ConversationMessage {
  role: 'user' | 'nodi'; kind: string; text?: string
  generationRef?: NodiAttachment; projectScope?: string | null
  v2?: NodiV2Answer
}

/** Keep confirmed results and proposed configuration; never include URLs or intents. */
export function conversationTurns(messages: ConversationMessage[]): NodiTurn[] {
  return messages.filter(m => ['text', 'v2', 'executed'].includes(m.kind) && m.text).slice(-8).map(m => ({
    role: m.role, at: 0,
    text: [m.text?.slice(0, 350),
      m.generationRef && (m.generationRef.kind === 'upload' ? 'Referência: print enviado pelo usuário, ainda sem resultado gerado' : `Referência de resultado: ${m.generationRef.kind} ${m.generationRef.id}`),
      m.v2?.promptSuggestion && `Direção proposta: ${m.v2.promptSuggestion.prompt.slice(0, 140)}`,
      m.v2?.recommendation && `Configuração proposta: ${JSON.stringify(m.v2.recommendation.settings).slice(0, 120)}`,
      m.v2?.plan && `Objetivo proposto: ${m.v2.plan.objective.slice(0, 100)}`,
    ].filter(Boolean).join('\n').slice(0, 700),
  }))
}

export function latestConversationImage(messages: ConversationMessage[], projectId: string | null): NodiAttachment | null {
  return [...messages].reverse().find(m => m.generationRef && m.generationRef.kind !== 'video' && m.projectScope === projectId)?.generationRef ?? null
}

/** A question or a qualified yes is not authorization to spend Nodes. */
export function isActionConfirmation(text: string): boolean {
  const clean = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[.!]+$/, '').trim()
  return /^(sim|pode|confirmar|confirmo|confirma|executa|ok|sim[, ]+pode(?: gerar| executar)?|pode (?:gerar|executar)|confirmo (?:a geracao|a execucao))$/.test(clean)
}
