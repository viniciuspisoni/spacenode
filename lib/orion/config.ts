// ── Orion · Experimental (piloto interno do GPT Image 2.5) ───────────────────
//
// Catálogo EXCLUSIVO do Renderizar. EngineId/ENGINE_ORDER/ENGINES continuam
// sendo o catálogo PÚBLICO (Vega · Pulsar · Quasar) — compartilhado por Spaces,
// Editar, plugin SketchUp, Nodi e histórico. Orion nunca entra lá: quem precisa
// dele fala este vocabulário (RenderEngineId), e só depois de passar por
// canUseOrion (lib/orion/access).
//
// Este arquivo é client-safe de propósito (o card do motor precisa dele): não
// lê env privada nem importa nada de servidor. A escolha de fornecedor
// (ORION_IMAGE_PROVIDER) vive em lib/orion/provider.ts, que é server-only.
//
// Motor público (2026-09-11): 2K ou 4K, uma imagem por solicitação, cobrando
// nodes como Vega/Pulsar/Quasar (ver ORION_NODES abaixo). Variante e
// qualidade não são mais escolha do usuário — o servidor sempre usa Flare
// (empiricamente mais rápida, mesma tarifa e fidelidade estatisticamente
// igual à Sunburst — ver docs/ORION-PILOTO-2026-09-10.md §3) em qualidade
// `high` (única testada com variância aceitável). 4K é 4K UHD (3840 no lado
// maior, teto real da Image API) — não os 4096 px do rótulo "4K" de
// Vega/Pulsar.

import { ENGINES, isEngineId, type EngineId, type Resolution } from '@/lib/engines'

export type RenderEngineId = EngineId | 'orion'
export type OrionVariant = 'sunburst' | 'flare'
export type OrionQuality = 'medium' | 'high'
export type OrionProvider = 'openai' | 'fal'

/** Modelos exatos da API da OpenAI (conferidos em 2026-09-10 na doc oficial:
 *  developers.openai.com/api/docs/models/gpt-image-2.5-sunburst | …-flare). */
export const ORION_MODELS: Record<OrionVariant, string> = {
  sunburst: 'gpt-image-2.5-sunburst',
  flare:    'gpt-image-2.5-flare',
}

export const ORION_VARIANT_ORDER: OrionVariant[] = ['sunburst', 'flare']
export const ORION_QUALITY_ORDER: OrionQuality[] = ['high', 'medium']

/** Flare: mesma tarifa da Sunburst, ~9s mais rápida e sem diferença de
 *  fidelidade que se sustente estatisticamente (n=24, Δ cruza zero — ver
 *  docs/ORION-PILOTO-2026-09-10.md §3). Único valor usado — não há mais
 *  seletor de variante na UI. */
export const DEFAULT_ORION_VARIANT: OrionVariant = 'flare'
/** `high` é o único valor usado em produção — `medium` desaba no pior caso
 *  (amplitude 3× maior, ver mesma doc). `auto` NUNCA é usado — precisa saber
 *  o que foi pedido pra registrar custo e dimensão corretamente. */
export const DEFAULT_ORION_QUALITY: OrionQuality = 'high'

export const ORION_VARIANT_LABEL: Record<OrionVariant, string> = {
  sunburst: 'Sunburst',
  flare:    'Flare',
}

export const ORION_QUALITY_LABEL: Record<OrionQuality, string> = {
  high:   'Alta',
  medium: 'Média',
}

/** Preço em nodes por resolução — calculado contra o custo real medido (US$
 *  0,04–0,09/imagem em 2K, US$ 0,07–0,14 em 4K, pior caso = retrato) e o piso
 *  de receita por node (Studio, R$0,0997; legado Office anual, R$0,0729).
 *  Margem no pior caso medido: 66–90% nos dois pisos — larga folga acima dos
 *  50% mínimos usados no Animar. Mesmo valor por MP que Vega (2k=20, 4k=40),
 *  o que já é conservador porque o Orion é bem mais barato de gerar. */
export const ORION_NODES: Record<'2k' | '4k', number> = {
  '2k': 20,
  '4k': 40,
}

export const ORION_CONFIG = {
  id:          'orion' as const,
  name:        'Orion',
  /** Vazio de propósito: Orion é motor público como os outros, e
   *  "Experimental" virou selo sem função. O cartão do Renderizar e o do
   *  painel do plugin mostram só o nome; o que o motor faz está na
   *  `description`. O campo continua existindo porque a forma espelha
   *  EngineConfig — quem lê trata string vazia como "sem nota". */
  tagline:     '',
  description: 'Motor de alta fidelidade e resposta rápida do Renderizar.',
  resolutions: ['2k', '4k'] as Resolution[],
  nodes:       { '2k': ORION_NODES['2k'], '4k': ORION_NODES['4k'] } as Partial<Record<Resolution, number>>,
}

/** Espelha getNodesCost() de lib/engines — mesma forma, catálogo separado. */
export function getOrionNodesCost(resolution: '2k' | '4k'): number {
  return ORION_NODES[resolution]
}

// ── Dimensões explícitas dos presets 2K/4K ───────────────────────────────────
//
// A Image API da OpenAI aceita `size` = 'auto' | preset | 'LARGURAxALTURA' com
// os dois lados múltiplos de 16, aspecto entre 1:3 e 3:1 e no máximo 3840 px
// por lado (doc de 2026-09-10). O piloto NUNCA manda 'auto': a comparação
// precisa saber a dimensão pedida, e o histórico registra a ENTREGUE.
//
// Mapeamento do SpaceNode: lado maior 2048 (2K, mesmo nominal do '2K' de
// Vega/Pulsar) ou 3840 (4K — TETO por lado da Image API; a OpenAI não chega
// nos 4096 px do "4K" de Vega/Pulsar, então isso é 4K UHD, não o mesmo
// rótulo). Lado menor derivado do aspecto do original e arredondado PRA CIMA
// no múltiplo de 16 — arredondar pra cima só reduz o aspecto, então o teto de
// 3:1 nunca é estourado pelo arredondamento.

