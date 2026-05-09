import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BillingClient, type LumenPackRow } from './BillingClient'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, balanceRes, lumensRes] = await Promise.all([
    supabase.from('profiles').select('plan, credits').eq('id', user.id).single(),
    supabase
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance, active_lumen_packs')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('lumen_packs')
      .select('id, pack_size, nodes_initial, nodes_remaining, purchased_at, expires_at, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true }),
  ])

  return (
    <BillingClient
      plan={profileRes.data?.plan ?? 'free'}
      balance={{
        plan:  balanceRes.data?.plan_balance  ?? profileRes.data?.credits ?? 0,
        lumen: balanceRes.data?.lumen_balance ?? 0,
        total: balanceRes.data?.total_balance ?? profileRes.data?.credits ?? 0,
      }}
      lumens={(lumensRes.data ?? []) as LumenPackRow[]}
    />
  )
}
