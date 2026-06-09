// Helpers server-side compartilhados entre POST /api/edits e /api/edits/preview.
//
// Centraliza a montagem do EditRoutingInput (origem da imagem, plano, uso
// mensal) e o upload do resultado/crops pro Supabase Storage, pra que a rota de
// preview e a de geração routeiem com EXATAMENTE os mesmos dados.

import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EditMode } from './engines'
import type { Quality, EditSourceType } from './types'
import type { FidelityMode } from './edit-prompts'
import {
  isEditReferenceRole,
  MAX_EDIT_REFERENCES,
  type EditRoutingInput,
  type EditRoutingResult,
  type EditReferenceImage,
  type EditReferenceSource,
} from './edit-router'
import { editToolFromMode, resolutionFromQuality } from './edit-router-adapters'
import { monthlyFreeFixLimit, specUserPlanFromPlanId } from './edit-free-fix'

type Admin = SupabaseClient

export interface EditRequestParams {
  mode:            EditMode
  prompt:          string
  /** Há máscara desenhada? (no preview vem de coverage>0; no POST, de mask_url). */
  hasMask:         boolean
  maskCoverage:    number | null
  quality:         Quality
  fidelity:        FidelityMode
  premium:         boolean
  imageMegapixels: number | null
  sourceType:      EditSourceType
  sourceId:        string | null
  references:      EditReferenceImage[]
}

export interface RoutingContext {
  input:                 EditRoutingInput
  /** Tabela onde incrementar free_fixes_used da origem (null = upload/edit). */
  sourceTable:           'renders' | 'vistas' | null
  sourceId:              string | null
  freeFixesUsedForImage: number
  plan:                  string
}

