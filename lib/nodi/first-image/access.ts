import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalStaff } from '@/lib/auth/privileged'
import { isNodiEnabled } from '../flags'
import { isNodiV2Enabled, isNodiMultimodalEnabled } from '../v2/flags'

export async function canUseFirstImagePilot(admin: SupabaseClient, user: { id: string; email?: string | null }): Promise<boolean> {
  if (process.env.NODI_FIRST_IMAGE_PILOT_ENABLED !== '1' || !isNodiEnabled() || !isNodiV2Enabled() || !isNodiMultimodalEnabled()) return false
  // Initial pilot is internal. No browser claim or editable user_metadata grants access.
  return isInternalStaff(admin, user)
}
