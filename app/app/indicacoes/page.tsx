// /app/indicacoes — área de indicações.
//
// Server component: resolve o código individual (criado sob demanda), os
// contadores e o histórico de recompensas com o admin client — as tabelas do
// programa têm RLS ligada e nenhuma policy, então este é o único caminho.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { getReferralOverview } from '@/lib/referral/service'
import { summarizeRewards } from '@/lib/referral/rewards'
import { isReferralProgramOpen, referralProgramStartLabel } from '@/lib/referral/config'
import { referralLink } from '@/lib/referral/codes'
import { IndicacoesClient } from './IndicacoesClient'

export const dynamic = 'force-dynamic'

export default async function IndicacoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [overview, balance] = await Promise.all([
    getReferralOverview(admin, user.id),
    getPayerBalance(admin, user.id),
  ])

  const summary = summarizeRewards(overview.rewards)

  // Mesma origem usada pelo checkout — o link precisa ser o domínio público,
  // não o host interno de onde o render aconteceu.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://spacenode.app'

  return (
    <IndicacoesClient
      code={overview.code}
      link={overview.code ? referralLink(overview.code, origin) : null}
      programOpen={isReferralProgramOpen()}
      startLabel={referralProgramStartLabel()}
      invitesSent={overview.invitesSent}
      signups={overview.signups}
      confirmed={overview.confirmed}
      summary={summary}
      rewards={overview.rewards}
      pooled={balance.pooled}
    />
  )
}
