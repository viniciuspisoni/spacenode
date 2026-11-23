// GET /api/sketchup/session — lógica em lib/integrations/account.ts.

import type { NextRequest } from 'next/server'
import { handleSession } from '@/lib/integrations/account'

export function GET(req: NextRequest) {
  return handleSession(req)
}
