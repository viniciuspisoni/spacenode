#!/usr/bin/env bash
# fix-route.sh — Corrige o route.ts para fal-ai v1.9.5

cat > app/api/generate/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPrompt, GenerateOptions, Mode } from '@/lib/prompts'

const FAL_MODELS: Record<string, string> = {
  'flux-dev':     'fal-ai/flux/dev/image-to-image',
  'flux-krea':    'fal-ai/flux/krea/image-to-image',
  'canny':        'fal-ai/flux-control-lora-canny/image-to-image',
  'depth':        'fal-ai/flux-control-lora-depth/image-to-image',
  'flux-general': 'fal-ai/flux-general/image-to-image',
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      imageBase64, mode = 'externo', condition, background,
      ambient, lighting, plantType, perspective,
      vegetation, lightCondition, geometryLock = 30, model = 'flux-dev',
    } = body

    if (!imageBase64) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    const prompt = buildPrompt({
      mode: mode as Mode, condition, background, ambient, lighting,
      plantType, perspective, vegetation, lightCondition,
      geometryLock: Number(geometryLock),
    } as GenerateOptions)

    const strength = Math.max(0.05, Math.min(0.95, 1 - Number(geometryLock) / 100))
    const blob = base64ToBlob(imageBase64)
    const falImageUrl = await fal.storage.upload(blob)

    console.log('[generate] mode:', mode, '| model:', model, '| strength:', strength)
    console.log('[generate] prompt:', prompt.substring(0, 120) + '...')

    const falModel = FAL_MODELS[model] ?? FAL_MODELS['flux-dev']
    const result = await fal.subscribe(falModel, {
      input: {
        image_url: falImageUrl,
        prompt,
        strength,
        num_inference_steps: 40,
        guidance_scale: 3.5,
        seed: Math.floor(Math.random() * 999_999),
      },
    }) as { data: { images?: Array<{ url: string }>; image?: { url: string } } }

    const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url
    if (!outputUrl) {
      return NextResponse.json({ error: 'Fal.ai não retornou imagem' }, { status: 500 })
    }

    const admin = createAdminClient()

    const { error: creditError } = await admin.rpc('consume_credit', { user_id_input: user.id })
    if (creditError) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    const { data: render } = await admin.from('renders').insert({
      user_id: user.id, input_url: falImageUrl, output_url: outputUrl,
      prompt, mode, model: falModel,
      geometry_lock: Number(geometryLock), strength,
    }).select('id').single()

    const { data: profile } = await admin
      .from('profiles').select('credits').eq('id', user.id).single()

    return NextResponse.json({
      success: true,
      outputUrl,
      renderId: render?.id ?? null,
      credits: profile?.credits ?? 0,
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[generate] Erro:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
EOF

echo "✓ app/api/generate/route.ts corrigido"
echo ""
echo "Agora rode: npm run dev"
