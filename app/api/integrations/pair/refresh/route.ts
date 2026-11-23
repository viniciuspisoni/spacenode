// POST /api/integrations/pair/refresh  (auth = device_secret)
// Body: { deviceId, deviceSecret } → { accessToken, expiresAt } | 401 (revogado)

import type { NextRequest } from 'next/server'
import { handlePairRefresh } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairRefresh(req, 'integrations')
}
