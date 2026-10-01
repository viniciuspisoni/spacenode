import type { SupabaseClient } from '@supabase/supabase-js'
import { signStorageUrls } from '@/lib/storage/signed'

export interface UpscaleJob {
  id: string
  status: string
  input_url: string
  output_url: string | null
  nodes_charged: number | null
  error_message: string | null
  upscale_meta: Record<string, unknown> | null
}

export async function upscaleJobResponse(admin: SupabaseClient, row: UpscaleJob) {
  const meta = row.upscale_meta ?? {}
  const dimensions = meta.output_dimensions as { width?: number; height?: number } | undefined
  const [url, inputUrl, previewUrl, beforePreviewUrl] = await signStorageUrls(admin, [row.output_url,
    row.input_url, typeof meta.preview_url === 'string' ? meta.preview_url : null,
    typeof meta.before_preview_url === 'string' ? meta.before_preview_url : null])
  return { jobId: row.id, status: row.status, url, inputUrl, previewUrl, beforePreviewUrl,
    outputWidth: dimensions?.width ?? null, outputHeight: dimensions?.height ?? null,
    outputBytes: meta.output_bytes ?? null, outputFormat: meta.output_format ?? null,
    achievedFactor: meta.achieved_factor ?? null, effectiveFactor: meta.achieved_factor ?? null,
    nodesCharged: row.nodes_charged ?? 0, sourceKind: meta.source_kind ?? null,
    inputDimensions: meta.input_dimensions ?? null, tab: meta.tab, modeId: meta.mode_id,
    refunded: meta.refunded === true, error: row.error_message, fallbackUsed: false }
}
