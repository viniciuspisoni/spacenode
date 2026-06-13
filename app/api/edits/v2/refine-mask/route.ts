// POST /api/edits/v2/refine-mask — refinamento edge-aware da máscara de
// superfície (Editar v2). Recebe a máscara detectada pelo /api/edits/segment
// e devolve a versão com borda aderida aos contornos visuais da imagem
// (guided filter + morfologia simétrica — lib/edit-v2/mask-refine.ts).
//
// 100% local (sharp/CPU): NENHUMA chamada paga. Best-effort por contrato: o
// cliente usa a máscara original se isto falhar. Rota do v2 — /segment e o
// Editar v1 seguem intocados.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchImageBuffer, maskWhiteRatio } from '@/lib/spaces/edit-crop'
import { uploadEditAsset } from '@/lib/spaces/edit-route-helpers'
import { editV2Enabled } from '@/lib/edit-v2/flags'
import { assertSafeImageUrl, EditV2InputError } from '@/lib/edit-v2/pipeline'
import { refineSurfaceMaskV2 } from '@/lib/edit-v2/mask-refine'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  image_url?: unknown
  mask_url?: unknown
}

export async function POST(req: Request) {
  if (!editV2Enabled()) {
    return NextResponse.json({ error: 'Não disponível.' }, { status: 404 })
  }

  let userId: string | null = null
  const testBypassAllowed = process.env.NODE_ENV !== 'production' && !process.env.VERCEL
  const testUser = testBypassAllowed ? req.headers.get('x-edit-v2-test-user') : null
  if (testUser && /^[0-9a-f-]{36}$/i.test(testUser)) {
    userId = testUser
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    userId = user.id
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }
  const imageUrl = typeof body.image_url === 'string' ? body.image_url : ''
  const maskUrl = typeof body.mask_url === 'string' ? body.mask_url : ''
  if (!imageUrl || !maskUrl) {
    return NextResponse.json({ error: 'image_url e mask_url são obrigatórios.' }, { status: 400 })
  }

  try {
    assertSafeImageUrl(imageUrl)
    assertSafeImageUrl(maskUrl)
    const t0 = Date.now()
    const [imageBuffer, maskBuffer] = await Promise.all([
      fetchImageBuffer(imageUrl),
      fetchImageBuffer(maskUrl),
    ])
    const result = await refineSurfaceMaskV2({ imageBuffer, maskBuffer })

    // Sem mudança útil → devolve a original (o cliente nem re-renderiza).
    if (!result.refined) {
      const coverage = result.coverage || (await maskWhiteRatio(maskBuffer))
      return NextResponse.json({ mask_url: maskUrl, coverage, refined: false })
    }

    const admin = createAdminClient()
    const refinedUrl = await uploadEditAsset(admin, userId, result.mask, 'crop-mask')
    console.log(
      `[edit-v2/refine-mask] user=${userId} refined em ${Date.now() - t0}ms · coverage=${result.coverage.toFixed(4)}`,
    )
    return NextResponse.json({ mask_url: refinedUrl, coverage: result.coverage, refined: true })
  } catch (err) {
    if (err instanceof EditV2InputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[edit-v2/refine-mask] erro:', err)
    return NextResponse.json({ error: 'Não foi possível refinar a seleção.' }, { status: 500 })
  }
}
