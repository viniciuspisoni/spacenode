// lib/marketing/service.ts
//
// Serviços do fluxo editorial (schema `marketing`). Server-only: todas as
// funções recebem o admin client (service role) já autorizado pelo gate de
// staff (lib/marketing/auth.ts) — nenhuma passa por RLS, então a autorização
// acontece ANTES, nas rotas/páginas. Transições de status passam SEMPRE pela
// máquina de lib/marketing/workflow.ts.
//
// Sem transações (REST): operações compostas (versão + aprovação + status) são
// sequenciais com verificação prévia — escala de painel interno, não de
// produto. Se o volume crescer, mover para RPC.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertBriefTransition,
  assertIdeaTransition,
  isBriefStatus,
  type BriefStatus,
  type IdeaStatus,
} from './workflow'
import {
  runBrandCheck,
  toBrandCheckRules,
  type BrandCheckResult,
} from './brand-check'
import { signMarketingAssetUrl } from './storage'
import { signStorageUrl } from '@/lib/storage/signed'
import type {
  AutomationRun,
  BriefDetail,
  ContentApproval,
  ContentAsset,
  ContentBrief,
  ContentIdea,
  ContentProjectLink,
  ContentPublication,
  ContentTemplate,
  ContentVersion,
  LibraryGeneration,
} from './types'

// PostgREST só aceita .schema() para schemas expostos — ver header da migration
// 20260713000000_marketing_schema.sql (passo de deploy: expor `marketing`).
function mkt(admin: SupabaseClient) {
  return admin.schema('marketing')
}

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`)
  if (res.data === null || res.data === undefined) throw new Error(`${ctx}: não encontrado`)
  return res.data
}

// ════════════════════════════════════════════════════════════════════════════
// Ideias
// ════════════════════════════════════════════════════════════════════════════

export interface IdeaFilters {
  status?: IdeaStatus
  pillar?: string
  priority?: string
}

export async function listIdeas(admin: SupabaseClient, filters: IdeaFilters = {}): Promise<ContentIdea[]> {
  let q = mkt(admin).from('content_ideas').select('*').order('created_at', { ascending: false }).limit(300)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.pillar) q = q.eq('pillar', filters.pillar)
  if (filters.priority) q = q.eq('priority', filters.priority)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar ideias: ${error.message}`)
  return (data ?? []) as ContentIdea[]
}

export interface CreateIdeaInput {
  title: string
  description?: string | null
  pillar?: string | null
  objective?: string | null
  target_audience?: string | null
  source?: string | null
  priority?: string
}

