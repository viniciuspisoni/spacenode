// POST /api/sketchup/pair/refresh  (auth = device_secret)
// Plugin SketchUp em campo. Lógica em lib/integrations/pairing.ts.

import type { NextRequest } from 'next/server'
import { handlePairRefresh } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairRefresh(req, 'sketchup')
}
