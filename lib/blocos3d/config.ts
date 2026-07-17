// lib/blocos3d/config.ts
//
// Catálogo central do Blocos 3D. Fonte única de verdade — UI, route e billing
// leem daqui (mesmo papel do lib/video/models.ts pro Animar).
//
// IMPORTANTE: importado no server e no client. Nada de env sem NEXT_PUBLIC_
// aqui — a presença da FAL_KEY é validada nos providers (server-only); a
// página passa a disponibilidade real pra UI.
//
// Catálogo 2026-07-17 (decisão do fundador após 2 testes reais com sofá):
// três motores de alta qualidade, TODOS via fal (uma key, um vendor), todos
// com multiview (até 4 ângulos — front obrigatório):
//   Padrão  = Tripo v2.5 HD          (fiel à foto; multiview posicional)
//   Alta    = Rodin quality-high     (máximo detalhe; multiview fuse)
//   Premium = Meshy v5 multi-image   (todos os formatos + quad; multiview
//             nativo) — o Meshy SEM a assinatura de US$ 20/mês: via fal é
//             pay-per-use na conta que já temos.
//
// Política de preço (mesma régua do Animar, revisão 2026-06-01): costInNodes
// calibrado pra margem ≥ 50% no PIOR caso de receita por node — Office anual
// (R$ 0,0729/node), câmbio de trabalho R$ 5,40/US$. Regra prática:
// nodes_mínimos ≈ custo_US$ × 148; cobramos acima disso.
//
// Custo real por geração (fal; conferir no dashboard antes de mudar):
//   tripo3d/tripo/v2.5 (HD + PBR)      US$ 0,40       → piso 59 nodes
//   fal-ai/hyper3d/rodin (high+hyper)  US$ 0,40–0,80  → piso 118 nodes
//   fal-ai/meshy/v5/multi-image-to-3d  US$ 0,40       → piso 59 nodes
//     (confirmado na fatura fal em 2026-07-17 — recalibrado de 130 pra 95
//      nodes; o prêmio sobre o Padrão paga os formatos extras + quad.)
//
// Histórico de motores (jobs antigos resolvem pelo engine persistido na linha):
//   draft/Rascunho: fal-ai/trellis (US$ 0,02) — removido do catálogo na
//   consolidação em 3 tiers de alta qualidade.
//   Padrão: fal-ai/hunyuan3d-v21 (US$ 0,15) — geometria boa, textura chapada
//   em tecido (teste real). Substituído pelo Tripo v2.5 HD.
//   Alta: era Meshy API direta (exigia plano Pro) — o Meshy voltou como tier
//   Premium via fal; o adapter direto segue em lib/blocos3d/meshy.ts.

import type { Blocos3DOptions, Blocos3DProvider, Blocos3DQuality, PositionedImages, ViewPosition } from './types'

export interface Blocos3DEngine {
  id:          Blocos3DQuality
  label:       string
  description: string
  provider:    Blocos3DProvider
  /** Endpoint fal ('fal-ai/…'). O provider pode trocar pra variante multiview
   *  conforme o nº de imagens (ver resolveFalEngineId em fal.ts). */
  engine:      string
  /** Formatos que o motor entrega (a UI mostra como feature). */
  formats:     string[]
  features:    string[]
  supportsTexturePrompt: boolean
  /** Máximo de ângulos aceitos (todos os motores atuais: 4). */
  maxImages:   number
  costInNodes: number
  /** Estimativa pra UI de progresso (fal não reporta % — sintetizamos). */
  estimatedMs: number
  badge?:      { label: string; tone: 'green' | 'blue' | 'muted' }
}