export async function createIdea(
  admin: SupabaseClient,
  input: CreateIdeaInput,
  userId: string,
): Promise<ContentIdea> {
  const title = input.title?.trim()
  if (!title) throw new Error('Título é obrigatório')
  const res = await mkt(admin)
    .from('content_ideas')
    .insert({
      title,
      description: input.description ?? null,
      pillar: input.pillar ?? null,
      objective: input.objective ?? null,
      target_audience: input.target_audience ?? null,
      source: input.source ?? null,
      priority: input.priority ?? 'normal',
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar ideia') as ContentIdea
}

const IDEA_EDITABLE = [
  'title', 'description', 'pillar', 'objective', 'target_audience', 'source', 'priority',
] as const

export async function updateIdea(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<ContentIdea> {
  const update: Record<string, unknown> = {}
  for (const key of IDEA_EDITABLE) {
    if (key in patch) update[key] = patch[key]
  }

  if (typeof patch.status === 'string') {
    const current = must(
      await mkt(admin).from('content_ideas').select('status').eq('id', id).maybeSingle(),
      'Ideia',
    ) as { status: IdeaStatus }
    assertIdeaTransition(current.status, patch.status as IdeaStatus)
    update.status = patch.status
  }

  if (Object.keys(update).length === 0) throw new Error('Nada para atualizar')

  const res = await mkt(admin)
    .from('content_ideas')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  return must(res, 'Falha ao atualizar ideia') as ContentIdea
}

// ════════════════════════════════════════════════════════════════════════════
// Briefings
// ════════════════════════════════════════════════════════════════════════════

export interface BriefFilters {
  status?: BriefStatus
  statuses?: BriefStatus[]
  pillar?: string
}

export async function listBriefs(admin: SupabaseClient, filters: BriefFilters = {}): Promise<ContentBrief[]> {
  let q = mkt(admin).from('content_briefs').select('*').order('updated_at', { ascending: false }).limit(300)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.statuses?.length) q = q.in('status', filters.statuses)
  if (filters.pillar) q = q.eq('pillar', filters.pillar)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar briefings: ${error.message}`)
  return (data ?? []) as ContentBrief[]
}

export async function getBrief(admin: SupabaseClient, id: string): Promise<ContentBrief> {
  const res = await mkt(admin).from('content_briefs').select('*').eq('id', id).maybeSingle()
  return must(res, 'Briefing') as ContentBrief
}

/** Transforma uma ideia em briefing (rascunho) e marca a ideia como convertida. */
export async function ideaToBrief(
  admin: SupabaseClient,
  ideaId: string,
  userId: string,
): Promise<ContentBrief> {
  const idea = must(
    await mkt(admin).from('content_ideas').select('*').eq('id', ideaId).maybeSingle(),
    'Ideia',
  ) as ContentIdea

  assertIdeaTransition(idea.status, 'converted')

  const res = await mkt(admin)
    .from('content_briefs')
    .insert({
      idea_id: idea.id,
      title: idea.title,
      pillar: idea.pillar,
      target_audience: idea.target_audience,
      central_message: idea.objective,
      created_by: userId,
    })
    .select('*')
    .single()
  const brief = must(res, 'Falha ao criar briefing') as ContentBrief

  const { error } = await mkt(admin)
    .from('content_ideas')
    .update({ status: 'converted' })
    .eq('id', idea.id)
  if (error) throw new Error(`Briefing criado, mas falhou ao marcar a ideia: ${error.message}`)

  return brief
}

export interface CreateBriefInput {
  title: string
  pillar?: string | null
  format?: string | null
  platform?: string | null
  target_audience?: string | null
}

export async function createBrief(
  admin: SupabaseClient,
  input: CreateBriefInput,
  userId: string,
): Promise<ContentBrief> {
  const title = input.title?.trim()
  if (!title) throw new Error('Título é obrigatório')
  const res = await mkt(admin)
    .from('content_briefs')
    .insert({
      title,
      pillar: input.pillar ?? null,
      format: input.format ?? null,
      platform: input.platform ?? null,
      target_audience: input.target_audience ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar briefing') as ContentBrief
}

const BRIEF_EDITABLE = [
  'title', 'hook', 'central_message', 'format', 'platform', 'target_audience',
  'pillar', 'script', 'caption', 'call_to_action', 'visual_direction', 'required_assets',
] as const

/** Atualiza campos editoriais. Status NUNCA muda aqui — só pelas funções de
 *  fluxo (requestReview/decideReview/advanceBrief). Edição direta é permitida
 *  apenas em rascunho/alterações solicitadas. */
export async function updateBrief(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<ContentBrief> {
  const current = await getBrief(admin, id)
  if (current.status !== 'brief_draft' && current.status !== 'changes_requested') {
    throw new Error(`Briefing em "${current.status}" não é editável — crie uma nova versão via fluxo`)
  }

  const update: Record<string, unknown> = {}
  for (const key of BRIEF_EDITABLE) {
    if (key in patch) update[key] = patch[key]
  }
  if ('required_assets' in update && !Array.isArray(update.required_assets)) {
    throw new Error('required_assets deve ser uma lista')
  }
  if (Object.keys(update).length === 0) throw new Error('Nada para atualizar')

  const res = await mkt(admin)
    .from('content_briefs')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  return must(res, 'Falha ao atualizar briefing') as ContentBrief
}

export async function getBriefDetail(admin: SupabaseClient, id: string): Promise<BriefDetail> {
  const brief = await getBrief(admin, id)

  const [versionsRes, approvalsRes, assetsRes, projectsRes, ideaRes] = await Promise.all([
    mkt(admin).from('content_versions').select('*').eq('brief_id', id)
      .order('version_number', { ascending: false }),
    mkt(admin).from('content_approvals').select('*').eq('brief_id', id)
      .order('created_at', { ascending: false }),
    mkt(admin).from('content_assets').select('*').eq('brief_id', id).eq('status', 'active')
      .order('created_at', { ascending: false }),
    mkt(admin).from('content_projects').select('*').eq('brief_id', id)
      .order('created_at', { ascending: false }),
    brief.idea_id
      ? mkt(admin).from('content_ideas').select('*').eq('id', brief.idea_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (versionsRes.error) throw new Error(`Falha ao ler versões: ${versionsRes.error.message}`)
  if (approvalsRes.error) throw new Error(`Falha ao ler aprovações: ${approvalsRes.error.message}`)
  if (assetsRes.error) throw new Error(`Falha ao ler assets: ${assetsRes.error.message}`)
  if (projectsRes.error) throw new Error(`Falha ao ler projetos: ${projectsRes.error.message}`)

  const assets = (assetsRes.data ?? []) as ContentAsset[]
  await Promise.all(assets.map(async a => {
    if (a.storage_path) {
      a.display_url = await signMarketingAssetUrl(admin, a.storage_path)
    } else {
      const origin = a.metadata?.origin_url
      a.display_url = typeof origin === 'string' ? await signStorageUrl(admin, origin) : null
    }
  }))

  return {
    brief,
    idea: (ideaRes.data as ContentIdea | null) ?? null,
    versions: (versionsRes.data ?? []) as ContentVersion[],
    approvals: (approvalsRes.data ?? []) as ContentApproval[],
    assets,
    projects: (projectsRes.data ?? []) as ContentProjectLink[],
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Versões
// ════════════════════════════════════════════════════════════════════════════

/** Snapshot imutável do conteúdo atual do briefing. */
export async function createVersion(
  admin: SupabaseClient,
  briefId: string,
  changeSummary: string | null,
  userId: string,
): Promise<ContentVersion> {
  const brief = await getBrief(admin, briefId)

  const { data: last, error: lastErr } = await mkt(admin)
    .from('content_versions')
    .select('version_number')
    .eq('brief_id', briefId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastErr) throw new Error(`Falha ao ler versões: ${lastErr.message}`)
  const nextNumber = ((last as { version_number?: number } | null)?.version_number ?? 0) + 1

  const res = await mkt(admin)
    .from('content_versions')
    .insert({
      brief_id: briefId,
      version_number: nextNumber,
      title: brief.title,
      script: brief.script,
      caption: brief.caption,
      visual_direction: brief.visual_direction,
      change_summary: changeSummary,
      created_by: userId,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao criar versão') as ContentVersion
}

// ════════════════════════════════════════════════════════════════════════════
// Fluxo de aprovação
// ════════════════════════════════════════════════════════════════════════════

async function setBriefStatus(admin: SupabaseClient, briefId: string, to: BriefStatus): Promise<void> {
  const { error } = await mkt(admin).from('content_briefs').update({ status: to }).eq('id', briefId)
  if (error) throw new Error(`Falha ao mudar status: ${error.message}`)
}

/** Envia para revisão humana: snapshot de versão + registro de aprovação pendente. */
export async function requestReview(
  admin: SupabaseClient,
  briefId: string,
  userId: string,
  changeSummary?: string | null,
): Promise<{ version: ContentVersion }> {
  const brief = await getBrief(admin, briefId)
  assertBriefTransition(brief.status, 'awaiting_review')

  const version = await createVersion(
    admin, briefId, changeSummary ?? 'Enviado para revisão', userId,
  )

  const { error } = await mkt(admin).from('content_approvals').insert({
    brief_id: briefId,
    version_id: version.id,
    status: 'awaiting_review',
  })
  if (error) throw new Error(`Falha ao registrar solicitação: ${error.message}`)

  await setBriefStatus(admin, briefId, 'awaiting_review')
  return { version }
}

export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected'

/** Decisão de revisão HUMANA — aprova, pede alterações ou rejeita. */
export async function decideReview(
  admin: SupabaseClient,
  briefId: string,
  reviewerId: string,
  decision: ReviewDecision,
  notes?: string | null,
): Promise<void> {
  const brief = await getBrief(admin, briefId)
  assertBriefTransition(brief.status, decision)

  const { data: lastVersion } = await mkt(admin)
    .from('content_versions')
    .select('id')
    .eq('brief_id', briefId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await mkt(admin).from('content_approvals').insert({
    brief_id: briefId,
    version_id: (lastVersion as { id?: string } | null)?.id ?? null,
    status: decision,
    reviewer_id: reviewerId,
    review_notes: notes ?? null,
    reviewed_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Falha ao registrar decisão: ${error.message}`)

  await setBriefStatus(admin, briefId, decision)
}

/** Estágios de produção operáveis pelo painel neste sprint. `scheduled`,
 *  `published` e `analyzed` são das integrações futuras — bloqueados aqui de
 *  propósito (nenhuma publicação/agendamento automático). */
const PANEL_ADVANCE_TARGETS: readonly BriefStatus[] = [
  'ready_for_production', 'asset_production', 'final_review', 'ready_to_schedule',
  'changes_requested', 'awaiting_review', 'brief_draft',
]

export async function advanceBrief(
  admin: SupabaseClient,
  briefId: string,
  to: string,
): Promise<void> {
  if (!isBriefStatus(to)) throw new Error('Status desconhecido')
  if (!PANEL_ADVANCE_TARGETS.includes(to)) {
    throw new Error('Agendamento e publicação ficam fora deste sprint — transição bloqueada')
  }
  const brief = await getBrief(admin, briefId)
  assertBriefTransition(brief.status, to)
  await setBriefStatus(admin, briefId, to)
}

// ════════════════════════════════════════════════════════════════════════════
// Assets e projetos vinculados
// ════════════════════════════════════════════════════════════════════════════

export interface UploadAssetInput {
  briefId: string | null
  assetType: string
  storagePath: string
  originalFilename?: string | null
  mimeType?: string | null
  sizeMeta?: Record<string, unknown>
}

/** Registra um asset subido no bucket marketing-assets (após confirm). */
export async function createUploadAsset(
  admin: SupabaseClient,
  input: UploadAssetInput,
): Promise<ContentAsset> {
  const res = await mkt(admin)
    .from('content_assets')
    .insert({
      brief_id: input.briefId,
      asset_type: input.assetType,
      source_type: input.briefId ? 'upload' : 'brand',
      storage_path: input.storagePath,
      original_filename: input.originalFilename ?? null,
      mime_type: input.mimeType ?? null,
      metadata: input.sizeMeta ?? {},
    })
    .select('*')
    .single()
  const asset = must(res, 'Falha ao registrar asset') as ContentAsset
  asset.display_url = await signMarketingAssetUrl(admin, asset.storage_path)
  return asset
}

/** Vincula uma geração real do produto (render/vista) a um briefing. */
export async function linkGenerationAsset(
  admin: SupabaseClient,
  briefId: string,
  kind: 'render' | 'vista',
  generationId: string,
): Promise<ContentAsset> {
  const table = kind === 'render' ? 'renders' : 'vistas'
  const urlColumn = kind === 'render' ? 'output_url' : 'image_url'
  const row = must(
    await admin.from(table).select(`id, ${urlColumn}, created_at`).eq('id', generationId).maybeSingle(),
    'Geração',
  ) as Record<string, unknown>

  const originUrl = row[urlColumn]
  if (typeof originUrl !== 'string' || !originUrl) {
    throw new Error('Geração sem imagem disponível')
  }

  const res = await mkt(admin)
    .from('content_assets')
    .insert({
      brief_id: briefId,
      generation_id: generationId,
      asset_type: 'image',
      source_type: kind,
      metadata: { origin_url: originUrl },
    })
    .select('*')
    .single()
  const asset = must(res, 'Falha ao vincular geração') as ContentAsset
  asset.display_url = await signStorageUrl(admin, originUrl)
  return asset
}

export async function archiveAsset(admin: SupabaseClient, assetId: string): Promise<void> {
  const { error } = await mkt(admin)
    .from('content_assets')
    .update({ status: 'archived' })
    .eq('id', assetId)
  if (error) throw new Error(`Falha ao arquivar asset: ${error.message}`)
}

/** Assets de marca (sem briefing) para a biblioteca. */
export async function listBrandAssets(admin: SupabaseClient): Promise<ContentAsset[]> {
  const { data, error } = await mkt(admin)
    .from('content_assets')
    .select('*')
    .is('brief_id', null)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`Falha ao listar assets: ${error.message}`)
  const assets = (data ?? []) as ContentAsset[]
  await Promise.all(assets.map(async a => {
    a.display_url = await signMarketingAssetUrl(admin, a.storage_path)
  }))
  return assets
}