/** Mês corrente no formato YYYY-MM-01 (UTC), alinhado ao date_trunc do banco. */
export function currentUsageMonth(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export async function buildRoutingContext(
  admin:  Admin,
  userId: string,
  p:      EditRequestParams,
): Promise<RoutingContext> {
  // 1) Origem da imagem → generated_by_spacenode + free_fixes_used.
  let isGeneratedBySpacenode = false
  let freeFixesUsedForImage  = 0
  let sourceTable: 'renders' | 'vistas' | null = null

  if (p.sourceId && (p.sourceType === 'render' || p.sourceType === 'vista')) {
    sourceTable = p.sourceType === 'render' ? 'renders' : 'vistas'
    const { data } = await admin
      .from(sourceTable)
      .select('free_fixes_used, generated_by_spacenode')
      .eq('id', p.sourceId)
      .eq('user_id', userId)
      .maybeSingle()
    if (data) {
      isGeneratedBySpacenode = data.generated_by_spacenode !== false
      freeFixesUsedForImage  = data.free_fixes_used ?? 0
    } else {
      sourceTable = null // não encontrada → trata como não-Spacenode
    }
  }

  // 2) Plano do usuário.
  const { data: prof } = await admin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle()
  const plan = (prof?.plan as string) ?? 'free'

  // 3) Uso mensal de correções grátis.
  const { data: usage } = await admin
    .from('user_monthly_usage')
    .select('free_fixes_used')
    .eq('user_id', userId)
    .eq('month', currentUsageMonth())
    .maybeSingle()
  const monthlyFreeFixesUsed = usage?.free_fixes_used ?? 0

  const input: EditRoutingInput = {
    tool:                   editToolFromMode(p.mode),
    prompt:                 p.prompt,
    hasMask:                p.hasMask,
    maskAreaRatio:          p.maskCoverage ?? 0,
    imageMegapixels:        sanitizeMp(p.imageMegapixels),
    outputResolution:       resolutionFromQuality(p.quality),
    preservationMode:       p.fidelity,
    isGeneratedBySpacenode,
    freeFixesUsedForImage,
    monthlyFreeFixesUsed,
    monthlyFreeFixesLimit:  monthlyFreeFixLimit(plan),
    userPlan:               specUserPlanFromPlanId(plan),
    userSelectedPremium:    p.premium,
    references:             p.references,
  }

  return { input, sourceTable, sourceId: p.sourceId, freeFixesUsedForImage, plan }
}

function sanitizeMp(mp: number | null): number {
  if (mp == null || !Number.isFinite(mp) || mp <= 0) return 2 // fallback ~2 MP
  return Math.min(64, mp)
}

// ── Upload de resultado / crops pro Storage ──────────────────────────────────────
export async function uploadEditAsset(
  admin:  Admin,
  userId: string,
  buffer: Buffer,
  kind:   'result' | 'crop' | 'crop-mask',
): Promise<string> {
  const meta = await sharp(buffer).metadata()
  const fmt =
    meta.format === 'png'  ? 'png'  :
    meta.format === 'webp' ? 'webp' : 'jpg'
  const contentType =
    fmt === 'png'  ? 'image/png'  :
    fmt === 'webp' ? 'image/webp' : 'image/jpeg'

  const rand = Math.random().toString(36).slice(2, 8)
  const key  = `${userId}/retocar/${kind}/${Date.now()}-${rand}.${fmt}`

  const { error } = await admin.storage
    .from('space-mestres')
    .upload(key, buffer, { contentType, upsert: false })
  if (error) throw new Error('storage upload failed: ' + error.message)

  const { data } = admin.storage.from('space-mestres').getPublicUrl(key)
  return data.publicUrl
}

// ── Referências visuais ──────────────────────────────────────────────────────────

interface RawReference {
  url?: unknown; role?: unknown; source?: unknown; note?: unknown; id?: unknown
}

/** Valida + normaliza a lista de referências do payload (máx MAX_EDIT_REFERENCES). */
export function parseReferences(raw: unknown): EditReferenceImage[] {
  if (!Array.isArray(raw)) return []
  const out: EditReferenceImage[] = []
  for (const item of raw) {
    if (out.length >= MAX_EDIT_REFERENCES) break
    const r = item as RawReference
    const url = typeof r.url === 'string' ? r.url : null
    if (!url || !isEditReferenceRole(r.role)) continue
    const source: EditReferenceSource =
      r.source === 'project' ? 'project' : r.source === 'original' ? 'original' : 'upload'
    out.push({
      id:     typeof r.id === 'string' ? r.id : url,
      url,
      role:   r.role,
      source,
      note:   typeof r.note === 'string' ? r.note.slice(0, 280) : undefined,
    })
  }
  return out
}

/** Distintos papéis das referências (para image_edit_attempts.reference_roles). */
export function referenceRoles(references: EditReferenceImage[]): string[] {
  return Array.from(new Set(references.map(r => r.role)))
}

/** Persiste as referências usadas numa tentativa em edit_reference_assets. */
export async function persistReferences(
  admin: Admin,
  args: {
    userId:        string
    attemptId:     string | null
    projectId:     string | null
    sourceImageId: string | null
    references:    EditReferenceImage[]
  },
): Promise<void> {
  if (args.references.length === 0) return
  const rows = args.references.map(ref => ({
    user_id:         args.userId,
    project_id:      args.projectId,
    edit_attempt_id: args.attemptId,
    source_image_id: args.sourceImageId,
    role:            ref.role,
    source:          ref.source,
    storage_path:    null,
    public_url:      ref.url,
    note:            ref.note ?? null,
  }))
  const { error } = await admin.from('edit_reference_assets').insert(rows)
  if (error) console.error('[edits] persistReferences failed:', error.message)
}

/** Upload de uma imagem de referência pro Storage; devolve url + metadados. */
export async function uploadReferenceAsset(
  admin:  Admin,
  userId: string,
  buffer: Buffer,
): Promise<{ url: string; width: number | null; height: number | null; fileSize: number; mime: string }> {
  const meta = await sharp(buffer).metadata()
  const fmt =
    meta.format === 'png'  ? 'png'  :
    meta.format === 'webp' ? 'webp' : 'jpg'
  const mime =
    fmt === 'png'  ? 'image/png'  :
    fmt === 'webp' ? 'image/webp' : 'image/jpeg'
  const rand = Math.random().toString(36).slice(2, 8)
  const key  = `${userId}/retocar/reference/${Date.now()}-${rand}.${fmt}`

  const { error } = await admin.storage
    .from('space-mestres')
    .upload(key, buffer, { contentType: mime, upsert: false })
  if (error) throw new Error('reference upload failed: ' + error.message)

  const { data } = admin.storage.from('space-mestres').getPublicUrl(key)
  return {
    url:      data.publicUrl,
    width:    meta.width ?? null,
    height:   meta.height ?? null,
    fileSize: buffer.byteLength,
    mime,
  }
}

// ── Log temporário da decisão de rota (dev/staging, NUNCA produção) ──────────────
// Liga em: next dev local e deploys de preview/staging na Vercel.
// Desliga em: produção na Vercel (VERCEL_ENV='production') e builds de produção
// fora da Vercel. Force-off explícito com EDIT_ROUTER_DEBUG=0.
const EDIT_ROUTE_DEBUG =
  process.env.EDIT_ROUTER_DEBUG === '0'
    ? false
    : process.env.VERCEL_ENV
      ? process.env.VERCEL_ENV !== 'production'
      : process.env.NODE_ENV !== 'production'

export function logEditRoute(routing: EditRoutingResult, input: EditRoutingInput): void {
  if (!EDIT_ROUTE_DEBUG) return
  const refs = input.references ?? []
  console.log(
    '[editRoute] tool=%s endpoint=%s costNodes=%d isFreeFix=%s shouldUseCrop=%s maskAreaRatio=%s refs=%d reason=%o',
    input.tool,
    routing.endpoint,
    routing.costNodes,
    routing.isFreeFix,
    routing.shouldUseCrop,
    input.maskAreaRatio.toFixed(3),
    refs.length,
    routing.reason,
  )
  // Detalhe das referências (item D): qual será a PRINCIPAL e as urls enviadas,
  // pra cruzar com a UI e flagrar uso de referência errada/antiga (item E).
  if (refs.length > 0) {
    const usesFirstOnly =
      routing.endpoint === 'fal-ai/flux-kontext-lora/inpaint' ||
      routing.endpoint === 'vertex/imagen-edit'
    console.log(
      '[editRoute] refs primary=%s | %s',
      usesFirstOnly ? `references[0] (${refs[0].role})` : `all image_urls (#0=${refs[0].role})`,
      refs.map((r, i) => `#${i} ${r.role} …${r.url.slice(-26)}`).join('  '),
    )
  }
}
