// /app/settings/identity — Identidade do escritório.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IdentityEditor } from '@/components/spaces/IdentityEditor'
import { getPlanById, type PlanId } from '@/lib/plans'
import type { ArchitectIdentity } from '@/lib/spaces/types'

export default async function IdentityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [identityRes, profRes] = await Promise.all([
    supabase.from('architect_identity').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('plan').eq('id', user.id).single(),
  ])

  const identity = (identityRes.data ?? null) as ArchitectIdentity | null
  const planId   = (profRes.data?.plan as PlanId | undefined) ?? 'free'
  const plan     = getPlanById(planId)
  // White-label disponível em Pro/Studio/Office; Starter e free não têm.
  const whiteLabelAllowed =
    planId === 'pro' || planId === 'studio' || planId === 'office'

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <IdentityEditor
        initialIdentity={identity}
        planId={planId}
        planName={plan?.name ?? 'Beta'}
        whiteLabelAllowed={whiteLabelAllowed}
      />
    </main>
  )
}
