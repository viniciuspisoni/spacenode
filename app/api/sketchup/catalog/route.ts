// GET /api/sketchup/catalog — lógica em lib/integrations/catalog.ts.

import type { NextRequest } from 'next/server'
import { handleCatalog } from '@/lib/integrations/catalog'

export function GET(req: NextRequest) {
  return handleCatalog(req, 'sketchup')
}
