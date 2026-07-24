import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listReports } from '@/lib/marketing/ads/service'
import { ReportsClient } from '../_components/ReportsClient'

// Relatórios periódicos de mídia paga: investimento, funil, vencedores e
// perdedores, hipóteses e próximos testes. Métricas com amostra insuficiente
// vêm marcadas do gerador — o relatório nunca finge confiança.

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const reports = await listReports(ctx.admin)

  return <ReportsClient reports={reports} />
}
