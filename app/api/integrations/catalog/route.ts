// GET /api/integrations/catalog?platform=archicad (Bearer do dispositivo)
//
// Mesmo formato de /api/sketchup/catalog. `platform` é opcional e só decide o
// `pluginLatest` (hoje exclusivo do SketchUp); sem ele, nenhum aviso de versão.

import type { NextRequest } from 'next/server'
import { handleCatalog } from '@/lib/integrations/catalog'
import { parsePlatform } from '@/lib/integrations/platforms'

export function GET(req: NextRequest) {
  return handleCatalog(req, parsePlatform(req.nextUrl.searchParams.get('platform')))
}
