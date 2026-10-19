import type { SupabaseClient } from '@supabase/supabase-js'
import { assertSafeImageUrl } from '@/lib/edit-v3/ssrf'
import { isUuid, recoveryReason, type RenderRecovery } from './render-recovery'

export async function loadOwnRenderRecovery(client: Pick<SupabaseClient, 'from'>, userId: string, renderId: unknown, reason: unknown): Promise<RenderRecovery | null> {
  const parsedReason = recoveryReason(reason)
  if (!isUuid(renderId) || !parsedReason) return null
  const { data, error } = await client.from('renders')
    .select('id,user_id,status,input_url,output_url,ambient,is_internal_test')
    .eq('id', renderId).eq('user_id', userId).eq('status', 'completed').maybeSingle()
  if (error) throw error
  if (!data || data.user_id !== userId || data.status !== 'completed' || data.is_internal_test ||
      data.ambient === 'video' || data.ambient === 'upscale' || typeof data.output_url !== 'string') return null
  const safe = (value: unknown): value is string => {
    if (typeof value !== 'string' || !value.startsWith('https://')) return false
    try { assertSafeImageUrl(value); return true } catch { return false }
  }
  if (!safe(data.output_url)) return null
  return { renderId, reason: parsedReason, outputUrl: data.output_url, inputUrl: safe(data.input_url) ? data.input_url : null }
}
