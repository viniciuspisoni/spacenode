// POST /api/integrations/pair/start  (sem auth — é o INÍCIO do pareamento)
//
// Body:    { platform: 'archicad' | 'revit' | 'sketchup', deviceName? }
// Retorna: { deviceId, deviceSecret, userCode, verificationUrl,
//            expiresIn, pollInterval }
// Lógica em lib/integrations/pairing.ts.

import type { NextRequest } from 'next/server'
import { handlePairStart } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairStart(req, 'integrations')
}
