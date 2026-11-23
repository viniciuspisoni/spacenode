// POST /api/sketchup/pair/claim  (auth = device_secret)
// Plugin SketchUp em campo. Lógica em lib/integrations/pairing.ts.

import type { NextRequest } from 'next/server'
import { handlePairClaim } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairClaim(req, 'sketchup')
}
