// ── Nodi V4 — próxima melhor ação (determinística, custo zero de LLM) ────────
//
// Analisa o estado recente (histórico + saldo + onde o usuário está) e sugere
// UM próximo passo com o formato exigido pelo produto: o que foi identificado,
// qual ação, por quê, custo estimado e se precisa de aprovação. Regras puras
// e testáveis; roda no bootstrap do painel (sem modelo, sem espera).

import { getNodesCost } from '@/lib/engines'
import { getUpscaleCost } from '@/lib/spaces/economy'
import type { GenerationSummary } from '../types'

export interface NextBestAction {
  identified: string
  action: string
  why: string
  estimatedNodes: number | null
  needsApproval: boolean
  /** como o painel executa: navegar, abrir o fluxo de problema, ou mandar pro chat */
  kind: 'navigate' | 'problem' | 'chat'
  href?: string
  chatPrompt?: string
}

export interface NextActionInput {
  recent: GenerationSummary[]
  balance: number | null
  moduleId: string | null
}

const CHEAPEST_RENDER = getNodesCost('pulsar', 'hd')

export function computeNextBestAction(input: NextActionInput): NextBestAction | null {
  const { recent, balance } = input
  const last = recent[0]

  if (last && (last.status === 'failed' || last.status === 'refunded')) {
    return {
      identified: `A última geração (${last.tool}) falhou.`,
      action: 'Diagnosticar a falha agora',
      why: 'Identificar a causa evita repetir o erro e gastar nodes à toa.',
      estimatedNodes: 0,
      needsApproval: false,
      kind: 'problem',
    }
  }

  if (balance !== null && balance < CHEAPEST_RENDER) {
    return {
      identified: `Saldo de ${balance} nodes — abaixo do custo da geração mais barata (${CHEAPEST_RENDER}).`,
      action: 'Rever plano ou recarregar com Lumens',
      why: 'Sem saldo, qualquer fluxo trava no meio.',
      estimatedNodes: 0,
      needsApproval: false,
      kind: 'navigate',
      href: '/app/billing',
    }
  }

  if (last?.status === 'processing' || last?.status === 'pending') {
    return {
      identified: `Há uma geração de ${last.tool} em andamento.`,
      action: 'Acompanhar o status',
      why: 'Melhor esperar o resultado antes de decidir o próximo passo.',
      estimatedNodes: 0,
      needsApproval: false,
      kind: 'chat',
      chatPrompt: 'Como está minha geração em andamento?',
    }
  }

  if (last?.status === 'completed' && last.kind === 'render') {
    const upscaledAfter = recent.some(
      g => g.kind === 'upscale' && (g.createdAt ?? '') > (last.createdAt ?? ''),
    )
    if (!upscaledAfter) {
      return {
        identified: `Render concluída (${last.engine ?? last.tool}) sem versão ampliada.`,
        action: 'Ampliar a render aprovada',
        why: 'Iterar em 2K e ampliar só a versão final é o caminho mais econômico para entrega.',
        estimatedNodes: getUpscaleCost('2k'),
        needsApproval: true,
        kind: 'navigate',
        href: '/app/upscale',
      }
    }
  }

  if (last?.status === 'completed' && (last.kind === 'upscale' || last.kind === 'render')) {
    const hasVideo = recent.some(g => g.kind === 'video')
    if (!hasVideo) {
      return {
        identified: 'Imagem finalizada sem vídeo de apresentação.',
        action: 'Animar a imagem aprovada',
        why: 'Um vídeo curto eleva a apresentação ao cliente sem novo trabalho de modelagem.',
        estimatedNodes: 60,
        needsApproval: true,
        kind: 'chat',
        chatPrompt: 'Quero animar minha última imagem para apresentar ao cliente. O que você sugere?',
      }
    }
  }

  if (!last) {
    return {
      identified: 'Nenhuma geração recente na conta.',
      action: 'Renderizar um print do seu modelo',
      why: 'É o ponto de partida do fluxo — a partir dela vêm edição, ampliação e vídeo.',
      estimatedNodes: getNodesCost('vega', '2k'),
      needsApproval: true,
      kind: 'navigate',
      href: '/app/generate',
    }
  }

  return null // nada de sugestão forçada — silêncio também é UX
}
