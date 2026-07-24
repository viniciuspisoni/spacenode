import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createAd, listAds } from '@/lib/marketing/ads/service'
import { isAdStatus } from '@/lib/marketing/ads/workflow'

// Anúncios (células da matriz de experimentação). Criação gera identificador,
// UTMs e URL de destino automaticamente — sempre nasce em rascunho.

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const ads = await listAds(gate.ctx.admin, {
      campaignId: sp.get('campaign_id') ?? undefined,
      status: isAdStatus(status) ? status : undefined,
    })
    return NextResponse.json({ ads })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const ad = await createAd(gate.ctx.admin, {
      campaign_id: String(body.campaign_id ?? ''),
      ad_set_id: body.ad_set_id ?? null,
      brief_id: body.brief_id ?? null,
      persona: body.persona ?? null,
      pain: body.pain ?? null,
      promise: body.promise ?? null,
      format: body.format ?? null,
      creative_label: body.creative_label ?? null,
      copy_variant: body.copy_variant ?? null,
      primary_text: body.primary_text ?? null,
      headline: body.headline ?? null,
      description: body.description ?? null,
      cta_button: body.cta_button ?? null,
      landing_page_id: body.landing_page_id ?? null,
      destination_path: body.destination_path ?? null,
    }, gate.ctx.user.id)
    return NextResponse.json({ ad }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
