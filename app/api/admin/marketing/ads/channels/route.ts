import { NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { listChannels } from '@/lib/marketing/ads/service'

// Canais de mídia (Meta, Google, …) — leitura para o painel de tráfego.

export async function GET() {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const channels = await listChannels(gate.ctx.admin)
    return NextResponse.json({ channels })
  } catch (err) {
    return errorResponse(err)
  }
}
