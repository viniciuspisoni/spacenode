import { notFound } from 'next/navigation'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import CostsDashboardClient from './CostsDashboardClient'

export const metadata = { title: 'Custos · SpaceNode', robots: { index: false, follow: false } }
export default async function CostsPage() {
  if (!await getMarketingStaffContext()) notFound()
  return <CostsDashboardClient />
}
