// ── Camada de IA do Nodi — contrato ──────────────────────────────────────────
//
// O Nodi NÃO é acoplado a um fornecedor: a rota /api/nodi/ask fala só com esta
// interface. A base de conhecimento responde sozinha os casos de score alto;
// o provedor entra quando a pergunta é livre — sempre ANCORADO nas entradas
// candidatas da base (grounding), nunca inventando recurso ou valor.
//
// Pra plugar outro fornecedor (Claude, GPT, modelo local…): implementar
// NodiAiProvider e registrá-lo em ./index.ts. Passo a passo em docs/NODI.md.

import type { NodiConfidence, NodiContext, NodiTurn } from '../types'
import type { KBAnswerPayload } from '../knowledge'

export interface NodiProviderInput {
  question: string
  context: NodiContext
  /** Últimos turnos da conversa (já truncados pela rota). */
  history: NodiTurn[]
  /** Entradas da base que melhor casaram — o grounding da resposta. */
  kbCandidates: KBAnswerPayload[]
}

export interface NodiProviderResult {
  text: string
  confidence: NodiConfidence
  /** true = o próprio modelo reconhece que não fecha a resposta com segurança. */
  needsSupport: boolean
}

export interface NodiAiProvider {
  /** id curto pra telemetria ("gemini", "claude"…). */
  id: string
  answer(input: NodiProviderInput): Promise<NodiProviderResult>
}
