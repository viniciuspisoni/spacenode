// POST /api/integrations/pair/approve  (cookie — usuário logado no navegador)
// Página /integrations/pair. Body: { code, platform? } → { ok, deviceName, platform }

import type { NextRequest } from 'next/server'
import { handlePairApprove } from '@/lib/integrations/pairing'

export function POST(req: NextRequest) {
  return handlePairApprove(req, 'integrations')
}
