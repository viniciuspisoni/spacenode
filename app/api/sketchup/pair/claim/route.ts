// POST /api/sketchup/pair/claim  (auth = device_secret)
//
// Polling do plugin depois do /pair/start. Enquanto o usuário não aprova:
// { status: 'pending' }. Aprovado: renova a sessão em custódia AGORA (o
// refresh rotaciona e o token novo fica guardado) e devolve só o access
// token — o device vira 'active' e o código é descartado.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { sha256Hex, refreshDeviceSession } from '@/lib/sketchup/devices'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const rl = await rateLimit(admin, `skp-pair-claim:${clientIp(req)}`, 120, 600)
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
    .select('id, status, expires_at, refresh_token, user_id')
    .eq('id', deviceId)
    .eq('secret_hash', sha256Hex(deviceSecret))
    .maybeSingle()

  if (!device) return NextResponse.json({ error: 'Dispositivo não encontrado.' }, { status: 404 })

  if (device.status === 'pending') {
    if (new Date(device.expires_at).getTime() < Date.now()) {
      await admin.from('sketchup_devices').delete().eq('id', device.id).eq('status', 'pending')
      return NextResponse.json({ status: 'expired' }, { status: 410 })
    }
    return NextResponse.json({ status: 'pending' })
  }

  if (device.status !== 'approved' || !device.refresh_token) {
    return NextResponse.json({ error: 'Pareamento inválido. Conecte novamente.' }, { status: 409 })
  }

  const refreshed = await refreshDeviceSession(device.refresh_token)
  if (!refreshed) {
    await admin.from('sketchup_devices')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), refresh_token: null })
      .eq('id', device.id)
    return NextResponse.json({ error: 'Sessão do dispositivo inválida. Conecte novamente.' }, { status: 409 })
  }

  const { data: email } = await admin
    .from('profiles')
    .select('email')
    .eq('id', device.user_id)
    .maybeSingle()

  await admin.from('sketchup_devices')
    .update({
      status: 'active',
      code_hash: null,
      refresh_token: refreshed.refreshToken,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', device.id)

  return NextResponse.json({
    status: 'ready',
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    userEmail: email?.email ?? null,
  })
}
