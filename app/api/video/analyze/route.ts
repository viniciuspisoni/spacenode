import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { analyzeVideoReferenceImage } from '@/lib/video/analyzeReference'
import { DIRECT_UPLOAD_AREAS, downloadDirectUpload } from '@/lib/storage/direct-upload'

fal.config({ credentials: process.env.FAL_KEY })

// Endpoint dedicado de análise da imagem do projeto para o módulo Animar.
// - Body JSON { sourceKey }: a imagem já subiu DIRETO pro Storage (uploadDirect,
//   área animar-source — o binário não passa pela Vercel).
// - Baixa o objeto, sobe pra fal.storage e chama analyzeVideoReferenceImage
//   (que reusa o fidelity-engine).
// - Devolve { inputUrl, analysis }.
// - NÃO consome Nodes. NÃO persiste em renders.

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `video-analyze:${user.id}`, 60, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas requisições. Aguarde um momento.' }, { status: 429 })

  try {
    const body = await req.json().catch(() => null)
    const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : ''
    if (!sourceKey) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const src = await downloadDirectUpload(
      admin, DIRECT_UPLOAD_AREAS['animar-source'], user.id, {}, sourceKey,
    )
    if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })

    const inputUrl = await fal.storage.upload(
      new File([new Uint8Array(src.buffer)], sourceKey.split('/').pop() ?? 'source.jpg', { type: src.mime }),
    )
    console.log('[video/analyze] inputUrl:', inputUrl)

    const analysis = await analyzeVideoReferenceImage(inputUrl)
    console.log('[video/analyze] source  :', analysis.source)

    return NextResponse.json({ inputUrl, analysis })
  } catch (err) {
    console.error('[video/analyze] ERROR:', (err as Error).message)
    // Falha não bloqueia o fluxo — cliente segue sem sugestões.
    return NextResponse.json({ error: 'Análise indisponível' }, { status: 500 })
  }
}