export const BLOCOS3D_ENGINES: Record<Blocos3DQuality, Blocos3DEngine> = {
  standard: {
    id:          'standard',
    label:       'Padrão',
    description: 'Textura HD fiel à imagem, com materiais PBR — pronto pra compor cenas.',
    provider:    'fal',
    engine:      'tripo3d/tripo/v2.5/image-to-3d',
    formats:     ['GLB'],
    features:    ['Textura HD', 'Materiais PBR', 'Até 4 ângulos', '~2 min'],
    supportsTexturePrompt: false,
    maxImages:   4,
    costInNodes: 70,           // US$ 0,40 (texture HD) · ~58% margem no piso
    estimatedMs: 150_000,
    badge:       { label: 'RECOMENDADO', tone: 'green' },
  },
  high: {
    id:          'high',
    label:       'Alta',
    description: 'Detalhe máximo de geometria e textura — o motor mais forte para peças-herói.',
    provider:    'fal',
    engine:      'fal-ai/hyper3d/rodin',
    formats:     ['GLB'],
    features:    ['Detalhe máximo', 'Materiais PBR', 'Prompt de materiais', 'Até 4 ângulos', '~3 min'],
    supportsTexturePrompt: true,
    maxImages:   4,
    costInNodes: 120,          // US$ 0,40–0,80 (quality high) · margem 51–75% no piso
    estimatedMs: 180_000,
    badge:       { label: 'MÁXIMO DETALHE', tone: 'blue' },
  },
  premium: {
    id:          'premium',
    label:       'Premium',
    description: 'Todos os formatos de arquivo e malha quad editável — pronto pra levar ao SketchUp/Blender.',
    provider:    'fal',
    engine:      'fal-ai/meshy/v5/multi-image-to-3d',
    formats:     ['GLB', 'FBX', 'OBJ', 'USDZ'],
    features:    ['Malha quad', 'Materiais PBR', 'Prompt de materiais', 'Até 4 ângulos', '~4 min'],
    supportsTexturePrompt: true,
    maxImages:   4,
    costInNodes: 95,           // US$ 0,40 (fatura fal) · ~69% margem no piso
    estimatedMs: 240_000,
    badge:       { label: 'TODOS OS FORMATOS', tone: 'blue' },
  },
}

export const BLOCOS3D_QUALITY_ORDER: Blocos3DQuality[] = ['standard', 'high', 'premium']

export const DEFAULT_BLOCOS3D_QUALITY: Blocos3DQuality = 'standard'

// ── Multiview ────────────────────────────────────────────────────────────────

export const VIEW_POSITION_ORDER: ViewPosition[] = ['front', 'left', 'back', 'right']

export const VIEW_POSITION_LABEL: Record<ViewPosition, string> = {
  front: 'Frente',
  left:  'Lado esquerdo',
  back:  'Trás',
  right: 'Lado direito',
}

export function countImages(images: PositionedImages<unknown>): number {
  return VIEW_POSITION_ORDER.filter(p => images[p] != null).length
}

/** Lista ordenada (front primeiro) das imagens presentes. */
export function listImages<T>(images: PositionedImages<T>): T[] {
  return VIEW_POSITION_ORDER.map(p => images[p]).filter((v): v is T => v != null)
}

// ── Validação de entrada (route) ─────────────────────────────────────────────

export function isBlocos3DQuality(v: unknown): v is Blocos3DQuality {
  return v === 'standard' || v === 'high' || v === 'premium'
}

export const TEXTURE_PROMPT_MAX_LEN = 600

export function getBlocos3DEngine(quality: Blocos3DQuality): Blocos3DEngine {
  return BLOCOS3D_ENGINES[quality]
}

/** Limite da imagem de origem — fonte única pro client (checagem + label) e
 *  pra área blocos3d-source do upload direto (lib/storage/direct-upload.ts). */
export const BLOCOS3D_SOURCE_MAX_BYTES = 15 * 1024 * 1024
export const BLOCOS3D_SOURCE_MAX_MB = 15

/** Normaliza o body da request pra um Blocos3DOptions válido (null = inválido). */
export function normalizeBlocos3DOptions(body: Record<string, unknown> | null): Blocos3DOptions | null {
  const quality = body?.quality ?? DEFAULT_BLOCOS3D_QUALITY
  if (!isBlocos3DQuality(quality)) return null
  const engine = BLOCOS3D_ENGINES[quality]
  const rawPrompt = typeof body?.texturePrompt === 'string' ? body.texturePrompt.trim() : ''
  return {
    quality,
    texturePrompt: engine.supportsTexturePrompt && rawPrompt
      ? rawPrompt.slice(0, TEXTURE_PROMPT_MAX_LEN)
      : undefined,
  }
}

/** Normaliza o body pra um PositionedImages de KEYS de upload direto
 *  (null = inválido). Aceita o legado `sourceKey` string como front. */
export function normalizeSourceKeys(body: Record<string, unknown> | null): PositionedImages<string> | null {
  const raw = body?.sourceKeys
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>
    const front = typeof rec.front === 'string' && rec.front ? rec.front : null
    if (!front) return null
    const out: PositionedImages<string> = { front }
    for (const pos of ['left', 'back', 'right'] as const) {
      if (typeof rec[pos] === 'string' && rec[pos]) out[pos] = rec[pos] as string
    }
    return out
  }
  if (typeof body?.sourceKey === 'string' && body.sourceKey) {
    return { front: body.sourceKey }
  }
  return null
}
