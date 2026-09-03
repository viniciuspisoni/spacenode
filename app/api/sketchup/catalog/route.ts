// GET /api/sketchup/catalog
//
// Fonte única remota do que o painel do plugin SketchUp oferece: motores com
// custo em Nodes por resolução, taxonomia completa de presets (segmento →
// espaço/iluminação/elementos, entorno/contexto) e níveis de fidelidade.
// Sem isso o plugin teria que hardcodar a tabela de preço em Ruby — drift
// garantido na primeira mudança de catálogo.
//
// Nunca expõe falEndpoint/provider (regra de produto: zero jargão técnico).

import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import { listAvailableVideoModels } from '@/lib/video/models'
import { VIDEO_TYPE_PRESETS, DEFAULT_VIDEO_TYPE, resolvePresetDefaults, type VideoTypeId } from '@/lib/video/videoPresets'
import { SCENE_TYPES, SCENE_TYPE_ORDER } from '@/lib/video/scenes'
import { DIRECT_UPLOAD_AREAS } from '@/lib/storage/direct-upload'
import {
  ENGINES,
  ENGINE_ORDER,
  DEFAULT_ENGINE,
  DEFAULT_RESOLUTION,
  type Resolution,
} from '@/lib/engines'
import {
  getSegments,
  getEnvironments,
  getLighting,
  getBackgrounds,
  getSceneElements,
  type ProjectType,
} from '@/lib/prompts'
import { DNA_EXTRACTION_COST, getVistaGenerationCost, getAvailableQualities } from '@/lib/spaces/economy'
import { getUpscaleCostNodes, scaleToFactor, MAX_OUTPUT_MP, type ModeId, type Scale } from '@/lib/upscale'
import { PRESET_LABELS_EN } from '@/lib/sketchup/preset-labels-en'

// i18n EN do painel do plugin: presets (mapa gerado, valor enviado à API
// segue pt-BR) + rótulos estruturais do catálogo. O chrome do painel
// (botões/estados) é traduzido no próprio dialog.
const CATALOG_I18N_EN = {
  presets: PRESET_LABELS_EN,
  ui: {
    projectTypes: { interior: 'Interior', exterior: 'Exterior' } as Record<string, string>,
    backgroundLabels: { interior: 'Visual context', exterior: 'Surroundings' } as Record<string, string>,
    engineTaglines: { vega: 'Premium', pulsar: 'Fast', quasar: 'Special' } as Record<string, string>,
    resolutionNotes: {
      hd: 'Quick tests',
      '2k': 'Ideal for presentations',
      '4k': 'Maximum definition',
    } as Record<string, string>,
    materialFields: {
      piso: 'Floor',
      paredes: 'Walls / finishes',
      teto: 'Ceiling',
      marcenaria: 'Millwork',
      bancadas: 'Countertops',
      esquadrias: 'Window & door frames',
      elementos: 'Special elements',
      fachada: 'Facade cladding',
    } as Record<string, string>,
    categories: {
      residencial: 'Residential',
      comercial: 'Commercial',
      conceito: 'Concept',
    } as Record<string, string>,
    upscaleModes: { fidelity: 'Fidelity' } as Record<string, string>,
    animar: {
      videoTypes: {
        cinematic: { label: 'Presentation', tagline: 'Subtle, elegant motion that brings the render to life.' },
        detail:    { label: 'Detail',       tagline: 'Highlights materials, light, textures and furniture.' },
        tour:      { label: 'Tour',         tagline: 'A smooth walk through the space, like a guided visit.' },
        reels:     { label: 'Reels',        tagline: 'Vertical and dynamic, ready for Instagram and TikTok.' },
      } as Record<string, { label: string; tagline: string }>,
      engines: {
        'fal-ai/veo3.1/image-to-video': 'Cinematic',
        'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'Fast',
      } as Record<string, string>,
    },
  },
}

