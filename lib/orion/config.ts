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
// Piloto: 2K, uma imagem por solicitação, ZERO nodes — a decisão de não cobrar
// acontece no SERVIDOR, depois da autorização (ver app/api/generate/route.ts).

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

export const DEFAULT_ORION_VARIANT: OrionVariant = 'sunburst'
/** `high` é o padrão do piloto; `medium` é a alternativa de comparação.
 *  `auto` NUNCA é usado — o teste precisa saber o que pediu. */
export const DEFAULT_ORION_QUALITY: OrionQuality = 'high'

export const ORION_VARIANT_LABEL: Record<OrionVariant, string> = {
  sunburst: 'Sunburst',
  flare:    'Flare',
}

export const ORION_QUALITY_LABEL: Record<OrionQuality, string> = {
  high:   'Alta',
  medium: 'Média',
}

/** Custo do piloto: zero nodes, sempre. Motores públicos preservam a tabela
 *  comercial de lib/engines — nada aqui os toca. */
export const ORION_NODES_COST = 0

export const ORION_CONFIG = {
  id:          'orion' as const,
  name:        'Orion',
  tagline:     'Experimental',
  description: 'Teste interno de geração e preservação do projeto. Não cobra nodes.',
  resolutions: ['2k'] as Resolution[],
  nodes:       { '2k': ORION_NODES_COST } as Partial<Record<Resolution, number>>,
}

// ── Dimensões explícitas do preset 2K ────────────────────────────────────────
//
// A Image API da OpenAI aceita `size` = 'auto' | preset | 'LARGURAxALTURA' com
// os dois lados múltiplos de 16, aspecto entre 1:3 e 3:1 e no máximo 3840 px
// por lado (doc de 2026-09-10). O piloto NUNCA manda 'auto': a comparação
// precisa saber a dimensão pedida, e o histórico registra a ENTREGUE.
//
// Mapeamento do "2K" do SpaceNode: lado maior 2048 px (mesmo nominal do '2K'
// de Vega/Pulsar), lado menor derivado do aspecto do original e arredondado
// PRA CIMA no múltiplo de 16 — arredondar pra cima só reduz o aspecto, então
// o teto de 3:1 nunca é estourado pelo arredondamento.

export const ORION_LONG_EDGE_2K = 2048
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

/** Dimensões explícitas do preset 2K para um original de `width`×`height`.
 *  Preserva a proporção; sem dimensões, cai no quadrado 2K (nunca 'auto'). */
export function orionTargetSize(
  width: number | null | undefined,
  height: number | null | undefined,
): OrionSize {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: ORION_LONG_EDGE_2K, height: ORION_LONG_EDGE_2K, source: 'fallback' }
  }
  const ratio = width / height
  const clamped = Math.min(OPENAI_MAX_ASPECT, Math.max(1 / OPENAI_MAX_ASPECT, ratio))
  const long = Math.min(ORION_LONG_EDGE_2K, OPENAI_MAX_EDGE)

  let w: number
  let h: number
  if (clamped >= 1) {
    w = long
    h = ceil16(long / clamped)
  } else {
    h = long
    w = ceil16(long * clamped)
  }
  // Guardas defensivas: com lado maior 2048 e aspecto ≤ 3:1 o lado menor cai
  // em [688, 2048] e nenhuma delas dispara — ficam pra caso o preset mude.
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
export function isOrionResolution(value: unknown): value is Resolution {
  return value === '2k'
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
