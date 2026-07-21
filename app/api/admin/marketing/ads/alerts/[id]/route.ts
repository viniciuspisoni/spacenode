import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { setAlertStatus } from '@/lib/marketing/ads/service'
import { isAlertStatus } from '@/lib/marketing/ads/workflow'

type Params = { params: Promise<{ id: string }> }

// Triagem de alerta: open → acknowledged/resolved/dismissed.

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json()
    if (!isAlertStatus(body.status)) throw new Error('Status de alerta inválido')
    await setAlertStatus(gate.ctx.admin, id, body.status)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
