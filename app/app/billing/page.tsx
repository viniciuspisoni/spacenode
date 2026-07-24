import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { BillingClient, type LumenPackRow } from './BillingClient'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Plano/saldo/packs são da bolsa (dono do workspace) — é dela que as
  // gerações de toda a equipe debitam.
  const admin   = createAdminClient()
  const balance = await getPayerBalance(admin, user.id)

  const { data: lumenRows } = await admin
    .from('lumen_packs')
    .select('id, pack_size, nodes_initial, nodes_remaining, purchased_at, expires_at, status')
    .eq('user_id', balance.payerId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })

  // Elegibilidade à oferta de lançamento (só para anunciar — quem decide de
  // fato é o checkout, consultando o Stripe). Num usuário free, ter
  // `stripe_customer_id` significa que já assinou e cancelou: Lumens, a outra
  // via de compra, exigem Pro ou superior. Membro de workspace fica de fora
  // porque quem paga é o dono da bolsa.
  const { data: own } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()
  const offerEligible = !balance.pooled && balance.planId === 'free' && !own?.stripe_customer_id

  return (
    <BillingClient
      plan={balance.planId}
      balance={{
        plan:  balance.planBalance,
        lumen: balance.lumenBalance,
        total: balance.totalBalance,
      }}
      lumens={(lumenRows ?? []) as LumenPackRow[]}
      pooled={balance.pooled}
      offerEligible={offerEligible}
    />
  )
}
