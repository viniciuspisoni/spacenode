// POST /api/sketchup/pair/start  (sem auth — é o INÍCIO do pareamento)
// Plugin SketchUp em campo. Lógica em lib/integrations/pairing.ts.

import type { NextRequest } from 'next/server'
import { handlePairStart } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairStart(req, 'sketchup')
}