const RESOLUTION_LABELS: Record<Resolution, { label: string; note: string }> = {
  hd: { label: 'HD', note: 'Rápido para testes' },
  '2k': { label: '2K', note: 'Ideal para apresentação' },
  '4k': { label: '4K', note: 'Máxima definição' },
}

// Superfícies válidas pra materialRefs (mesmo vocabulário do /api/generate),
// com rótulo de UI — o plugin usa pra mapear materiais do modelo → superfície.
const MATERIAL_FIELDS: Record<ProjectType, { id: string; label: string }[]> = {
  interior: [
    { id: 'piso', label: 'Piso' },
    { id: 'paredes', label: 'Paredes / Revestimentos' },
    { id: 'teto', label: 'Teto' },
    { id: 'marcenaria', label: 'Marcenaria' },
    { id: 'bancadas', label: 'Bancadas' },
    { id: 'esquadrias', label: 'Portas e caixilhos' },
    { id: 'elementos', label: 'Elementos especiais' },
  ],
  exterior: [
    { id: 'fachada', label: 'Revestimento de fachada' },
    { id: 'piso', label: 'Piso externo / calçada' },
    { id: 'esquadrias', label: 'Esquadrias / caixilhos' },
    { id: 'elementos', label: 'Elementos especiais' },
  ],
}

function taxonomyFor(projectType: ProjectType) {
  return {
    segments: getSegments(projectType).map(segment => ({
      name: segment,
      environments: getEnvironments(projectType, segment),
      lighting: getLighting(projectType, segment),
      sceneElements: getSceneElements(projectType, segment),
    })),
    backgrounds: getBackgrounds(projectType),
    backgroundLabel: projectType === 'exterior' ? 'Entorno' : 'Contexto visual',
    materialFields: MATERIAL_FIELDS[projectType],
  }
}

// ── Animar (v6) ──────────────────────────────────────────────────────────────
// Tipos oferecidos no painel (rótulo curto pro painel de 440 px; tagline vem
// do preset). 'commercial' fica de fora: com aspecto 'auto' (regra do plugin:
// nunca reenquadrar a captura) ele é idêntico ao 'cinematic'.
// only: 'portrait' = só aparece com render vertical; 'interior' = só com
// projectType interior. Nunca expõe promptFragment/provider/tag técnica —
// o `id` do motor é valor opaco exigido pelo /api/video.
const PLUGIN_VIDEO_TYPES: { id: VideoTypeId; label: string; only: 'portrait' | 'interior' | null }[] = [
  { id: 'cinematic', label: 'Apresentação', only: null },
  { id: 'detail',    label: 'Detalhe',      only: null },
  { id: 'tour',      label: 'Tour',         only: 'interior' },
  { id: 'reels',     label: 'Reels',        only: 'portrait' },
]

function buildAnimarCatalog() {
  return {
    // Placeholders Flow/Omni (provider 'google'/'omni') nunca entram: os adapters lançam erro.
    engines: listAvailableVideoModels().filter(m => m.provider === 'fal').map(m => ({
      id: m.id,
      label: m.label,
      description: m.description,
      recommended: !!m.badge,
      estimatedSeconds: Math.round(m.estimatedGenerationMs / 1000),
      durations: m.supportedDurations.map(d => ({ id: d, nodes: m.costInNodes[d] })),
      aspectRatios: m.supportedAspectRatios,
    })),
    videoTypes: PLUGIN_VIDEO_TYPES.map(t => {
      const p = VIDEO_TYPE_PRESETS[t.id]
      const d = resolvePresetDefaults(p)
      return {
        id: t.id, label: t.label, tagline: p.tagline, only: t.only,
        defaults: {
          engine: d.modelId,
          duration: d.duration,
          motion: d.motionId,            // 'auto' ou CameraMotionId — 'auto' = plugin OMITE cameraMotion
          intensity: d.intensity,
          // Regra do plugin: nunca reenquadrar a captura. Só o Reels (que só
          // aparece em retrato) pede 9:16.
          aspectRatio: t.id === 'reels' ? d.aspectRatio : 'auto',
        },
      }
    }),
    scenes: SCENE_TYPE_ORDER.map(id => ({ id, archetype: SCENE_TYPES[id].archetype, aliases: SCENE_TYPES[id].aliases })),
    defaults: { videoType: DEFAULT_VIDEO_TYPE },
    limits: { maxSourceBytes: DIRECT_UPLOAD_AREAS['animar-source'].maxBytes, aspectMin: 0.4, aspectMax: 2.5 },
    // Vira true só quando o falAdapter honrar endImageUrl (PR seguinte).
    endFrame: false,
  }
}

