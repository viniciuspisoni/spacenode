// POST /api/edit-v4/mask/refine — "Colar na borda".
//
// Pega a seleção que o usuário fez e a re-estima usando a própria imagem como
// guia (guided filter, He et al.): onde existe contraste visual — encontro de
// materiais, rodapé, esquadria, quina de marcenaria — a borda da seleção gruda
// no contorno real; em região lisa o interior fica intacto.
//
// É a diferença entre uma seleção "à mão livre, mais ou menos ali" e uma
// seleção que acerta o rodapé no pixel. Em archviz isso é quase todo o
// resultado: o que denuncia uma edição não é o material novo, é a linha torta
// onde ele encontra o antigo.
//
// CUSTO ZERO E ZERO NODES: roda 100% local (sharp + integral images, O(N)),
// ~100–300 ms em 1024 px. Nenhum modelo é chamado. Por isso a rota pode ser
// usada à vontade, quantas vezes o usuário quiser, sem nada debitar.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/request-user'
import { rateLimit } from '@/lib/rate-limit'
import { fetchImageBuffer, normalizeMaskToImage } from '@/lib/spaces/edit-crop'
import { uploadEditAsset } from '@/lib/spaces/edit-route-helpers'
import { refineSurfaceMaskV2 } from '@/lib/edit-v2/mask-refine'
import { editV4Enabled } from '@/lib/edit-v4/flags'
import { EditV3InputError, assertSafeImageUrl } from '@/lib/edit-v3/ssrf'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  image_url?: unknown
  mask_url?: unknown
}

export async function POST(req: NextRequest) {
  if (!editV4Enabled()) {
    return NextResponse.json({ error: 'Não disponível.' }, { status: 404 })
  }

  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // A rota é grátis para o usuário, mas não para a CPU do servidor: o guided
  // filter é O(N) sobre 1 MP. Sem teto, um clique repetido vira DoS de si mesmo.
  const admin = createAdminClient()
  const limited = await rateLimit(admin, `edit-v4-refine:${user.id}`, 30, 60)
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Muitos ajustes seguidos. Espere um instante e tente de novo.' },
      { status: 429 },
    )
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
    return NextResponse.json({ error: 'Imagem e seleção são obrigatórias.' }, { status: 400 })
  }

  try {
    assertSafeImageUrl(imageUrl)
    assertSafeImageUrl(maskUrl)
    const [imageBuffer, rawMask] = await Promise.all([
      fetchImageBuffer(imageUrl),
      fetchImageBuffer(maskUrl),
    ])
    const maskBuffer = await normalizeMaskToImage(rawMask, imageBuffer)

    const refined = await refineSurfaceMaskV2({ imageBuffer, maskBuffer })
    // `refined: false` é o guard-rail interno: o snap degenerou (mudou a
    // cobertura além do aceitável) e ele devolveu a máscara original. Vale
    // dizer isso ao cliente para a UI não anunciar um ajuste que não houve.
    const url = await uploadEditAsset(admin, user.id, refined.mask, 'crop-mask')

    return NextResponse.json({
      mask_url: url,
      coverage: refined.coverage,
      changed: refined.refined,
    })
  } catch (err) {
    if (err instanceof EditV3InputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[edit-v4] refino de borda falhou:', err)
    return NextResponse.json(
      { error: 'Não foi possível ajustar a borda da seleção.' },
      { status: 500 },
    )
  }
}
