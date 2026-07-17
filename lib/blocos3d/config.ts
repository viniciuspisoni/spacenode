// lib/blocos3d/config.ts
//
// Catálogo central do Blocos 3D. Fonte única de verdade — UI, route e billing
// leem daqui (mesmo papel do lib/video/models.ts pro Animar).
//
// IMPORTANTE: importado no server e no client. Nada de env sem NEXT_PUBLIC_
// aqui — a presença das keys (FAL_KEY / MESHY_API_KEY) é validada nos
// providers (server-only); a página passa a disponibilidade real pra UI.
//
// Estratégia de motores (pesquisa de preços 2026-07-17):
//   O dia a dia roda nos motores da fal (já integrada; US$ 0,02–0,05/geração,
//   8–12× mais barato que Meshy). O Meshy entra como tier premium — onde ele é
//   realmente superior: exporta GLB+FBX+OBJ+USDZ de uma vez, malha quad e
//   prompt de materiais (PBR 2K).
//
// Política de preço (mesma régua do Animar, revisão 2026-06-01): costInNodes
// calibrado pra margem ≥ 50% no PIOR caso de receita por node — Office anual
// (R$ 0,0729/node), câmbio de trabalho R$ 5,40/US$. Regra prática:
// nodes_mínimos ≈ custo_US$ × 148; cobramos acima disso.
//
// Custo real por geração (verificado 2026-07-17; conferir no dashboard antes
// de mudar):
//   fal-ai/trellis                 US$ 0,02          → piso  3 nodes
//   fal-ai/hunyuan3d-v21 (PBR)     US$ 0,05          → piso  8 nodes
//   Meshy image-to-3d texturizado  US$ 0,40–0,60     → piso 89 nodes
//     (Meshy: créditos ~US$ 0,02, task 20–30 créditos; exige plano Pro ativo)

import type { Blocos3DOptions, Blocos3DProvider, Blocos3DQuality } from './types'

export interface Blocos3DEngine {
  id:          Blocos3DQuality
  label:       string
  description: string
  provider:    Blocos3DProvider
  /** Endpoint fal ('fal-ai/…') ou modelo Meshy ('meshy/image-to-3d'). */
  engine:      string
  /** Formatos que o motor entrega (a UI mostra como feature). */
  formats:     string[]
  features:    string[]
  supportsTexturePrompt: boolean
  costInNodes: number
  /** Estimativa pra UI de progresso (fal não reporta % — sintetizamos). */
  estimatedMs: number
  badge?:      { label: string; tone: 'green' | 'blue' | 'muted' }
}

export const BLOCOS3D_ENGINES: Record<Blocos3DQuality, Blocos3DEngine> = {
  draft: {
    id:          'draft',
    label:       'Rascunho',
    description: 'Bloco rápido pra estudar volumetria e escala na cena.',
    provider:    'fal',
    engine:      'fal-ai/trellis',
    formats:     ['GLB'],
    features:    ['Textura simples', '~1 min'],
    supportsTexturePrompt: false,
    costInNodes: 12,           // US$ 0,02 · ~88% margem no piso
    estimatedMs: 60_000,
  },
  standard: {
    id:          'standard',
    label:       'Padrão',
    description: 'Modelo texturizado com materiais PBR — pronto pra compor cenas.',
    provider:    'fal',
    engine:      'fal-ai/hunyuan3d-v21',
    formats:     ['GLB'],
    features:    ['Materiais PBR', '~2 min'],
    supportsTexturePrompt: false,
    costInNodes: 25,           // US$ 0,05 · ~85% margem no piso
    estimatedMs: 120_000,
    badge:       { label: 'RECOMENDADO', tone: 'green' },
  },
  high: {
    id:          'high',
    label:       'Alta',
    description: 'Máxima qualidade com todos os formatos de arquivo e malha quad editável.',
    provider:    'meshy',
    engine:      'meshy/image-to-3d',
    formats:     ['GLB', 'FBX', 'OBJ', 'USDZ'],
    features:    ['PBR 2K', 'Malha quad', 'Prompt de materiais', '~4 min'],
    supportsTexturePrompt: true,
    costInNodes: 120,          // US$ 0,40–0,60 · margem 63–75% no piso
    estimatedMs: 240_000,
    badge:       { label: 'TODOS OS FORMATOS', tone: 'blue' },
  },
}

export const BLOCOS3D_QUALITY_ORDER: Blocos3DQuality[] = ['draft', 'standard', 'high']

export const DEFAULT_BLOCOS3D_QUALITY: Blocos3DQuality = 'standard'

// ── Validação de entrada (route) ─────────────────────────────────────────────

export function isBlocos3DQuality(v: unknown): v is Blocos3DQuality {
  return v === 'draft' || v === 'standard' || v === 'high'
}

export const TEXTURE_PROMPT_MAX_LEN = 600

export function getBlocos3DEngine(quality: Blocos3DQuality): Blocos3DEngine {
  return BLOCOS3D_ENGINES[quality]
}

export function getBlocos3DCost(quality: Blocos3DQuality): number {
  return BLOCOS3D_ENGINES[quality].costInNodes
}

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