export async function GET(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Ampliar: grade derivada DA PRÓPRIA função de custo (zero drift). O
  // surcharge por megapixel é do INPUT: derivado por sondas na mesma função.
  const upscaleModes: { id: ModeId; label: string; scales: Scale[] }[] = [
    { id: 'fidelity', label: 'Fidelidade', scales: ['2x', '4x'] },
  ]
  const surchargeProbe = (mp: number) =>
    getUpscaleCostNodes({ tab: 'resolution', modeId: 'fidelity', scale: '2x', megapixels: mp }) -
    getUpscaleCostNodes({ tab: 'resolution', modeId: 'fidelity', scale: '2x', megapixels: 0 })
  const upscale = {
    modes: upscaleModes.map(m => ({
      id: m.id,
      label: m.label,
      scales: m.scales.map(s => ({
        id: s,
        baseNodes: getUpscaleCostNodes({ tab: 'resolution', modeId: m.id, scale: s, megapixels: 0 }),
      })),
    })),
    mpSurchargeTiers: [
      { maxMP: 4, add: surchargeProbe(4) },
      { maxMP: 8, add: surchargeProbe(8) },
      { maxMP: 16, add: surchargeProbe(16) },
      { maxMP: null, add: surchargeProbe(17) },
    ],
    maxOutputMP: MAX_OUTPUT_MP,
    scaleFactor: { '2x': scaleToFactor('2x'), '4x': scaleToFactor('4x') },
  }

  const spaces = {
    dnaCost: DNA_EXTRACTION_COST,
    maxPrints: 10,
    chunkSize: 4,
    categories: [
      { id: 'residencial', label: 'Residencial' },
      { id: 'comercial', label: 'Comercial' },
      { id: 'conceito', label: 'Conceito' },
    ],
    vistaCosts: ENGINE_ORDER.map(id => ({
      engine: id,
      qualities: getAvailableQualities(id).map(q => ({ id: q, nodes: getVistaGenerationCost(id, q) })),
    })),
  }

  return NextResponse.json({
    version: 6,
    i18n: { en: CATALOG_I18N_EN },
    upscale,
    spaces,
    animar: buildAnimarCatalog(),
    engines: ENGINE_ORDER.map(id => {
      const e = ENGINES[id]
      return {
        id,
        name: e.name,
        tagline: e.tagline,
        resolutions: e.resolutions.map(r => ({
          id: r,
          label: RESOLUTION_LABELS[r].label,
          note: RESOLUTION_LABELS[r].note,
          nodes: e.nodes[r] ?? 0,
        })),
      }
    }),
    // Sem `fidelityLevels`/`defaults.fidelityLevel` desde a v5: o seletor
    // foi descontinuado (fidelidade é sempre máxima). O plugin v0.5.2 em
    // campo lê `fidelityLevels || []` e renderiza a seção vazia — inofensivo.
    defaults: {
      engine: DEFAULT_ENGINE,
      resolution: DEFAULT_RESOLUTION,
    },
    projectTypes: [
      { id: 'interior', label: 'Interior', ...taxonomyFor('interior') },
      { id: 'exterior', label: 'Exterior', ...taxonomyFor('exterior') },
    ],
  })
}
