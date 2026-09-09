// lib/estudar/config.ts
//
// Config do módulo Estudar — custos em Nodes e knobs de geração, todos
// CONFIGURÁVEIS por env com default no código (mesmo padrão do
// getRenderFidelityConfig em lib/ai/fidelity/render-only.ts: nada precisa ser
// setado na Vercel pra funcionar; env é override/rollback).
//
//   ESTUDAR_STUDY_NODES     custo do estudo completo (3 alternativas geradas).
//                           Default 45 — paridade com 3 gerações Pulsar/NB2 em
//                           2K no Renderizar (getNodesCost('pulsar','2k') = 15).
//   ESTUDAR_REFINE_NODES    custo de um refinamento localizado (1 geração).
//                           Default 10 (paridade com Pulsar HD).
//   ESTUDAR_RESOLUTION      1K | 2K | 4K (default 2K).
//   ESTUDAR_TIMEOUT_MS      orçamento por geração (default 180000).
//   ESTUDAR_IMAGE_ENDPOINT  endpoint FAL/id do mapeamento GCP usado na geração
//                           (default fal-ai/nano-banana-2/edit — NB2; aceita
//                           fal-ai/nano-banana-pro/edit para qualidade Pro).
//
// CLIENT-SAFE: só strings/números/process.env — o custo chega à UI via server
// component (page.tsx lê aqui e passa por prop; nunca NEXT_PUBLIC, que inlina
// no build).

export type EstudarResolution = '1K' | '2K' | '4K'

export interface EstudarConfig {
  /** Custo do estudo completo (3 alternativas), em nodes. */
  studyNodes: number
  /** Custo de um refinamento localizado, em nodes. */
  refineNodes: number
  resolution: EstudarResolution
  /** Orçamento de tempo POR geração (cada alternativa/refino). */
  timeoutMs: number
  /** Endpoint de imagem (contrato do lib/ai/image-provider). */
  imageEndpoint: string
}

export const ESTUDAR_DEFAULT_STUDY_NODES = 45
export const ESTUDAR_DEFAULT_REFINE_NODES = 10

function positiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

export function getEstudarConfig(): EstudarConfig {
  const rawRes = process.env.ESTUDAR_RESOLUTION?.trim().toUpperCase()
  const resolution: EstudarResolution =
    rawRes === '1K' || rawRes === '2K' || rawRes === '4K' ? rawRes : '2K'
  return {
    studyNodes: positiveIntEnv('ESTUDAR_STUDY_NODES', ESTUDAR_DEFAULT_STUDY_NODES),
    refineNodes: positiveIntEnv('ESTUDAR_REFINE_NODES', ESTUDAR_DEFAULT_REFINE_NODES),
    resolution,
    timeoutMs: positiveIntEnv('ESTUDAR_TIMEOUT_MS', 180_000),
    imageEndpoint: process.env.ESTUDAR_IMAGE_ENDPOINT?.trim() || 'fal-ai/nano-banana-2/edit',
  }
}
