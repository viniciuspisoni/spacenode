// GET  /api/integrations/devices — dispositivos do usuário, com a plataforma (cookie)
// POST /api/integrations/devices — { action: 'revoke', deviceId } (cookie)

import type { NextRequest } from 'next/server'
import { handleDevicesList, handleDevicesRevoke } from '@/lib/integrations/pairing'

export function GET() {
  return handleDevicesList('integrations')
}

export function POST(req: NextRequest) {
  return handleDevicesRevoke(req)
}
