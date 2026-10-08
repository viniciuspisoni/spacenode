import type { SupabaseClient } from '@supabase/supabase-js'
import { isEngineId, isResolution, isValidCombination, type EngineId, type Resolution } from '@/lib/engines'
import { publicRenderAudit } from './audit-status'
import { resolveFixtureLights, type FixtureLights } from '@/lib/ai/fixture-lights'
import { assertSafeFetchUrl } from '@/lib/storage/fetch'
import type { ProjectMaterials, ProjectType } from '@/lib/prompts'

export interface SavedRenderReview {
  id: string
  inputUrl: string
  outputUrl: string
  seed: number | null
  score: number | null
  warning: boolean
  materials: ProjectMaterials
  config: {
    projectType: ProjectType; segment?: string; environment?: string; lighting?: string; background?: string
    fixtureLights: FixtureLights; sceneElements: string[]; selectedEngine: EngineId; selectedResolution: Resolution
  }
}

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export function normalizeSavedRenderReview(raw: unknown, userId: string): SavedRenderReview | null {
  const row = record(raw)
  if (!uuid(row.id) || row.user_id !== userId || row.status !== 'completed' ||
      !isEngineId(row.engine) || !isResolution(row.resolution) || !isValidCombination(row.engine, row.resolution) ||
      typeof row.input_url !== 'string' || typeof row.output_url !== 'string') return null
  try { assertSafeFetchUrl(row.input_url); assertSafeFetchUrl(row.output_url) } catch { return null }
  const config = record(row.config_snapshot)
  if (config.projectType !== 'interior' && config.projectType !== 'exterior') return null
  // Sample references need their own restoration flow; never silently drop a
  // requested photographic material sample when preparing a paid request.
  if (config.material_refs != null && (!Array.isArray(config.material_refs) || config.material_refs.length)) return null
  const materials: ProjectMaterials = {}
  const savedMaterials = record(config.materials)
  for (const field of ['fachada', 'piso', 'esquadrias', 'paredes', 'teto', 'marcenaria', 'bancadas', 'elementos', 'outros'] as const) {
    if (typeof savedMaterials[field] === 'string') materials[field] = savedMaterials[field]
  }
  const sceneElements = Array.isArray(config.sceneElements) ? config.sceneElements.filter((v): v is string => typeof v === 'string') : []
  const log = record(row.generation_log)
  const fidelity = record(log.fidelity)
  const score = typeof fidelity.final_score === 'number' && Number.isFinite(fidelity.final_score) && fidelity.final_score >= 0 && fidelity.final_score <= 1 ? fidelity.final_score : null
  const min = typeof fidelity.min_score === 'number' && Number.isFinite(fidelity.min_score) ? fidelity.min_score : null
  const text = (v: unknown) => typeof v === 'string' ? v : undefined
  return {
    id: row.id, inputUrl: row.input_url, outputUrl: row.output_url,
    seed: typeof log.seed === 'number' && Number.isInteger(log.seed) && log.seed >= 0 && log.seed <= 2_147_483_647 ? log.seed : null,
    score, warning: publicRenderAudit(log).warning || (score !== null && min !== null && score < min), materials,
    config: { projectType: config.projectType, segment: text(config.segment), environment: text(config.environment),
      lighting: text(config.lighting), background: text(config.background), sceneElements,
      fixtureLights: resolveFixtureLights(config.fixtureLights, sceneElements), selectedEngine: row.engine, selectedResolution: row.resolution },
  }
}

export async function loadOwnSavedRenderReview(client: Pick<SupabaseClient, 'from'>, userId: string, renderId: unknown): Promise<SavedRenderReview | null> {
  if (!uuid(renderId) || !uuid(userId)) return null
  try {
    const { data, error } = await client.from('renders')
      .select('id,user_id,status,input_url,output_url,engine,resolution,config_snapshot,generation_log')
      .eq('id', renderId).eq('user_id', userId).eq('status', 'completed').maybeSingle()
    return error ? null : normalizeSavedRenderReview(data, userId)
  } catch { return null }
}
