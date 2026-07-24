import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listLandingPages } from '@/lib/marketing/ads/service'
import { LandingPagesClient } from '../_components/LandingPagesClient'

// Landing pages de campanha servidas em /lp/[slug]. Só status=published fica
// acessível ao público; noindex por padrão — quem indexa é a landing principal.

export const dynamic = 'force-dynamic'

export default async function LandingPagesPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null // layout já bloqueou; aqui só satisfaz o type-narrowing

  const landingPages = await listLandingPages(ctx.admin)

  return <LandingPagesClient landingPages={landingPages} />
}
