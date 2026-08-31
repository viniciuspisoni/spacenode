import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { createLandingPage, listLandingPages } from '@/lib/marketing/ads/service'
import type { LandingSection } from '@/lib/marketing/ads/types'

// Landing pages de campanha (/lp/{slug}). Só status=published é servida ao
// público — criação sempre nasce em rascunho.

export async function GET() {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const pages = await listLandingPages(gate.ctx.admin)
    return NextResponse.json({ pages })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const page = await createLandingPage(gate.ctx.admin, {
      slug: String(body.slug ?? ''),
      name: String(body.name ?? ''),
      persona: body.persona ?? null,
      pain: body.pain ?? null,
      headline: body.headline ?? null,
      subheadline: body.subheadline ?? null,
      cta_label: body.cta_label ?? null,
      sections: Array.isArray(body.sections) ? (body.sections as LandingSection[]) : undefined,
      meta_title: body.meta_title ?? null,
      meta_description: body.meta_description ?? null,
    }, gate.ctx.user.id)
    return NextResponse.json({ page }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
