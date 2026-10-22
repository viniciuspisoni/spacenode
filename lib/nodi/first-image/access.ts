import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalStaff } from '@/lib/auth/privileged'
import { isNodiEnabled } from '../flags'
import { isNodiV2Enabled, isNodiMultimodalEnabled } from '../v2/flags'

export interface FirstImageAccess { enabled: boolean; internalTools: boolean }

/** Public preparation is separate from V2 chat, memory and execution access. */
export async function getFirstImageAccess(admin: SupabaseClient, user: { id: string; email?: string | null }): Promise<FirstImageAccess> {
  if (!isNodiEnabled() || !isNodiV2Enabled() || !isNodiMultimodalEnabled()) return { enabled: false, internalTools: false }
  const publicEnabled = process.env.NODI_FIRST_IMAGE_PUBLIC_ENABLED === '1'
  const internalTools = process.env.NODI_FIRST_IMAGE_PILOT_ENABLED === '1' && await isInternalStaff(admin, user)
  return { enabled: publicEnabled || internalTools, internalTools }
}

export async function canUseFirstImagePilot(admin: SupabaseClient, user: { id: string; email?: string | null }): Promise<boolean> {
  return (await getFirstImageAccess(admin, user)).enabled
}