export interface LinkProjectInput {
  projectId?: string | null
  generationIds?: string[]
  permissionStatus?: string
  notes?: string | null
}

/** Relaciona o briefing a um projeto/gerações do produto, com o estado de
 *  permissão de uso (pré-requisito de produção quando material é de cliente). */
export async function linkProject(
  admin: SupabaseClient,
  briefId: string,
  input: LinkProjectInput,
): Promise<ContentProjectLink> {
  const res = await mkt(admin)
    .from('content_projects')
    .insert({
      brief_id: briefId,
      project_id: input.projectId ?? null,
      generation_ids: input.generationIds ?? [],
      permission_status: input.permissionStatus ?? 'pending',
      notes: input.notes ?? null,
    })
    .select('*')
    .single()
  return must(res, 'Falha ao vincular projeto') as ContentProjectLink
}

export async function updateProjectLink(
  admin: SupabaseClient,
  linkId: string,
  patch: { permissionStatus?: string; notes?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.permissionStatus) update.permission_status = patch.permissionStatus
  if ('notes' in patch) update.notes = patch.notes
  if (Object.keys(update).length === 0) throw new Error('Nada para atualizar')
  const { error } = await mkt(admin).from('content_projects').update(update).eq('id', linkId)
  if (error) throw new Error(`Falha ao atualizar vínculo: ${error.message}`)
}

