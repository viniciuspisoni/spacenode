import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listCampaigns, listExperiments } from '@/lib/marketing/ads/service'
import { ExperimentsClient } from '../_components/ExperimentsClient'

// Matriz de experimentação: hipótese → teste → conclusão → próxima ação.
// Concluir como validada/refutada exige conclusão escrita; amostra
// insuficiente encerra como inconclusivo — nunca vira decisão.

export const dynamic = 'force-dynamic'

export default async function ExperimentsPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const [experiments, campaigns] = await Promise.all([
    listExperiments(ctx.admin),
    listCampaigns(ctx.admin),
  ])

  return <ExperimentsClient experiments={experiments} campaigns={campaigns} />
}
