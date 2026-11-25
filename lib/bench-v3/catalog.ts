// lib/bench-v3/catalog.ts
//
// Catálogo da bancada SpaceNode 3.0: motores de imagem (camada 2) e LLMs de
// visão (camadas 1 e 3), com IDs de modelo e tarifas usadas para ESTIMAR o
// custo antes de cada chamada.
//
// Regras:
// - IDs de modelo podem ser trocados por env sem mexer no código. A fase
//   `preflight` confere nos fornecedores, sem custo, se cada ID existe.
// - As tarifas aqui são o TETO conservador da pesquisa de 25/11/2026
//   (docs/SPACENODE-3.0.md). O custo REAL vem da resposta do fornecedor
//   (tokens ou dimensão entregue) quando existe, e é ele que vai para o
//   relatório. Tarifa desconhecida nunca vira zero.

export type ImageProviderKind = 'ark' | 'fal' | 'gemini' | 'openai'
export type VisionProviderKind = 'anthropic' | 'gemini' | 'openai' | 'xai'
/** Perfil de prompt de produção mais próximo de cada família (lib/prompts). */
export type PromptProfile = 'quasar' | 'pulsar' | 'vega' | 'orion'

export interface ImageEngine {
  id: string
  label: string
  provider: ImageProviderKind
  /** ID do modelo no fornecedor (Ark, Gemini, OpenAI) ou endpoint da fal. */
  model: string
  /** Rota alternativa na fal quando a principal não tem chave/ID. */
  falEndpoint?: string
  promptProfile: PromptProfile
  /** 'preset2k' = mesmo pedido da produção atual; 'long2048' = lado maior 2048. */
  size: 'preset2k' | 'long2048'
  /** Teto de custo por imagem (US$), usado para reservar orçamento. */
  maxUsd: number
  /** Tarifa na rota fal, quando diferente (a fal não devolve custo). */
  falUsd?: number
  /** Custo pela dimensão entregue, quando o fornecedor cobra por área. */
  costForPixels?: (pixels: number, inputImages: number) => number
  timeoutMs: number
}

export interface VisionModel {
  id: string
  label: string
  provider: VisionProviderKind
  model: string
  /** US$ por 1M tokens: entrada, saída. */
  usdPerMTok: [number, number]
  /** Fonte da tarifa: 'oficial' ou 'secundaria'. */
  tariff: 'oficial' | 'secundaria'
}

const env = (name: string, fallback: string) => process.env[name]?.trim() || fallback

// ModelArk cobra por área de saída em duas faixas, mais um valor por imagem
// de entrada (conferido no repo para o 5.0 Pro; secundário para 5.5 e Flash).
const arkTier = (low: number, high: number, maxLowPx: number, perInput: number, freeInputs: number) =>
  (pixels: number, inputs: number) =>
    (pixels > 0 && pixels <= maxLowPx ? low : high) + perInput * Math.max(0, inputs - freeInputs)

export function imageEngines(): ImageEngine[] {
  return [
    {
      id: 'seedream-5.0-pro',
      label: 'Seedream 5.0 Pro (controle: Quasar atual)',
      provider: 'ark',
      model: env('BENCH_V3_SEEDREAM_PRO_MODEL', 'dola-seedream-5-0-pro-260628'),
      falEndpoint: 'bytedance/seedream/v5/pro/edit',
      promptProfile: 'quasar',
      size: 'preset2k',
      maxUsd: 0.09,
      falUsd: 0.135,
      costForPixels: arkTier(0.045, 0.09, 2_610_000, 0.003, 1),
      timeoutMs: 240_000,
    },
    {
      id: 'seedream-5.5',
      label: 'Seedream 5.5',
      provider: 'ark',
      model: env('BENCH_V3_SEEDREAM_55_MODEL', 'dola-seedream-5-5-261028'),
      falEndpoint: 'bytedance/seedream/v5.5/edit',
      promptProfile: 'quasar',
      size: 'long2048',
      maxUsd: 0.043,
      falUsd: 0.0525,
      costForPixels: arkTier(0.02, 0.035, 2_600_000, 0.008, 0),
      timeoutMs: 240_000,
    },
    {
      id: 'seedream-5.0-flash',
      label: 'Seedream 5.0 Flash',
      provider: 'fal',
      model: env('BENCH_V3_SEEDREAM_FLASH_ENDPOINT', 'bytedance/seedream/v5/flash/edit'),
      promptProfile: 'quasar',
      size: 'long2048',
      maxUsd: 0.027,
      timeoutMs: 180_000,
    },
    {
      id: 'nano-banana-2.1',
      label: 'Nano Banana 2.1',
      provider: 'gemini',
      // ID não confirmado em fonte oficial: o preflight lista os modelos de
      // imagem da chave e aponta o certo.
      model: env('BENCH_V3_NB21_MODEL', 'gemini-3.6-flash-image-preview'),
      promptProfile: 'pulsar',
      size: 'long2048',
      maxUsd: 0.055,
      timeoutMs: 180_000,
    },
    {
      id: 'gpt-image-2.6-flare',
      label: 'GPT Image 2.6 Flare (high)',
      provider: 'openai',
      model: env('BENCH_V3_GPT26_FLARE_MODEL', 'gpt-image-2.6-flare'),
      promptProfile: 'orion',
      size: 'long2048',
      maxUsd: 0.07,
      timeoutMs: 240_000,
    },
    {
      id: 'gpt-image-2.6-sunburst',
      label: 'GPT Image 2.6 Sunburst (high)',
      provider: 'openai',
      model: env('BENCH_V3_GPT26_SUNBURST_MODEL', 'gpt-image-2.6-sunburst'),
      promptProfile: 'orion',
      size: 'long2048',
      maxUsd: 0.07,
      timeoutMs: 300_000,
    },
  ]
}

