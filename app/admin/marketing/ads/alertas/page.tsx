import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listAlerts } from '@/lib/marketing/ads/service'
import { AlertsClient } from '../_components/AlertsClient'

// Alertas do motor de regras: gasto sem conversão, CPC/CTR fora da faixa, LP
// fraca, falha de rastreamento… O alerta recomenda; a ação vira item da fila
// de aprovação — nada é executado a partir daqui.

export const dynamic = 'force-dynamic'

export default async function AlertsPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const alerts = await listAlerts(ctx.admin)

  return <AlertsClient alerts={alerts} />
}
