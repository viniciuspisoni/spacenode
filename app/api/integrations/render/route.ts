// GET /api/integrations/render?id={renderId} (Bearer do dispositivo)
// → { id, status, inputUrl, outputUrl, previewUrl, nodesCharged, … }

import type { NextRequest } from 'next/server'
import { handleRender } from '@/lib/integrations/account'

export function GET(req: NextRequest) {
  return handleRender(req)
}
