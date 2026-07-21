// ── Registry de tools do Nodi V2 ─────────────────────────────────────────────
//
// Cada tool: schema (validado ANTES do handler — argumento do modelo nunca é
// confiável), handler server-side e, opcionalmente, um ARTEFATO que entra no
// envelope da resposta (cards do painel). O modelo recebe só `output`
// (JSON pequeno); artefatos não voltam pro modelo inteiros — economia de
// tokens e menos superfície de injection reflexiva.
//
// O modelo NUNCA toca banco/Storage/credenciais: toda tool roda aqui, com o
// client do usuário (RLS) ou admin quando a leitura exige (saldo do pagador).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Deadline } from '../budget'
import type { NodiV2Capabilities } from '../flags'
import type { RequestContext } from '../context-pack'
import type { NodiV2Answer } from '../types'
import { validateObject, specToJsonSchema, type ObjectSpec } from '../validate'
import type { LlmFunctionDecl } from '../llm'

export interface ToolBudget {
  toolCallsUsed: number
  visionCallsUsed: number
}

/** Rascunho compartilhado entre tools DO MESMO request (ex.: o modelo manda
 *  settings no apply_settings e o start_generation herda o que faltar). */
export interface ToolScratch {
  lastSettings?: Record<string, string>
  lastPrompt?: string
}

export interface ToolContext {
  supabase: SupabaseClient
  admin: SupabaseClient
  userId: string
  request: RequestContext
  capabilities: NodiV2Capabilities
  budget: ToolBudget
  scratch: ToolScratch
  deadline: Deadline
}

export interface ToolRun {
  /** resposta compacta devolvida ao modelo */
  output: unknown
  /** artefato validado que entra no envelope (cards do painel) */
  artifact?: Partial<NodiV2Answer>
}

export interface NodiTool {
  name: string
  description: string
  /** spec plano validado genericamente; tools com estrutura aninhada validam extra no handler */
  spec: ObjectSpec
  /** JSON Schema custom quando o spec plano não descreve tudo (ex.: etapas do plano) */
  schemaOverride?: Record<string, unknown>
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolRun>
}

export function toDeclarations(tools: NodiTool[]): LlmFunctionDecl[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.schemaOverride ?? specToJsonSchema(t.spec),
  }))
}

/** Executa uma tool com validação e captura de erro — erro vira output
 *  estruturado pro modelo se corrigir; nunca derruba o loop. */
export async function runTool(
  tools: NodiTool[],
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRun> {
  const tool = tools.find(t => t.name === name)
  if (!tool) return { output: { erro: `tool desconhecida: ${name}` } }
  const check = validateObject(rawArgs, tool.spec)
  if (!check.ok) return { output: { erro: 'argumentos inválidos', detalhes: check.errors } }
  try {
    return await tool.handler({ ...rawArgs, ...check.value }, ctx)
  } catch (err) {
    const msg = (err as Error)?.message ?? 'falha interna'
    // mensagem de erro de tool é gerada por nós (não ecoa dado bruto do provider)
    return { output: { erro: `a consulta falhou: ${msg.slice(0, 140)}` } }
  }
}
