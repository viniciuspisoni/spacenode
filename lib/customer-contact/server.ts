import { createClient } from '@/lib/supabase/server'
import type { ContactPreferences } from './validation'

// Enable after the migration and authenticated signup checks have passed.
export function contactCaptureEnabled(): boolean {
  return process.env.WHATSAPP_SIGNUP_ENABLED === 'true'
}

export async function readOwnContact(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase.from('customer_contacts')
    .select('whatsapp_e164,support_opt_in,marketing_opt_in,signup_exempt')
    .eq('user_id', userId).maybeSingle()
  return { contact: data as ContactPreferences | null, unavailable: !!error }
}
