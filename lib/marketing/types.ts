// lib/marketing/types.ts
//
// Tipos do sistema editorial (schema `marketing`). O schema não tem types
// gerados (não é exposto no client); estes tipos são o contrato usado por
// lib/marketing/service.ts, pelas rotas /api/admin/marketing/* e pelo painel.
// Statuses e transições: lib/marketing/workflow.ts + docs/marketing/content-workflow.md.

import type { BriefStatus, IdeaStatus, ApprovalStatus, PublicationStatus } from './workflow'

export type IdeaPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface ContentIdea {
  id: string
  title: string
  description: string | null
  pillar: string | null
  objective: string | null
  target_audience: string | null
  source: string | null
  priority: IdeaPriority
  status: IdeaStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ContentBrief {
  id: string
  idea_id: string | null
  title: string
  hook: string | null
  central_message: string | null
  format: string | null
  platform: string | null
  target_audience: string | null
  pillar: string | null
  script: string | null
  caption: string | null
  call_to_action: string | null
  visual_direction: string | null
  required_assets: string[]
  brand_check: BrandCheckSnapshot | null
  status: BriefStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Resultado do verificador persistido no briefing (shape de brand-check.ts). */
export interface BrandCheckSnapshot {
  approved: boolean
  score: number
  issues: Array<{ severity: string; code: string; message: string; field?: string }>
  suggestions: string[]
  checked_at?: string
}

export type AssetType = 'image' | 'video' | 'logo' | 'brand_file' | 'cover' | 'reference' | 'other'
export type AssetSourceType = 'upload' | 'render' | 'vista' | 'edit' | 'external' | 'brand'

export interface ContentAsset {
  id: string
  brief_id: string | null
  project_id: string | null
  generation_id: string | null
  asset_type: AssetType
  storage_path: string | null
  source_type: AssetSourceType
  original_filename: string | null
  mime_type: string | null
  width: number | null
  height: number | null
  duration: number | null
  metadata: Record<string, unknown>
  status: 'active' | 'archived'
  created_at: string
  /** URL exibível (signed) — preenchida na leitura, não persiste. */
  display_url?: string | null
}

export type PermissionStatus = 'pending' | 'requested' | 'granted' | 'denied' | 'not_required'

export interface ContentProjectLink {
  id: string
  brief_id: string
  project_id: string | null
  generation_ids: string[]
  permission_status: PermissionStatus
  notes: string | null
  created_at: string
}

export interface ContentVersion {
  id: string
  brief_id: string
  version_number: number
  title: string | null
  script: string | null
  caption: string | null
  visual_direction: string | null
  change_summary: string | null
  created_by: string | null
  created_at: string
}

export interface ContentApproval {
  id: string
  brief_id: string
  version_id: string | null
  status: ApprovalStatus
  reviewer_id: string | null
  review_notes: string | null
  reviewed_at: string | null
  created_at: string
}

export interface ContentPublication {
  id: string
  brief_id: string
  platform: string
  external_post_id: string | null
  scheduled_at: string | null
  published_at: string | null
  status: PublicationStatus
  publication_url: string | null
  metrics: Record<string, unknown>
  created_at: string
}

export interface ContentTemplate {
  id: string
  name: string
  format: string
  platform: string
  description: string | null
  template_provider: 'conceptual' | 'html' | 'canva'
  external_template_id: string | null
  aspect_ratio: string | null
  visual_rules: Record<string, unknown>
  status: 'draft' | 'active' | 'archived'
  created_at: string
}

export interface BrandRule {
  id: string
  key: string
  value: Record<string, unknown>
  description: string | null
  version: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface AutomationRun {
  id: string
  run_type: string
  status: 'running' | 'succeeded' | 'failed'
  provider: string | null
  model: string | null
  brief_id: string | null
  idea_id: string | null
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  duration_ms: number | null
  created_by: string | null
  created_at: string
}

/** Detalhe completo de um briefing para o editor/área de aprovação. */
export interface BriefDetail {
  brief: ContentBrief
  idea: ContentIdea | null
  versions: ContentVersion[]
  approvals: ContentApproval[]
  assets: ContentAsset[]
  projects: ContentProjectLink[]
}

/** Item da biblioteca de gerações do produto (para vínculo em peças). */
export interface LibraryGeneration {
  id: string
  kind: 'render' | 'vista'
  url: string
  label: string | null
  created_at: string
}
