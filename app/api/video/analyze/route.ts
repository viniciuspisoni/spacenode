import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { analyzeVideoReferenceImage } from '@/lib/video/analyzeReference'

fal.config({ credentials: process.env.FAL_KEY })

// Endpoint dedicado de análise da imagem do projeto para o módulo Animar.
// - Faz upload da imagem pra fal.storage uma única vez.
// - Chama analyzeVideoReferenceImage (que reusa o fidelity-engine).
// - Devolve { inputUrl, analysis }. O cliente passa o inputUrl pro
//   /api/video pra evitar segundo upload.
// - NÃO consome Nodes. NÃO persiste em renders.

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const rl = await rateLimit(createAdminClient(), `video-analyze:${user.id}`, 60, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas requisições. Aguarde um momento.' }, { status: 429 })

  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File | null
    if (!imageFile) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const inputUrl = await fal.storage.upload(imageFile)
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