export function visionModels(): VisionModel[] {
  return [
    { id: 'claude-opus-5.5',   label: 'Claude Opus 5.5',   provider: 'anthropic', model: 'claude-opus-5-5',   usdPerMTok: [4, 20],     tariff: 'oficial' },
    { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5', provider: 'anthropic', model: 'claude-sonnet-5-5', usdPerMTok: [2, 10],     tariff: 'oficial' },
    { id: 'claude-haiku-5.5',  label: 'Claude Haiku 5.5',  provider: 'anthropic', model: 'claude-haiku-5-5',  usdPerMTok: [0.1, 0.5],  tariff: 'oficial' },
    { id: 'gemini-3.5-flash',  label: 'Gemini 3.5 Flash',  provider: 'gemini',    model: env('BENCH_V3_GEMINI_FLASH_MODEL', 'gemini-3.5-flash'), usdPerMTok: [1.5, 9], tariff: 'secundaria' },
    // Leitor atual da produção (lib/fidelity-engine.ts): linha de base.
    { id: 'gemini-2.5-flash',  label: 'Gemini 2.5 Flash (atual)', provider: 'gemini', model: 'gemini-2.5-flash', usdPerMTok: [0.3, 2.5], tariff: 'secundaria' },
    { id: 'gpt-6.1-terra',     label: 'GPT-6.1 Terra',     provider: 'openai',    model: env('BENCH_V3_GPT_VISION_MODEL', 'gpt-6.1-terra'), usdPerMTok: [1, 5], tariff: 'secundaria' },
    { id: 'grok-4.7',          label: 'Grok 4.7',          provider: 'xai',       model: env('BENCH_V3_GROK_MODEL', 'grok-4.7'), usdPerMTok: [2, 6], tariff: 'secundaria' },
  ]
}

/** Leitores da camada 1 e juízes da camada 3 testados por padrão. */
export const DEFAULT_READERS = ['claude-opus-5.5', 'claude-sonnet-5.5', 'claude-haiku-5.5', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gpt-6.1-terra', 'grok-4.7']
export const DEFAULT_JUDGES = ['claude-haiku-5.5', 'claude-sonnet-5.5', 'gemini-3.5-flash', 'gpt-6.1-terra', 'claude-opus-5.5']

/** Tokens de referência para reservar orçamento antes da chamada (teto, não média). */
export const TOKEN_CEILING = {
  reader: { input: 6_000, output: 4_000 },
  judge:  { input: 9_000, output: 2_500 },
} as const

export function tokenCostUsd(m: VisionModel, inputTokens: number, outputTokens: number): number {
  return (inputTokens * m.usdPerMTok[0] + outputTokens * m.usdPerMTok[1]) / 1_000_000
}

export function reserveUsd(m: VisionModel, role: keyof typeof TOKEN_CEILING): number {
  const t = TOKEN_CEILING[role]
  return tokenCostUsd(m, t.input, t.output)
}

/** Filtra por lista de IDs vinda de env (vírgulas); sem env, devolve `defaults`. */
export function pick<T extends { id: string }>(all: T[], raw: string | undefined, defaults?: string[]): T[] {
  const ids = (raw?.split(',').map(s => s.trim()).filter(Boolean)) ?? defaults
  if (!ids) return all
  const unknown = ids.filter(id => !all.some(x => x.id === id))
  if (unknown.length) throw new Error(`IDs desconhecidos: ${unknown.join(', ')}`)
  return ids.map(id => all.find(x => x.id === id) as T)
}

/** Lado maior 2048 no aspecto da entrada, múltiplos de 16. */
export function long2048(width: number, height: number): { width: number; height: number } {
  const r16 = (v: number) => Math.max(16, Math.round(v / 16) * 16)
  return width >= height
    ? { width: 2048, height: r16(2048 * height / width) }
    : { width: r16(2048 * width / height), height: 2048 }
}
