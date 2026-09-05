// ── Engines: Vega · Pulsar · Quasar ──────────────────────────────────────────
//
// Fonte de verdade da arquitetura de geração — endpoints da Fal.ai, resoluções
// suportadas por engine, e a tabela de custos em nodes (engine × resolução).
//
// Quando precisar mudar custo, adicionar engine, ou liberar uma resolução,
// edita só este arquivo. UI, API e migrations leem daqui.

export type EngineId   = 'vega' | 'quasar' | 'pulsar'
export type Resolution = 'hd' | '2k' | '4k'

export interface EngineConfig {
  id:          EngineId
  name:        string
  tagline:     string                              // texto curto pro card
  description: string                              // tooltip / detalhe
  falEndpoint: string
  resolutions: Resolution[]                        // ordem de exibição
  nodes:       Partial<Record<Resolution, number>> // custo por resolução
}

export const ENGINES: Record<EngineId, EngineConfig> = {
  vega: {
    id:          'vega',
    name:        'Vega',
    tagline:     'Premium',
    description: 'Fidelidade absoluta. Entrega final, edição preserva o projeto pixel-by-pixel.',
    falEndpoint: 'fal-ai/nano-banana-pro/edit',
    resolutions: ['2k', '4k'],
    nodes:       { '2k': 20, '4k': 40 },
  },
  pulsar: {
    id:          'pulsar',
    name:        'Pulsar',
    tagline:     'Rápido',
    description: 'Iteração e volume. Exploração rápida em alta velocidade.',
    falEndpoint: 'fal-ai/nano-banana-2/edit',
    resolutions: ['hd', '2k', '4k'],
    nodes:       { 'hd': 10, '2k': 15, '4k': 25 },
  },
  quasar: {
    id:          'quasar',
    name:        'Quasar',
    tagline:     'Especial',
    description: 'Tipografia, multi-referência e diversificação de provedor.',
    // Seedream 5.0 Pro Edit (ByteDance via fal.ai) — padrão desde 2026-09-05,
    // substituiu o GPT Image 2 ('openai/gpt-image-2/edit') após teste em prod.
    // Só FAL (sem mapeamento GCP). Schema conferido em 2026-09-04: prompt,
    // image_urls, image_size, num_images, output_format, sync_mode,
    // enable_safety_checker. Sem seed/quality/aspect_ratio.
    // Sem 4K: o endpoint Pro da fal tem teto de 2048×2048 (pedido explícito de
    // 4096×4096 volta em 2048×2048 — medido em 2026-09-05), por isso o Quasar
    // só oferece 2K.
    falEndpoint: 'bytedance/seedream/v5/pro/edit',
    resolutions: ['2k'],
    nodes:       { '2k': 28 },
  },
}

// ── Defaults / ordem de exibição ─────────────────────────────────────────────

export const ENGINE_ORDER:       EngineId[]  = ['vega', 'pulsar', 'quasar']
export const DEFAULT_ENGINE:     EngineId    = 'vega'
export const DEFAULT_RESOLUTION: Resolution  = '2k'

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isValidCombination(engine: EngineId, resolution: Resolution): boolean {
  const config = ENGINES[engine]
  if (!config) return false
  return config.resolutions.includes(resolution)
}

export function getNodesCost(engine: EngineId, resolution: Resolution): number {
  const config = ENGINES[engine]
  if (!config) throw new Error(`Engine inválida: ${engine}`)
  const cost = config.nodes[resolution]
  if (cost === undefined) {
    throw new Error(`Resolução ${resolution} não disponível na engine ${engine}`)
  }
  return cost
}

export function getFalEndpoint(engine: EngineId): string {
  const config = ENGINES[engine]
  if (!config) throw new Error(`Engine inválida: ${engine}`)
  return config.falEndpoint
}

export function isEngineId(value: unknown): value is EngineId {
  return value === 'vega' || value === 'quasar' || value === 'pulsar'
}

export function isResolution(value: unknown): value is Resolution {
  return value === 'hd' || value === '2k' || value === '4k'
}
