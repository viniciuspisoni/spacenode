// GET /api/integrations/session (Bearer do dispositivo)
// → { user: { id, email }, balance, theme }

import type { NextRequest } from 'next/server'
import { handleSession } from '@/lib/integrations/account'

export function GET(req: NextRequest) {
  return handleSession(req)
}
