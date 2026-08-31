import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listIdeas } from '@/lib/marketing/service'
import { isIdeaStatus } from '@/lib/marketing/workflow'
import { IdeasClient } from '../_components/IdeasClient'

// Biblioteca de ideias: registro, edição, priorização, conversão em briefing.

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ status?: string }> }

export default async function IdeiasPage({ searchParams }: Props) {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  const { status } = await searchParams
  const ideas = await listIdeas(ctx.admin, {
    status: isIdeaStatus(status ?? '') ? (status as never) : undefined,
  })

  return <IdeasClient initialIdeas={ideas} statusFilter={isIdeaStatus(status ?? '') ? status! : null} />
}
