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

const RESOLUTION_LABELS: Record<Resolution, { label: string; note: string }> = {
  hd: { label: 'HD', note: 'Rápido para testes' },
  '2k': { label: '2K', note: 'Ideal para apresentação' },
  '4k': { label: '4K', note: 'Máxima definição' },
}

const FIDELITY_LEVELS = [
  { id: 'maximum', label: 'Máxima', note: 'Preserva tudo do projeto' },
  { id: 'balanced', label: 'Equilibrado', note: 'Pequenas melhorias permitidas' },
  { id: 'creative', label: 'Criativo', note: 'Mais liberdade estética' },
] as const

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
  }
}

export async function GET(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  return NextResponse.json({
    version: 1,
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
    defaults: {
      engine: DEFAULT_ENGINE,
      resolution: DEFAULT_RESOLUTION,
      fidelityLevel: 'maximum',
    },
    fidelityLevels: FIDELITY_LEVELS,
    projectTypes: [
      { id: 'interior', label: 'Interior', ...taxonomyFor('interior') },
      { id: 'exterior', label: 'Exterior', ...taxonomyFor('exterior') },
    ],
  })
}
