// POST /api/edits/preview
//
// Calcula a rota + custo de uma edição SEM consumir nodes e SEM gravar nada.
// A UI chama (debounced) sempre que tool / máscara / prompt / premium mudam,
// pra renderizar o rótulo do botão e a explicação da cobrança ANTES de gerar.
//
// A decisão é autoritativa no servidor (free-fix usados, plano, uso mensal),
// então o cliente não consegue forjar "grátis".

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isQuality, isEditSourceType, type Quality, type EditSourceType } from '@/lib/spaces/types'
import { isEditMode, type EditMode } from '@/lib/spaces/engines'
import { isFidelityMode, type FidelityMode } from '@/lib/spaces/edit-prompts'
import { routeEdit, editButtonLabel, editChargeExplanation } from '@/lib/spaces/edit-router'
import { buildRoutingContext, parseReferences, type EditRequestParams } from '@/lib/spaces/edit-route-helpers'

export const runtime = 'nodejs'

interface PreviewBody {
  has_mask?:         unknown
  mask_coverage?:    unknown
  prompt?:           unknown
  quality?:          unknown
  source_type?:      unknown
  source_id?:        unknown
  mode?:             unknown
  fidelity_mode?:    unknown
  premium?:          unknown
  image_megapixels?: unknown
  references?:       unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as PreviewBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Preview é tolerante: aplica defaults seguros pra campos ainda não preenchidos.
  const mode: EditMode         = isEditMode(body.mode) ? body.mode : 'material'
  const fidelity: FidelityMode = isFidelityMode(body.fidelity_mode) ? body.fidelity_mode : 'max'
  const quality: Quality       = isQuality(body.quality) ? body.quality : 'hd'
  const sourceType: EditSourceType = isEditSourceType(body.source_type) ? body.source_type : 'upload'

  const params: EditRequestParams = {
    mode,
    prompt:          typeof body.prompt === 'string' ? body.prompt.trim() : '',
    hasMask:         body.has_mask === true,
    maskCoverage:    typeof body.mask_coverage === 'number' ? Math.max(0, Math.min(1, body.mask_coverage)) : null,
    quality,
    fidelity,
    premium:         body.premium === true,
    imageMegapixels: typeof body.image_megapixels === 'number' ? body.image_megapixels : null,
    sourceType,
    sourceId:        typeof body.source_id === 'string' ? body.source_id : null,
    references:      parseReferences(body.references),
  }

  const ctx     = await buildRoutingContext(createAdminClient(), user.id, params)
  const routing = routeEdit(ctx.input)

  return NextResponse.json({
    cost_nodes:      routing.costNodes,
    is_free_fix:     routing.isFreeFix,
    should_use_crop: routing.shouldUseCrop,
    label:           editButtonLabel(routing),
    explanation:     editChargeExplanation(routing),
  })
}
