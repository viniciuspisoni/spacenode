// lib/spaces/types.ts

export type VistaType =
  | 'mestre'
  | 'iluminacao'
  | 'material'
  | 'angulo'
  | 'detalhe'
  | 'interior'

export type GenerationMode = 'coerente' | 'explorar'

export type SpaceCategory = 'residencial' | 'comercial' | 'conceito'

export type DnaTrait = 'style' | 'materials' | 'palette' | 'context' | 'lighting'

// ── Project DNA ────────────────────────────────────────────────
export interface ProjectDNA {
  style:     string    // "Contemporâneo brasileiro com volumes brancos e madeira"
  materials: string    // "Concreto pintado branco, madeira escura ripada vertical..."
  palette:   string[]  // ["#E8E5DE", "#3D2A1E", "#6B7355", "#2B3A4A"]
  context:   string    // "Terreno em pedra, vegetação nativa, fundo de mata"
  lighting:  string    // "Sol pleno, sombras duras, blue sky"
}

export interface DnaTraitOverride {
  locked:    boolean
  override?: string
}

export type DnaOverrides = {
  [K in DnaTrait]: DnaTraitOverride
}

// ── Space ──────────────────────────────────────────────────────
export interface Space {
  id:                string
  user_id:           string
  name:              string
  category:          SpaceCategory
  anchor_render_id:  string | null
  project_dna:       ProjectDNA
  created_at:        string
  updated_at:        string

  // from view spaces_with_counts
  vista_count?:      number
  last_vista_at?:    string | null
}

// ── Vista (= renders row estendido com colunas SPACES) ─────────
// Nota: usa nomes reais das colunas da tabela renders
// (input_url, output_url, prompt em vez dos aliases do briefing)
export interface Vista {
  id:               string
  user_id:          string
  space_id:         string | null

  parent_render_id: string | null   // null para Vista Mestre

  vista_type:       VistaType
  vista_label:      string | null
  generation_mode:  GenerationMode
  dna_overrides:    DnaOverrides

  status:           'pending' | 'processing' | 'completed' | 'failed'
  input_url:        string | null
  output_url:       string | null
  prompt:           string
  created_at:       string
}

// ── Sugestão contextual ────────────────────────────────────────
export type SuggestionPreset =
  | 'lighting_change'
  | 'material_change'
  | 'aerial_drone'
  | 'detail_close'
  | 'interior'
  | 'hero_diagonal'

export interface Suggestion {
  label:       string
  vista_type:  VistaType
  preset:      SuggestionPreset
  reason:      string
  parent_id?:  string
}
