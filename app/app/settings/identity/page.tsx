// /app/settings/identity — Identidade do escritório.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { IdentityEditor } from '@/components/spaces/IdentityEditor'
import type { PlanId } from '@/lib/plans'
import { getPlanDisplayName } from '@/lib/plan-display'
import { signStorageUrl } from '@/lib/storage/signed'
import type { ArchitectIdentity } from '@/lib/spaces/types'

export default async function IdentityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [identityRes, profRes] = await Promise.all([
    supabase.from('architect_identity').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('plan').eq('id', user.id).single(),
  ])

  const rawIdentity = (identityRes.data ?? null) as ArchitectIdentity | null
  // Assina logo_url server-side antes de passar pro client (bucket privado após o flip).
  const identity: ArchitectIdentity | null = rawIdentity
    ? { ...rawIdentity, logo_url: await signStorageUrl(createAdminClient(), rawIdentity.logo_url) }
    : null
  const planId   = (profRes.data?.plan as PlanId | undefined) ?? 'free'
  // White-label disponível em Pro/Studio/Office; Starter e free não têm.
  const whiteLabelAllowed =
    planId === 'pro' || planId === 'studio' || planId === 'office'

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <IdentityEditor
        initialIdentity={identity}
        planId={planId}
        planName={getPlanDisplayName(planId)}
        whiteLabelAllowed={whiteLabelAllowed}
      />
    </main>
  )
}
