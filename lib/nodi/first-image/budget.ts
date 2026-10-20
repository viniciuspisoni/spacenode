import type { SupabaseClient } from '@supabase/supabase-js'

/** Pilot limits fail closed: an unavailable counter cannot authorize model spend. */
export async function checkPilotBudget(admin: SupabaseClient, userId: string): Promise<'allowed' | 'limited' | 'unavailable'> {
  try {
    for (const [window, seconds, max] of [['minute', 60, 3], ['day', 86400, 20], ['month', 2592000, 200]] as const) {
      const { data, error } = await admin.rpc('bump_rate_limit', { key_input: `nodi-first-image:${window}:${userId}`, window_seconds: seconds })
      if (error || !Number.isSafeInteger(data) || data < 1) return 'unavailable'
      if (data > max) return 'limited'
    }
    return 'allowed'
  } catch { return 'unavailable' }
}