export const ORION_LONG_EDGE_2K = 2048
export const ORION_LONG_EDGE_4K = 3840
export const ORION_LONG_EDGE: Record<'2k' | '4k', number> = {
  '2k': ORION_LONG_EDGE_2K,
  '4k': ORION_LONG_EDGE_4K,
}
const OPENAI_MAX_EDGE = 3840
const OPENAI_MIN_EDGE = 512
const OPENAI_MAX_ASPECT = 3

export interface OrionSize {
  width:  number
  height: number
  /** 'aspect' = derivado do original; 'clamped' = aspecto extremo cortado no
   *  limite 1:3–3:1 do fornecedor; 'fallback' = original sem dimensões. */
  source: 'aspect' | 'clamped' | 'fallback'
}

const ceil16  = (n: number) => Math.max(16, Math.ceil(n / 16) * 16)
const floor16 = (n: number) => Math.max(16, Math.floor(n / 16) * 16)

/** Dimensões explícitas do preset (2K ou 4K) para um original de
 *  `width`×`height`. Preserva a proporção; sem dimensões, cai no quadrado do
 *  preset pedido (nunca 'auto'). Default '2k' — ninguém paga 4K sem pedir. */
export function orionTargetSize(
  width: number | null | undefined,
  height: number | null | undefined,
  preset: '2k' | '4k' = '2k',
): OrionSize {
  const longEdge = ORION_LONG_EDGE[preset]
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: longEdge, height: longEdge, source: 'fallback' }
  }
  const ratio = width / height
  const clamped = Math.min(OPENAI_MAX_ASPECT, Math.max(1 / OPENAI_MAX_ASPECT, ratio))
  const long = Math.min(longEdge, OPENAI_MAX_EDGE)

  let w: number
  let h: number
  if (clamped >= 1) {
    w = long
    h = ceil16(long / clamped)
  } else {
    h = long
    w = ceil16(long * clamped)
  }
  // Guardas defensivas: com lado maior 2048/3840 e aspecto ≤ 3:1 o lado menor
  // nunca dispara — ficam pra caso o preset mude.
  w = Math.min(OPENAI_MAX_EDGE, Math.max(OPENAI_MIN_EDGE, w))
  h = Math.min(OPENAI_MAX_EDGE, Math.max(OPENAI_MIN_EDGE, h))
  w = w > OPENAI_MAX_EDGE ? floor16(OPENAI_MAX_EDGE) : ceil16(w)
  h = h > OPENAI_MAX_EDGE ? floor16(OPENAI_MAX_EDGE) : ceil16(h)

  return { width: w, height: h, source: Math.abs(clamped - ratio) < 1e-9 ? 'aspect' : 'clamped' }
}

/** 'LARGURAxALTURA' — o formato que a Image API espera em `size`. */
export function orionSizeParam(size: OrionSize): string {
  return `${size.width}x${size.height}`
}

/** Faz o parse do `size` que o fornecedor devolve ('2048x1152'). Formato
 *  inesperado vira null — dado desconhecido nunca vira zero. */
export function parseOrionSizeParam(raw: unknown): { width: number; height: number } | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i)
  if (!m) return null
  const width = Number(m[1])
  const height = Number(m[2])
  return width > 0 && height > 0 ? { width, height } : null
}

// ── Type guards (listas fechadas — nada que venha do cliente escapa) ─────────

export function isRenderEngineId(value: unknown): value is RenderEngineId {
  return value === 'orion' || isEngineId(value)
}

export function isOrionVariant(value: unknown): value is OrionVariant {
  return value === 'sunburst' || value === 'flare'
}

export function isOrionQuality(value: unknown): value is OrionQuality {
  return value === 'medium' || value === 'high'
}

export function isOrionProvider(value: unknown): value is OrionProvider {
  return value === 'openai' || value === 'fal'
}

/** Resolução liberada no piloto. O servidor recusa qualquer outra. */
export function isOrionResolution(value: unknown): value is '2k' | '4k' {
  return value === '2k' || value === '4k'
}

export function getRenderEngineConfig(engine: RenderEngineId) {
  return engine === 'orion' ? ORION_CONFIG : ENGINES[engine]
}

// ── "Este RESULTADO é do piloto?" ────────────────────────────────────────────
//
// Regra única, usada pelo servidor (/api/spaces/from-render) e pela UI
// (Histórico, CTA do Renderizar). Olha o MOTOR DO RESULTADO persistido, nunca
// o card que estava selecionado na hora — quem promove pode ser outra tela,
// outro dia, ou uma chamada forjada direto na API.
//
// `is_internal_test` é a fonte forte (coluna com CHECK), mas nem todo call site
// a seleciona e o banco pode estar sem a migration; por isso a função também
// aceita o motor e o marcador dentro do config_snapshot. Qualquer um dos três
// bastando = interno (fail-closed).

export function isInternalRenderRow(row: {
  engine?: unknown
  is_internal_test?: unknown
  config_snapshot?: unknown
} | null | undefined): boolean {
  if (!row) return false
  if (row.is_internal_test === true) return true
  if (typeof row.engine === 'string' && row.engine.trim().toLowerCase() === 'orion') return true
  const snap = row.config_snapshot as { internal_test?: unknown } | null | undefined
  return !!snap && typeof snap === 'object' && snap.internal_test === true
}
