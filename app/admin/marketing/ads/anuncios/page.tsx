import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listAds, listCampaigns, listPendingActions } from '@/lib/marketing/ads/service'
import type { AdPendingAction } from '@/lib/marketing/ads/types'
import { AdsLibraryClient } from '../_components/AdsLibraryClient'

// Biblioteca de anúncios: cada anúncio é uma célula da matriz de experimentação
// (persona × dor × promessa × formato × criativo × copy). Copy editável só em
// rascunho/revisão; ativação de gasto passa SEMPRE pela fila de aprovação —
// as ações de nível 'ad' são carregadas aqui para o fluxo solicitar → aprovar
// → executar acontecer sem colar id manualmente.

export const dynamic = 'force-dynamic'

export default async function AdsLibraryPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const [ads, campaigns, pendingAll, approvedAll] = await Promise.all([
    listAds(ctx.admin),
    listCampaigns(ctx.admin),
    listPendingActions(ctx.admin, { status: 'pending' }),
    listPendingActions(ctx.admin, { status: 'approved' }),
  ])

  const ofAds = (list: AdPendingAction[]) => list.filter(a => a.entity_level === 'ad')

  return (
    <AdsLibraryClient
      ads={ads}
      campaigns={campaigns}
      pendingActions={ofAds(pendingAll)}
      approvedActions={ofAds(approvedAll)}
    />
  )
}
