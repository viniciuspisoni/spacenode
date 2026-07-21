import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listPendingActions } from '@/lib/marketing/ads/service'
import { ActionsQueueClient } from '../_components/ActionsQueueClient'

// Fila de aprovação de mídia paga: nada muda campanha/gasto sem decisão humana
// registrada aqui. O sistema recomenda (requested_by null); quem aprova assume.

export const dynamic = 'force-dynamic'

export default async function ActionsQueuePage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const actions = await listPendingActions(ctx.admin)

  return <ActionsQueueClient actions={actions} />
}
