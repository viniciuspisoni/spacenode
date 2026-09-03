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
    version: 5,
    i18n: { en: CATALOG_I18N_EN },
    upscale,
    spaces,
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