// ════════════════════════════════════════════════════════════════════════════
// Biblioteca de gerações do produto (para vínculo)
// ════════════════════════════════════════════════════════════════════════════

/** Gerações reais recentes (renders/vistas) para seleção no painel. Exposição
 *  mínima: id, imagem (assinada quando bucket privado) e label — nada de dados
 *  do usuário dono. O uso em peça exige permissão registrada (content_projects). */
export async function listProductLibrary(
  admin: SupabaseClient,
  kind: 'render' | 'vista',
  limit = 60,
): Promise<LibraryGeneration[]> {
  if (kind === 'render') {
    const { data, error } = await admin
      .from('renders')
      .select('id, output_url, ambient, style, created_at')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`Falha ao listar renders: ${error.message}`)
    return Promise.all((data ?? []).map(async r => ({
      id: r.id as string,
      kind: 'render' as const,
      url: (await signStorageUrl(admin, r.output_url as string)) ?? (r.output_url as string),
      label: [r.ambient, r.style].filter(Boolean).join(' · ') || null,
      created_at: r.created_at as string,
    })))
  }

  const { data, error } = await admin
    .from('vistas')
    .select('id, image_url, axis_label, created_at')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Falha ao listar vistas: ${error.message}`)
  return Promise.all((data ?? []).map(async v => ({
    id: v.id as string,
    kind: 'vista' as const,
    url: (await signStorageUrl(admin, v.image_url as string)) ?? (v.image_url as string),
    label: (v.axis_label as string | null) ?? null,
    created_at: v.created_at as string,
  })))
}

// ════════════════════════════════════════════════════════════════════════════
// Similaridade (anti-repetição)
// ════════════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na',
  'nos', 'nas', 'e', 'ou', 'que', 'com', 'sem', 'por', 'para', 'pra', 'ao', 'aos',
  'seu', 'sua', 'seus', 'suas', 'mais', 'menos', 'como', 'antes', 'depois', 'entre',
  'mesmo', 'mesma', 'não', 'nao', 'já', 'ja', 'é', 'ser', 'tem', 'the', 'of',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

export interface SimilarContent {
  kind: 'brief' | 'idea'
  id: string
  title: string
  status: string
  score: number
}

const SIMILARITY_THRESHOLD = 0.3

/** Compara título+gancho+mensagem com briefings e ideias existentes (Jaccard de
 *  tokens). Barato e suficiente para painel; um dia pode virar pg_trgm/embedding. */
export async function findSimilarContent(
  admin: SupabaseClient,
  text: { title?: string | null; hook?: string | null; central_message?: string | null },
  excludeBriefId?: string,
  excludeIdeaId?: string,
): Promise<SimilarContent[]> {
  const probe = tokenize([text.title, text.hook, text.central_message].filter(Boolean).join(' '))
  if (probe.size === 0) return []

  const [briefsRes, ideasRes] = await Promise.all([
    mkt(admin).from('content_briefs')
      .select('id, title, hook, central_message, status')
      .order('updated_at', { ascending: false })
      .limit(300),
    mkt(admin).from('content_ideas')
      .select('id, title, description, status')
      .order('updated_at', { ascending: false })
      .limit(300),
  ])
  if (briefsRes.error) throw new Error(`Falha ao buscar briefings: ${briefsRes.error.message}`)
  if (ideasRes.error) throw new Error(`Falha ao buscar ideias: ${ideasRes.error.message}`)

  const results: SimilarContent[] = []

  for (const b of briefsRes.data ?? []) {
    if (b.id === excludeBriefId) continue
    const score = jaccard(probe, tokenize([b.title, b.hook, b.central_message].filter(Boolean).join(' ')))
    if (score >= SIMILARITY_THRESHOLD) {
      results.push({ kind: 'brief', id: b.id, title: b.title, status: b.status, score })
    }
  }
  for (const i of ideasRes.data ?? []) {
    if (i.id === excludeIdeaId) continue
    const score = jaccard(probe, tokenize([i.title, i.description].filter(Boolean).join(' ')))
    if (score >= SIMILARITY_THRESHOLD) {
      results.push({ kind: 'idea', id: i.id, title: i.title, status: i.status, score })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5)
}

// ════════════════════════════════════════════════════════════════════════════
// Regras da marca + verificação
// ════════════════════════════════════════════════════════════════════════════

export async function getBrandRules(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await mkt(admin)
    .from('brand_rules')
    .select('key, value')
    .eq('active', true)
  if (error) throw new Error(`Falha ao ler regras da marca: ${error.message}`)
  const map: Record<string, unknown> = {}
  for (const row of data ?? []) map[row.key as string] = row.value
  return map
}

/** Roda o verificador de marca sobre o conteúdo atual do briefing, persiste o
 *  resultado no próprio briefing e registra a execução. */
export async function runBriefBrandCheck(
  admin: SupabaseClient,
  briefId: string,
  userId: string,
): Promise<BrandCheckResult> {
  const started = Date.now()
  const brief = await getBrief(admin, briefId)

  const [rulesMap, similar] = await Promise.all([
    getBrandRules(admin).catch(() => ({}) as Record<string, unknown>),
    findSimilarContent(admin, brief, brief.id).catch(() => []),
  ])

  const result = runBrandCheck(
    {
      title: brief.title,
      hook: brief.hook,
      central_message: brief.central_message,
      caption: brief.caption,
      script: brief.script,
      call_to_action: brief.call_to_action,
      visual_direction: brief.visual_direction,
      platform: brief.platform,
      format: brief.format,
      target_audience: brief.target_audience,
      similar_titles: similar.map(s => s.title),
    },
    toBrandCheckRules(rulesMap),
  )

  const { error } = await mkt(admin)
    .from('content_briefs')
    .update({ brand_check: { ...result, checked_at: new Date().toISOString() } })
    .eq('id', briefId)
  if (error) throw new Error(`Falha ao salvar verificação: ${error.message}`)

  await recordAutomationRun(admin, {
    run_type: 'brand_check',
    status: 'succeeded',
    provider: 'internal',
    brief_id: briefId,
    output: { approved: result.approved, score: result.score, issues: result.issues.length },
    duration_ms: Date.now() - started,
    created_by: userId,
  })

  return result
}

// ════════════════════════════════════════════════════════════════════════════
// Templates, publicações e automações
// ════════════════════════════════════════════════════════════════════════════

export async function listTemplates(admin: SupabaseClient): Promise<ContentTemplate[]> {
  const { data, error } = await mkt(admin)
    .from('content_templates')
    .select('*')
    .neq('status', 'archived')
    .order('name')
  if (error) throw new Error(`Falha ao listar templates: ${error.message}`)
  return (data ?? []) as ContentTemplate[]
}

export interface AutomationRunInput {
  run_type: string
  status: 'succeeded' | 'failed'
  provider?: string | null
  model?: string | null
  brief_id?: string | null
  idea_id?: string | null
  input?: Record<string, unknown> | null
  output?: Record<string, unknown> | null
  error?: string | null
  duration_ms?: number | null
  created_by?: string | null
}

/** Registra uma execução de automação/IA (rastreabilidade — Etapa 6/9). */
export async function recordAutomationRun(
  admin: SupabaseClient,
  run: AutomationRunInput,
): Promise<void> {
  const { error } = await mkt(admin).from('automation_runs').insert(run)
  // Log de automação nunca derruba a operação principal.
  if (error) console.warn(`[marketing] falha ao registrar automation_run: ${error.message}`)
}

export async function listAutomationRuns(admin: SupabaseClient, limit = 50): Promise<AutomationRun[]> {
  const { data, error } = await mkt(admin)
    .from('automation_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Falha ao listar automações: ${error.message}`)
  return (data ?? []) as AutomationRun[]
}

