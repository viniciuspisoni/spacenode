// ── Memória de projeto do Nodi V2 (server-only) ──────────────────────────────
//
// Leitura/escrita da nodi_project_memory SEMPRE com o client do usuário
// (RLS fecha o isolamento). Escrita só acontece na rota de confirmação —
// a tool do modelo apenas PROPÕE o patch. Tolerante à migration ausente
// (42P01 → memória indisponível: leitura null, escrita erro amigável).

import type { SupabaseClient } from '@supabase/supabase-js'
import { clampText, sanitizeUserText } from '../redact'
import type { ProjectMemory, ProjectPlan, ProjectPlanStep } from './types'

const MAX_DECISIONS = 12

interface MemoryRow {
  style: string | null
  materials: string | null
  lighting: string | null
  main_image: string | null
  locked_elements: string | null
  decisions: unknown
  plan?: unknown
}

const MODULE_IDS = ['renderizar', 'spaces', 'editar', 'ampliar', 'animar', 'finalizar', 'planta_humanizada']

/** Valida o Plano do Projeto vindo do modelo/painel — nada passa cru. */
export function sanitizePlan(raw: unknown): ProjectPlan | undefined {
  const p = (raw && typeof raw === 'object' ? raw : null) as { objective?: unknown; steps?: unknown } | null
  if (!p || typeof p.objective !== 'string' || !p.objective.trim()) return undefined
  const steps: ProjectPlanStep[] = (Array.isArray(p.steps) ? p.steps : [])
    .slice(0, 10)
    .map((s, i) => {
      const o = s as Record<string, unknown>
      const moduleId = MODULE_IDS.includes(o.moduleId as string) ? (o.moduleId as string) : 'renderizar'
      return {
        order: i + 1,
        moduleId,
        moduleLabel: typeof o.moduleLabel === 'string' && o.moduleLabel ? clampText(o.moduleLabel, 40) : moduleId,
        goal: clampText(String(o.goal ?? ''), 200),
        status: o.status === 'feita' ? 'feita' as const : 'pendente' as const,
        estimatedNodes: typeof o.estimatedNodes === 'number' && Number.isFinite(o.estimatedNodes)
          ? Math.max(0, Math.round(o.estimatedNodes)) : undefined,
      }
    })
    .filter(s => s.goal)
  if (!steps.length) return undefined
  return { objective: clampText(p.objective, 300), steps, updatedAt: new Date().toISOString() }
}

function rowToMemory(row: MemoryRow): ProjectMemory {
  const decisions = Array.isArray(row.decisions)
    ? row.decisions.filter((d): d is string => typeof d === 'string').slice(0, MAX_DECISIONS)
    : []
  return {
    style: row.style ?? undefined,
    materials: row.materials ?? undefined,
    lighting: row.lighting ?? undefined,
    mainImage: row.main_image ?? undefined,
    lockedElements: row.locked_elements ?? undefined,
    decisions: decisions.length ? decisions : undefined,
    plan: sanitizePlan(row.plan),
  }
}

/** Sanitiza um patch vindo do modelo/painel — só campos conhecidos, curtos. */
export function sanitizeMemoryPatch(patch: unknown): ProjectMemory {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>
  const s = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? sanitizeUserText(v, max) : undefined
  const out: ProjectMemory = {
    style: s(p.style, 400),
    materials: s(p.materials, 400),
    lighting: s(p.lighting, 400),
    mainImage: s(p.mainImage, 200),
    lockedElements: s(p.lockedElements, 600),
  }
  if (Array.isArray(p.decisions)) {
    const decisions = p.decisions
      .filter((d): d is string => typeof d === 'string')
      .map(d => clampText(d, 200))
      .filter(Boolean)
      .slice(0, MAX_DECISIONS)
    if (decisions.length) out.decisions = decisions
  }
  const plan = sanitizePlan(p.plan)
  if (plan) out.plan = plan
  return out
}

export function memoryPatchIsEmpty(patch: ProjectMemory): boolean {
  return !patch.style && !patch.materials && !patch.lighting && !patch.mainImage &&
    !patch.lockedElements && !(patch.decisions && patch.decisions.length) && !patch.plan
}

export async function readProjectMemory(
  supabase: SupabaseClient,
  userId: string,
  spaceId: string,
): Promise<ProjectMemory | null> {
  const { data, error } = await supabase
    .from('nodi_project_memory')
    .select('style, materials, lighting, main_image, locked_elements, decisions, plan')
    .eq('user_id', userId)
    .eq('space_id', spaceId)
    .maybeSingle()
  if (error || !data) return null
  return rowToMemory(data as MemoryRow)
}

/** Upsert confirmado pelo usuário. Decisões novas são anexadas com dedupe. */
export async function saveProjectMemory(
  supabase: SupabaseClient,
  userId: string,
  spaceId: string,
  patch: ProjectMemory,
): Promise<ProjectMemory> {
  const current = await readProjectMemory(supabase, userId, spaceId)
  const mergedDecisions = [
    ...(current?.decisions ?? []),
    ...(patch.decisions ?? []),
  ]
  const decisions = [...new Set(mergedDecisions)].slice(-MAX_DECISIONS)

  const row = {
    user_id: userId,
    space_id: spaceId,
    style: patch.style ?? current?.style ?? null,
    materials: patch.materials ?? current?.materials ?? null,
    lighting: patch.lighting ?? current?.lighting ?? null,
    main_image: patch.mainImage ?? current?.mainImage ?? null,
    locked_elements: patch.lockedElements ?? current?.lockedElements ?? null,
    decisions,
    plan: patch.plan ?? current?.plan ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('nodi_project_memory')
    .upsert(row, { onConflict: 'user_id,space_id' })
    .select('style, materials, lighting, main_image, locked_elements, decisions, plan')
    .single()
  if (error) {
    if (error.code === '42P01') {
      throw new Error('MEMORY_UNAVAILABLE') // migration não aplicada — rota traduz
    }
    throw new Error(error.message)
  }
  return rowToMemory(data as MemoryRow)
}
