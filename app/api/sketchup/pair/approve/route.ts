// POST /api/sketchup/pair/approve  (cookie — usuário logado no navegador)
// Página /sketchup/pair. Lógica em lib/integrations/pairing.ts.

import type { NextRequest } from 'next/server'
import { handlePairApprove } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairApprove(req, 'sketchup')
}
