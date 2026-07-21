// Toolset final por capacidade: visão/ações/memória só entram no toolset
// quando a flag correspondente está ligada — o modelo nem fica sabendo que
// existem (menos tokens, menos superfície).

import type { NodiV2Capabilities } from '../flags'
import { readTools } from './read-tools'
import { visionTools } from './vision-tools'
import { actionTools } from './action-tools'
import type { NodiTool } from './registry'

export function buildToolset(caps: NodiV2Capabilities): NodiTool[] {
  const tools: NodiTool[] = [...readTools.filter(t => caps.memory || t.name !== 'consultar_memoria_projeto')]
  if (caps.multimodal) tools.push(...visionTools)
  for (const tool of actionTools) {
    if (tool.name === 'propor_acao' && !caps.actions) continue
    if ((tool.name === 'propor_memoria' || tool.name === 'propor_plano_projeto') && !caps.memory) continue
    tools.push(tool)
  }
  return tools
}

export { toDeclarations, runTool, type NodiTool, type ToolContext } from './registry'
