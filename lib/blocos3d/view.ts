// lib/blocos3d/view.ts
//
// Emissão do job pra UI (SERVER-ONLY): converte a linha do banco em
// Blocos3DJobView com URLs prontas pra consumo.
//
// - Keys do bucket `spacenode-media` (privado DESDE A CRIAÇÃO) são SEMPRE
//   assinadas com signStorageKey — sem gate de STORAGE_PRIVATE.
// - input_image_url (space-mestres) segue o padrão do resto do app:
//   signStorageUrl, gated pelo flip.
// - Sem key re-hospedada, cai na URL do provider (expira em dias — só rede
//   de segurança).

import type { SupabaseClient } from '@supabase/supabase-js'
import { signStorageKey, signStorageUrl } from '@/lib/storage/signed'
import type { Blocos3DJobView, Blocos3DJobStatus, Blocos3DQuality, ModelFormat } from './types'

/** Linha crua de blocos3d_jobs (campos que a emissão consome). */
export interface Blocos3DJobRow {
  id:                  string
  status:              string
  progress:            number | null
  quality:             string
  input_image_url:     string | null
  model_glb_key:       string | null
  model_fbx_key:       string | null
  model_obj_key:       string | null
  model_usdz_key:      string | null
  thumbnail_key:       string | null
  provider_model_urls: Record<string, unknown> | null
  nodes_cost:          number | null
  error_message:       string | null
  created_at:          string
  completed_at:        string | null
}

export const BLOCOS3D_JOB_COLUMNS =
  'id, status, progress, quality, input_image_url, model_glb_key, model_fbx_key, model_obj_key, model_usdz_key, thumbnail_key, provider_model_urls, nodes_cost, error_message, created_at, completed_at'

const MODEL_KEY_FIELDS: Record<ModelFormat, keyof Blocos3DJobRow> = {
  glb:  'model_glb_key',
  fbx:  'model_fbx_key',
  obj:  'model_obj_key',
  usdz: 'model_usdz_key',
}

const BUCKET = 'spacenode-media'
const SIGNED_TTL_SECONDS = 60 * 60 // 1h — o poll/list reassina a cada emissão

function providerUrl(row: Blocos3DJobRow, field: string): string | null {
  const v = row.provider_model_urls?.[field]
  return typeof v === 'string' ? v : null
}

export async function toJobView(
  admin: SupabaseClient,
  row: Blocos3DJobRow,
  opts: {
    /** false = não assina/emite as URLs de modelo — pra listagens (o strip do
     *  histórico só usa thumbnail/input; assinar 4 modelos × N linhas a cada
     *  load seria dezenas de idas ao Storage por URLs que expiram sem uso).
     *  O detalhe completo vem do GET /api/blocos3d/[jobId] na seleção. */
    includeModelUrls?: boolean
  } = {},
): Promise<Blocos3DJobView> {
  const includeModels = opts.includeModelUrls !== false
  const formats = includeModels ? (Object.keys(MODEL_KEY_FIELDS) as ModelFormat[]) : []

  const [inputUrl, thumbFromKey, ...modelSigned] = await Promise.all([
    signStorageUrl(admin, row.input_image_url),
    row.thumbnail_key ? signStorageKey(admin, BUCKET, row.thumbnail_key, SIGNED_TTL_SECONDS) : Promise.resolve(null),
    ...formats.map(f => {
      const key = row[MODEL_KEY_FIELDS[f]] as string | null
      return key ? signStorageKey(admin, BUCKET, key, SIGNED_TTL_SECONDS) : Promise.resolve(null)
    }),
  ])

  const modelUrls: Partial<Record<ModelFormat, string>> = {}
  formats.forEach((f, i) => {
    const url = modelSigned[i] ?? providerUrl(row, f)
    if (url) modelUrls[f] = url
  })

  const status: Blocos3DJobStatus =
    row.status === 'completed' || row.status === 'failed' ? row.status : 'processing'

  return {
    id:           row.id,
    status,
    progress:     status === 'completed' ? 100 : (row.progress ?? 0),
    quality:      (row.quality as Blocos3DQuality) ?? 'standard',
    inputUrl,
    thumbnailUrl: thumbFromKey ?? providerUrl(row, 'thumbnail'),
    modelUrls,
    nodesCost:    row.nodes_cost ?? 0,
    errorMessage: row.error_message,
    createdAt:    row.created_at,
    completedAt:  row.completed_at,
  }
}