// ════════════════════════════════════════════════════════════════════════════
// Dashboard
// ════════════════════════════════════════════════════════════════════════════

export interface DashboardData {
  ideaCounts: Record<string, number>
  briefCounts: Record<string, number>
  recentBriefs: Pick<ContentBrief, 'id' | 'title' | 'status' | 'pillar' | 'updated_at'>[]
  upcomingPublications: ContentPublication[]
  recentRuns: AutomationRun[]
}

export async function getDashboardData(admin: SupabaseClient): Promise<DashboardData> {
  const [ideasRes, briefsRes, pubsRes, runs] = await Promise.all([
    mkt(admin).from('content_ideas').select('id, status').limit(1000),
    mkt(admin).from('content_briefs')
      .select('id, title, status, pillar, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000),
    mkt(admin).from('content_publications')
      .select('*')
      .in('status', ['planned', 'scheduled'])
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10),
    listAutomationRuns(admin, 8).catch(() => [] as AutomationRun[]),
  ])
  if (ideasRes.error) throw new Error(`Falha no dashboard (ideias): ${ideasRes.error.message}`)
  if (briefsRes.error) throw new Error(`Falha no dashboard (briefings): ${briefsRes.error.message}`)
  if (pubsRes.error) throw new Error(`Falha no dashboard (publicações): ${pubsRes.error.message}`)

  const ideaCounts: Record<string, number> = {}
  for (const i of ideasRes.data ?? []) {
    ideaCounts[i.status as string] = (ideaCounts[i.status as string] ?? 0) + 1
  }
  const briefCounts: Record<string, number> = {}
  for (const b of briefsRes.data ?? []) {
    briefCounts[b.status as string] = (briefCounts[b.status as string] ?? 0) + 1
  }

  return {
    ideaCounts,
    briefCounts,
    recentBriefs: (briefsRes.data ?? []).slice(0, 8) as DashboardData['recentBriefs'],
    upcomingPublications: (pubsRes.data ?? []) as ContentPublication[],
    recentRuns: runs,
  }
}
