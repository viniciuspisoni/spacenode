// Aprovação do pareamento dos plugins (Archicad, Revit, SketchUp) — o
// /api/integrations/pair/start devolve esta URL com ?app=<plataforma>.
//
// `app` só escolhe o rótulo da página; o approve recusa um código de outra
// plataforma, então a página nunca autoriza algo diferente do que anuncia.

import { PairApproval } from '@/components/integrations/PairApproval'
import { PLATFORM_LABELS, parsePlatform } from '@/lib/integrations/platforms'

export default async function IntegrationPairPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { app } = await searchParams
  const platform = parsePlatform(app)
  return (
    <PairApproval
      appLabel={platform ? PLATFORM_LABELS[platform] : null}
      platform={platform}
      approveEndpoint="/api/integrations/pair/approve"
      loginNext={platform ? `/integrations/pair?app=${platform}` : '/integrations/pair'}
    />
  )
}
