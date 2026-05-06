import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { analyzeImage } from '@/lib/fidelity-engine'

fal.config({ credentials: process.env.FAL_KEY })

// Endpoint do Fidelity Engine.
// Roda ANTES do /api/generate quando o usuário escolhe Máxima ou Equilibrado.
// - Faz upload da imagem pra fal.storage uma única vez.
// - Chama Claude 3.5 Sonnet via fal-ai/any-llm/vision.
// - Devolve { inputUrl, briefing }. O cliente passa AMBOS pro /api/generate
//   pra evitar segundo upload.
// - NÃO consome Nodes. NÃO persiste em renders.

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    const buffer     = Buffer.from(base64Data, 'base64')
    const imageFile  = new File([buffer], 'analyze.jpg', { type: 'image/jpeg' })
    const inputUrl   = await fal.storage.upload(imageFile)

    console.log('[analyze] inputUrl :', inputUrl)
    const briefing = await analyzeImage(inputUrl)
    console.log('[analyze] briefing :', JSON.stringify(briefing))

    return NextResponse.json({ inputUrl, briefing })
  } catch (err) {
    console.error('[analyze] ERROR:', (err as Error).message)
    // Falha na análise não bloqueia o fluxo: cliente segue pro /api/generate sem briefing
    return NextResponse.json({ error: 'Análise indisponível' }, { status: 500 })
  }
}
