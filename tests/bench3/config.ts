// Bench do Renderizar 3.0: catálogo de candidatos, tarifas e régua econômica.
//
// Fonte das decisões: docs/SPACENODE-3.0-RENDERIZAR.md (estudo de 26/11/2026).
// Tudo aqui é client-safe e puro: nenhuma chamada de rede. As tarifas são
// ESTIMATIVAS para planejar e limitar gasto. O valor cobrado de verdade sai das
// faturas dos fornecedores (painel /admin/custos). `verified` diz se o número
// foi lido na página oficial do fornecedor (true) ou de terceiros (false).

import type { RenderEngineId } from '@/lib/orion/config'

// ── Régua econômica ─────────────────────────────────────────────────────────

export const FX_BRL_PER_USD = 5.4
/** Essence anual: R$ 1.341/ano ÷ 12 = R$ 111,75/mês por 800 nodes. */
export const ESSENCE_ANNUAL_NODE_BRL = 111.75 / 800
/** Studio anual: R$ 374,25/mês por 4.000 nodes — a menor receita por node da vitrine. */
export const STUDIO_ANNUAL_NODE_BRL = 374.25 / 4000
export const TARGET_MARGIN = 0.75
/** Falhas cobradas, fallback e arredondamento — mesmo fator de lib/edit-v4/pricing. */
export const WASTAGE_FACTOR = 1.08

export const nodeUsd = (nodeBrl: number, fx = FX_BRL_PER_USD) => nodeBrl / fx

// ── Geração (camada 2) ──────────────────────────────────────────────────────

export type GenFamily = 'google' | 'bytedance' | 'openai' | 'microsoft' | 'xai'

export interface GeneratorSpec {
  id: string
  label: string
  family: GenFamily
  falEndpoint: string
  /** Perfil de prompt de produção mais próximo (lib/ai/render-prompt-profile). */
  promptProfile: RenderEngineId
  /** Estimativa por imagem ~2K via fal, com 1 imagem de entrada. */
  estUsd: number
  verified: boolean
  priceNote: string
  /** Faixa do catálogo 3.0 em que o motor concorre. */
  tier: 'rascunho' | 'padrao' | 'premium'
  /** Parâmetros do endpoint além de prompt/image_urls. */
  params: (src: { width: number; height: number } | null) => Record<string, unknown>
}

/** Lado maior ~2K, mantendo o aspecto do original (para os endpoints com WxH livre). */
export function size2k(src: { width: number; height: number } | null, maxPixels = 4_000_000) {
  if (!src) return null
  const scale = Math.sqrt(maxPixels / (src.width * src.height))
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16)
  return { width: round16(src.width * scale), height: round16(src.height * scale) }
}

export const GENERATORS: GeneratorSpec[] = [
  {
    id: 'nb21', label: 'Nano Banana 2.1', family: 'google', tier: 'padrao',
    falEndpoint: 'google/nano-banana-2.1/edit', promptProfile: 'pulsar',
    estUsd: 0.062, verified: false,
    priceNote: 'fal: US$35,294/M tokens de imagem de saída (Google direto: US$0,0504 em 2K)',
    params: () => ({ resolution: '2K', aspect_ratio: 'auto', output_format: 'png', num_images: 1 }),
  },
  {
    id: 'seedream55', label: 'Seedream 5.5', family: 'bytedance', tier: 'padrao',
    falEndpoint: 'bytedance/seedream/v5.5/edit', promptProfile: 'quasar',
    estUsd: 0.0525, verified: true,
    priceNote: 'fal: US$0,0405 em 2K + US$0,012 por imagem de entrada',
    params: () => ({ image_size: 'auto_2K', output_format: 'png', num_images: 1 }),
  },
  {
    id: 'seedream5pro', label: 'Seedream 5.0 Pro (Quasar atual, controle)', family: 'bytedance', tier: 'padrao',
    falEndpoint: 'bytedance/seedream/v5/pro/edit', promptProfile: 'quasar',
    estUsd: 0.135, verified: true,
    priceNote: 'fal: US$0,0675 até 1536² · US$0,135 acima (prod usa ModelArk: US$0,045/0,09)',
    params: () => ({ image_size: 'auto_2K', output_format: 'png', num_images: 1 }),
  },
  {
    id: 'gpt26sunburst', label: 'GPT Image 2.6 Sunburst (high)', family: 'openai', tier: 'premium',
    falEndpoint: 'openai/gpt-image-2.6/sunburst/edit', promptProfile: 'orion',
    estUsd: 0.13, verified: false,
    priceNote: 'fal: US$30/M tokens de imagem de saída, US$8/M de entrada; ~US$0,115 a 2160² + entrada',
    params: src => ({ quality: 'high', image_size: size2k(src, 2048 * 2048) ?? 'auto', output_format: 'png', num_images: 1 }),
  },
  {
    id: 'mai27', label: 'MAI-Image-2.7', family: 'microsoft', tier: 'premium',
    falEndpoint: 'microsoft/mai-image-2.7/edit', promptProfile: 'orion',
    estUsd: 0.15, verified: false,
    priceNote: 'fal: US$34/M tokens de saída; ~1.024 tokens por MP → ~US$0,14 em 2K (4 MP)',
    params: () => ({ resolution: '2K', output_format: 'png' }),
  },
  {
    id: 'grok2', label: 'Grok Imagine Image 2.0 (medium)', family: 'xai', tier: 'padrao',
    falEndpoint: 'xai/grok-imagine-image/v2.0/edit', promptProfile: 'orion',
    estUsd: 0.09, verified: true,
    priceNote: 'fal: US$0,08 em 2K medium + US$0,01 por imagem de entrada',
    params: () => ({ resolution: '2k', quality: 'medium', aspect_ratio: 'auto', output_format: 'png', num_images: 1 }),
  },
  {
    id: 'seedream5flash', label: 'Seedream 5.0 Flash', family: 'bytedance', tier: 'rascunho',
    falEndpoint: 'bytedance/seedream/v5/flash/edit', promptProfile: 'quasar',
    estUsd: 0.027, verified: true,
    priceNote: 'fal: US$0,027 por imagem',
    params: () => ({ image_size: 'auto_2K', output_format: 'png', num_images: 1 }),
  },
  {
    id: 'mai27flash', label: 'MAI-Image-2.7 Flash', family: 'microsoft', tier: 'rascunho',
    falEndpoint: 'microsoft/mai-image-2.7/flash/edit', promptProfile: 'orion',
    estUsd: 0.045, verified: false,
    priceNote: 'fal: US$10/M tokens de saída; ~US$0,041 em 2K + entrada',
    params: () => ({ resolution: '2K', output_format: 'png' }),
  },
]

