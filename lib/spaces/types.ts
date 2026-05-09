// Tipos do Bloco 1 — Spaces v2.
//
// Mapeia 1:1 com o schema Postgres (migration 20260509000000_spaces_block_1).
// Mudanças no schema → atualizar aqui também.

import type { EngineId, Resolution } from '@/lib/engines'

export type SpaceCategory = 'residencial' | 'comercial' | 'conceito'

export type SpaceStatus =
  | 'draft'
  | 'dna_extracting'
  | 'dna_extracted'
  | 'locked'
  | 'archived'

export type Axis = 'iluminacao' | 'angulo' | 'horario' | 'detalhe'

export type Quality = Resolution // 'hd' | '2k' | '4k'

export type VistaEngine = EngineId | 'clarity'

export type VistaStatus = 'pending' | 'processing' | 'completed' | 'failed'

// ── DNA estruturado (output da Vision API) ─────────────────────
export interface DnaEstilo {
  nome: string
  confianca: number // 0..1
}

export interface DnaMaterial {
  nome: string
  hex: string
}

export interface ProjectDNA {
  estilo:    DnaEstilo
  materiais: DnaMaterial[]   // 3-5 entries
  paleta:    string[]        // 5-6 hex codes
  contexto:  string[]        // 2-4 tags
}

export interface DnaVerification {
  scores: {
    estilo:    number
    materiais: number
    paleta:    number
    contexto:  number
  }
  overall: number
  passed:  boolean
  notes?:  string
}

// ── Space ──────────────────────────────────────────────────────
export interface Space {
  id:                string
  user_id:           string
  name:              string
  category:          SpaceCategory
  engine:            EngineId
  status:            SpaceStatus
  vista_mestre_url:  string | null
  dna:               ProjectDNA | null
  dna_extracted_at:  string | null
  locked_at:         string | null
  created_at:        string
  updated_at:        string
}

// View spaces_with_counts adiciona estes campos.
export interface SpaceWithCounts extends Space {
  vista_count:   number
  last_vista_at: string | null
}

// ── Vista ──────────────────────────────────────────────────────
export interface Vista {
  id:                        string
  space_id:                  string
  user_id:                   string
  image_url:                 string | null
  status:                    VistaStatus
  engine:                    VistaEngine
  quality:                   Quality
  axis:                      Axis | null
  axis_value:                string | null
  axis_label:                string | null
  nodes_cost:                number
  prompt:                    string | null
  fal_request_id:            string | null
  dna_verified:              boolean | null
  dna_verification_details:  DnaVerification | null
  is_favorited:              boolean
  is_in_pack:                boolean
  source_vista_id:           string | null
  error_message:             string | null
  created_at:                string
  completed_at:              string | null
}

// ── Pack ───────────────────────────────────────────────────────
export type PackNarrative = 'tour' | 'dia_noite' | 'detalhes' | 'hero'

export interface Pack {
  id:              string
  space_id:        string
  user_id:         string
  narrative:       PackNarrative
  vistas_ordered:  string[]
  client_name:     string | null
  client_email:    string | null
  description:     string | null
  share_token:     string | null
  password_hash:   string | null
  expires_at:      string | null
  pdf_url:         string | null
  created_at:      string
  updated_at:      string
}

// ── ArchitectIdentity ──────────────────────────────────────────
export type AccentColorMode = 'fixed' | 'derived_from_dna'

export interface ArchitectIdentity {
  user_id:              string
  logo_url:             string | null
  name:                 string | null
  subtitle:             string | null
  email_contact:        string | null
  social_link:          string | null
  accent_color_mode:    AccentColorMode
  accent_color_fixed:   string | null
  footer_message:       string | null
  white_label_enabled:  boolean
  updated_at:           string
}

// ── Type guards ────────────────────────────────────────────────
export function isSpaceCategory(v: unknown): v is SpaceCategory {
  return v === 'residencial' || v === 'comercial' || v === 'conceito'
}

export function isAxis(v: unknown): v is Axis {
  return v === 'iluminacao' || v === 'angulo' || v === 'horario' || v === 'detalhe'
}

export function isQuality(v: unknown): v is Quality {
  return v === 'hd' || v === '2k' || v === '4k'
}
