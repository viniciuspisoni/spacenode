// POST /api/sketchup/pair/refresh  (auth = device_secret)
//
// Renovação do access token do dispositivo — substitui a "renovação
// silenciosa" por dialog oculto das versões anteriores. O refresh token
// nunca sai do servidor; revogação server-side nega a renovação e o token
// em campo morre sozinho em <=1h.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { sha256Hex, refreshDeviceSession } from '@/lib/sketchup/devices'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const rl = await rateLimit(admin, `skp-pair-refresh:${clientIp(req)}`, 60, 600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : ''
  const deviceSecret = typeof body?.deviceSecret === 'string' ? body.deviceSecret : ''
  if (!UUID_RE.test(deviceId) || !deviceSecret) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  const { data: device } = await admin
    .from('sketchup_devices')
    .select('id, status, refresh_token, revoked_at')
    .eq('id', deviceId)
    .eq('secret_hash', sha256Hex(deviceSecret))
    .maybeSingle()

  if (!device || device.status !== 'active' || device.revoked_at || !device.refresh_token) {
    return NextResponse.json({ error: 'Dispositivo desconectado. Conecte novamente.' }, { status: 401 })
  }

  const refreshed = await refreshDeviceSession(device.refresh_token)
  if (!refreshed) {
    // Refresh negado upstream (sessão morta/família revogada) — encerra o device.
    await admin.from('sketchup_devices')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), refresh_token: null })
      .eq('id', device.id)
    return NextResponse.json({ error: 'Sessão expirada. Conecte novamente.' }, { status: 401 })
  }

  await admin.from('sketchup_devices')
    .update({ refresh_token: refreshed.refreshToken, last_seen_at: new Date().toISOString() })
    .eq('id', device.id)

  return NextResponse.json({
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  })
}
