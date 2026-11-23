// GET /api/sketchup/render?id={renderId} — lógica em lib/integrations/account.ts.

import type { NextRequest } from 'next/server'
import { handleRender } from '@/lib/integrations/account'

export function GET(req: NextRequest) {
  return handleRender(req)
}
