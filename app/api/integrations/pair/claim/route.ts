// POST /api/integrations/pair/claim  (auth = device_secret)
// Body: { deviceId, deviceSecret } → { status: 'pending' } | 410 |
//       { status: 'ready', accessToken, expiresAt, userEmail }

import type { NextRequest } from 'next/server'
import { handlePairClaim } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairClaim(req, 'integrations')
}
