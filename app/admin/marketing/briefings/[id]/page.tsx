import { notFound } from 'next/navigation'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { getBriefDetail } from '@/lib/marketing/service'
import { BriefEditorClient } from '../../_components/BriefEditorClient'

// Editor de briefing + área de aprovação: conteúdo, legenda, roteiro, direção
// visual, assets vinculados, histórico de versões, decisões de revisão.

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export default async function BriefingDetailPage({ params }: Props) {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  const { id } = await params
  let detail
  try {
    detail = await getBriefDetail(ctx.admin, id)
  } catch {
    notFound()
  }

  return <BriefEditorClient initialDetail={detail} />
}
