// GET  /api/sketchup/devices   — lista os dispositivos do usuário (cookie)
// POST /api/sketchup/devices   — { action: 'revoke', deviceId } (cookie)
// Lógica em lib/integrations/pairing.ts.

import type { NextRequest } from 'next/server'
import { handleDevicesList, handleDevicesRevoke } from '@/lib/integrations/pairing'

export function GET() {
  return handleDevicesList('sketchup')
}

export function POST(req: NextRequest) {
  return handleDevicesRevoke(req)
}
