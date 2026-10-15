import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export const REFERRAL_COOKIE = 'spn_ref'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function referralId(value: string | null | undefined): string | null {
  return value && UUID.test(value) ? value.toLowerCase() : null
}

export function referralReward(plan: string, overrideNodes?: number | null): number {
  if (
    overrideNodes != null && Number.isInteger(overrideNodes) && overrideNodes > 0 &&
    ['starter', 'essence', 'pro', 'studio', 'office'].includes(plan)
  ) return overrideNodes
  return { essence: 200, pro: 400, studio: 800 }[plan as 'essence' | 'pro' | 'studio'] ?? 0
}

/** Google cria a conta durante o login, sem metadata de signup. Só associa
 * uma conta criada agora; logins posteriores nunca podem trocar o vínculo. */
export async function claimNewReferral(user: User | null, cookieValue: string | null | undefined) {
  const referrer = referralId(cookieValue)
  if (!user || !referrer || referrer === user.id) return
  const age = Date.now() - new Date(user.created_at).getTime()
  if (age < 0 || age > 5 * 60_000) return

  const { error } = await createAdminClient().from('referrals').insert({
    referred_user_id: user.id,
    referrer_user_id: referrer,
    code: referrer,
  })
  // Cadastro por e-mail pode ter sido vinculado pelo trigger; não sobrescreve.
  if (error && error.code !== '23505') {
    console.error('[referrals] falha ao vincular indicação:', error)
  }
}