// ── Leitores e juízes (camadas 1 e 3) ───────────────────────────────────────

export type LlmProvider = 'anthropic' | 'openai' | 'gemini'
export type LlmFamily = 'anthropic' | 'openai' | 'google'

export interface LlmSpec {
  id: string
  label: string
  provider: LlmProvider
  family: LlmFamily
  /** ID exato do modelo no fornecedor. Sobrescrevível por env (BENCH3_MODEL_<ID>). */
  model: string
  inPerM: number
  outPerM: number
  verified: boolean
  priceNote: string
}

export const LLMS: LlmSpec[] = [
  { id: 'opus55', label: 'Claude Opus 5.5', provider: 'anthropic', family: 'anthropic', model: 'claude-opus-5-5',
    inPerM: 4, outPerM: 20, verified: true, priceNote: 'Anthropic, tabela de 03/11/2026' },
  { id: 'sonnet55', label: 'Claude Sonnet 5.5', provider: 'anthropic', family: 'anthropic', model: 'claude-sonnet-5-5',
    inPerM: 2, outPerM: 10, verified: true, priceNote: 'Anthropic, tabela de 03/11/2026' },
  { id: 'haiku55', label: 'Claude Haiku 5.5', provider: 'anthropic', family: 'anthropic', model: 'claude-haiku-5-5',
    inPerM: 0.1, outPerM: 0.5, verified: true, priceNote: 'Anthropic, até 100k tokens de prompt' },
  { id: 'gpt55', label: 'GPT-5.5', provider: 'openai', family: 'openai', model: 'gpt-5.5',
    inPerM: 5, outPerM: 30, verified: true, priceNote: 'OpenAI, abaixo de 272k tokens' },
  { id: 'gemini31pro', label: 'Gemini 3.1 Pro', provider: 'gemini', family: 'google', model: 'gemini-3.1-pro-preview',
    inPerM: 2, outPerM: 12, verified: true, priceNote: 'Google, ≤200k tokens; ID do modelo a confirmar no check' },
  { id: 'gemini38flash', label: 'Gemini 3.8 Flash', provider: 'gemini', family: 'google', model: 'gemini-3.8-flash',
    inPerM: 0.75, outPerM: 3.75, verified: true, priceNote: 'Google, preço até 31/12/2026 (dobra em 01/01/2027); ID a confirmar' },
]

export function llmModel(spec: LlmSpec): string {
  return process.env[`BENCH3_MODEL_${spec.id.toUpperCase()}`]?.trim() || spec.model
}

/** Família do gerador → família do LLM que NÃO pode julgá-lo (autopreferência). */
export const SAME_FAMILY: Record<GenFamily, LlmFamily | null> = {
  google: 'google', openai: 'openai', bytedance: null, microsoft: null, xai: null,
}

// ── Defaults das fases ──────────────────────────────────────────────────────

export const DEFAULT_READERS = ['opus55', 'sonnet55', 'haiku55', 'gpt55', 'gemini31pro', 'gemini38flash']
export const DEFAULT_GENERATORS = GENERATORS.map(g => g.id)
/** GPT-5.5 fica fora do default do juiz: custa ~3× o Sonnet por conferência. */
export const DEFAULT_JUDGES = ['sonnet55', 'haiku55', 'gemini31pro', 'gemini38flash']
export const DEFAULT_REPEAT = 2

/** Estimativa de tokens por chamada, para o plano de custo (medido depois no ledger). */
export const TOKENS = {
  read:  { input: 2_400, output: 2_000 },
  judge: { input: 5_200, output: 900 },
}

export const genById = (id: string) => GENERATORS.find(g => g.id === id)
export const llmById = (id: string) => LLMS.find(l => l.id === id)
