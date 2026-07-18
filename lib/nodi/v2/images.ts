// ── Resolução de imagens de geração (server-only) ────────────────────────────
//
// Único caminho pelo qual a V2 chega a uma imagem: kind+id (validados) →
// linha DO PRÓPRIO usuário (client com RLS + eq user_id) → colunas de URL
// conhecidas. O modelo nunca fornece URL; o download em si acontece dentro de
// lib/gemini (fetchStorageBytes), que já aplica allowlist anti-SSRF
// (assertSafeFetchUrl: só Supabase storage / fal.media / data:image).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GenerationKind } from '../types'

interface ImageSource {
  table: string
  inputCol: string | null
  outputCol: string | null
  label: string
}

const SOURCES: Record<GenerationKind, ImageSource> = {
  render:  { table: 'renders',      inputCol: 'input_url',        outputCol: 'output_url',       label: 'Renderizar' },
  upscale: { table: 'renders',      inputCol: 'input_url',        outputCol: 'output_url',       label: 'Ampliar' },
  // vídeo: output é MP4 — análise V2 usa só a imagem de ENTRADA (limitação documentada)
  video:   { table: 'renders',      inputCol: 'input_url',        outputCol: null,               label: 'Animar' },
  vista:   { table: 'vistas',       inputCol: 'source_image_url', outputCol: 'image_url',        label: 'Spaces' },
  edit:    { table: 'edit_v3_jobs', inputCol: 'source_image_url', outputCol: 'result_image_url', label: 'Editar' },
}

export interface GenerationImages {
  label: string
  status: string | null
  engine: string | null
  inputUrl: string | null
  outputUrl: string | null
}

async function selectImages(
  supabase: SupabaseClient,
  userId: string,
  src: ImageSource,
  id: string,
): Promise<GenerationImages | null> {
  const cols = ['id', 'status', src.inputCol, src.outputCol, src.table === 'edit_v3_jobs' ? 'model' : 'engine']
    .filter(Boolean)
    .join(', ')
  const { data, error } = await supabase
    .from(src.table)
    .select(cols)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    label: src.label,
    status: str(row.status),
    engine: str(row.engine) ?? str(row.model),
    inputUrl: src.inputCol ? str(row[src.inputCol]) : null,
    outputUrl: src.outputCol ? str(row[src.outputCol]) : null,
  }
}

/** Imagens de uma geração do usuário. `edit` cobre edit_v3_jobs e edits. */
export async function resolveGenerationImages(
  supabase: SupabaseClient,
  userId: string,
  kind: GenerationKind,
  id: string,
): Promise<GenerationImages | null> {
  const first = await selectImages(supabase, userId, SOURCES[kind], id)
  if (first) return first
  if (kind === 'edit') {
    // fluxo antigo (tabela `edits`) usa outras colunas
    return selectImages(
      supabase, userId,
      { table: 'edits', inputCol: 'source_image_url', outputCol: 'result_image_url', label: 'Editar' },
      id,
    )
  }
  return null
}
