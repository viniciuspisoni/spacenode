// POST /api/sketchup/pair/start  (sem auth — é o INÍCIO do pareamento)
//
// O plugin pede um código de pareamento e um device_secret. O usuário
// aprova o código no NAVEGADOR DO SISTEMA (onde a sessão Google dele vive)
// em /sketchup/pair; o plugin faz polling em /pair/claim.
//
// Body:    { deviceName? }
// Retorna: { deviceId, deviceSecret, userCode, verificationUrl,
//            expiresIn, pollInterval }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import {
  generatePairCode,
  generateDeviceSecret,
  sha256Hex,
  PAIR_CODE_TTL_SECONDS,
  PAIR_POLL_INTERVAL_SECONDS,
} from '@/lib/sketchup/devices'

export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  const rl = await rateLimit(admin, `skp-pair-start:${clientIp(req)}`, 10, 600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const deviceName = (typeof body?.deviceName === 'string' ? body.deviceName : 'SketchUp')
    .trim()
    .slice(0, 60) || 'SketchUp'

  const userCode = generatePairCode()
  const deviceSecret = generateDeviceSecret()
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_SECONDS * 1000)

  const { data, error } = await admin
    .from('sketchup_devices')
    .insert({
      device_name: deviceName,
      status: 'pending',
      code_hash: sha256Hex(userCode),
      secret_hash: sha256Hex(deviceSecret),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    console.error('[sketchup/pair/start] insert falhou:', error?.message)
    return NextResponse.json({ error: 'Erro ao iniciar o pareamento.' }, { status: 500 })
  }

  const origin = req.nextUrl.origin
  return NextResponse.json({
    deviceId: data.id,
    deviceSecret,
    userCode,
    verificationUrl: `${origin}/sketchup/pair?code=${encodeURIComponent(userCode)}`,
    expiresIn: PAIR_CODE_TTL_SECONDS,
    pollInterval: PAIR_POLL_INTERVAL_SECONDS,
  })
}
