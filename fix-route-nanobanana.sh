#!/usr/bin/env bash
# fix-route-nanbanana.sh
# Atualiza o route.ts para suportar o Nano Banana Pro como motor padrão

cat > app/api/generate/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPrompt, GenerateOptions, Mode } from '@/lib/prompts'

// ── Modelos disponíveis ───────────────────────────────────────
const FAL_MODELS: Record<string, string> = {
  'nano-banana-pro': 'fal-ai/nano-banana-pro/edit',   // ← padrão recomendado
  'nano-banana':     'fal-ai/nano-banana/edit',        // ← versão rápida
  'flux-dev':        'fal-ai/flux/dev/image-to-image',
  'flux-krea':       'fal-ai/flux/krea/image-to-image',
  'canny':           'fal-ai/flux-control-lora-canny/image-to-image',
  'depth':           'fal-ai/flux-control-lora-depth/image-to-image',
  'flux-general':    'fal-ai/flux-general/image-to-image',
}

// Modelos que usam a API do Nano Banana (image_urls + prompt)
const NANO_BANANA_MODELS = new Set([
  'fal-ai/nano-banana-pro/edit',
  'fal-ai/nano-banana/edit',
  'fal-ai/gemini-3-pro-image-preview/edit',
])

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // 2. Parse body
    const body = await request.json()
    const {
      imageBase64,
      mode           = 'externo',
      condition,     background,
      ambient,       lighting,
      plantType,     perspective,
      vegetation,    lightCondition,
      geometryLock   = 30,
      model          = 'nano-banana-pro',
    } = body

    if (!imageBase64) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }

    // 3. Prompt dinâmico
    const prompt = buildPrompt({
      mode: mode as Mode,
      condition, background, ambient, lighting,
      plantType, perspective, vegetation, lightCondition,
      geometryLock: Number(geometryLock),
    } as GenerateOptions)

    // 4. Upload da imagem
    const blob = base64ToBlob(imageBase64)
    const falImageUrl = await fal.storage.upload(blob)

    const falModel = FAL_MODELS[model] ?? FAL_MODELS['nano-banana-pro']
    const isNanoBanana = NANO_BANANA_MODELS.has(falModel)

    console.log('[generate] mode:', mode, '| model:', falModel)
    console.log('[generate] nano-banana:', isNanoBanana)
    console.log('[generate] prompt:', prompt.substring(0, 120) + '...')

    // 5. Chamada à Fal.ai — API diferente por modelo
    let result: { data: { images?: Array<{ url: string }>; image?: { url: string } } }

    if (isNanoBanana) {
      // Nano Banana Pro: image_urls (array) + prompt + resolution
      result = await fal.subscribe(falModel, {
        input: {
          prompt,
          image_urls: [falImageUrl],
          num_images: 1,
          aspect_ratio: 'auto',
          output_format: 'jpeg',
          resolution: '1K',
        },
      }) as typeof result
    } else {
      // Flux models: image_url (singular) + strength
      const strength = Math.max(0.05, Math.min(0.95, 1 - Number(geometryLock) / 100))
      console.log('[generate] strength:', strength)
      result = await fal.subscribe(falModel, {
        input: {
          image_url: falImageUrl,
          prompt,
          strength,
          num_inference_steps: 40,
          guidance_scale: 3.5,
          seed: Math.floor(Math.random() * 999_999),
        },
      }) as typeof result
    }

    const outputUrl = result.data?.images?.[0]?.url ?? result.data?.image?.url
    if (!outputUrl) {
      console.error('[generate] Resposta completa da Fal.ai:', JSON.stringify(result))
      return NextResponse.json({ error: 'Fal.ai não retornou imagem' }, { status: 500 })
    }

    // 6. Admin client
    const admin = createAdminClient()

    // 7. Debitar crédito
    const { error: creditError } = await admin.rpc('consume_credit', { user_id_input: user.id })
    if (creditError) {
      return NextResponse.json({ error: 'Créditos insuficientes' }, { status: 402 })
    }

    // 8. Salvar no histórico
    const { data: render } = await admin
      .from('renders')
      .insert({
        user_id:       user.id,
        input_url:     falImageUrl,
        output_url:    outputUrl,
        prompt,
        mode,
        model:         falModel,
        geometry_lock: Number(geometryLock),
        strength:      isNanoBanana ? null : Math.max(0.05, Math.min(0.95, 1 - Number(geometryLock) / 100)),
      })
      .select('id')
      .single()

    // 9. Créditos atualizados
    const { data: profile } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      success:  true,
      outputUrl,
      renderId: render?.id ?? null,
      credits:  profile?.credits ?? 0,
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

echo "✓ route.ts atualizado com Nano Banana Pro como motor padrão"

# Atualiza o seletor de motor no GenerateClient para mostrar Nano Banana Pro primeiro
sed -i "s/{ id: 'flux-dev',/{ id: 'nano-banana-pro', name: 'Nano Banana Pro', tag: 'PADRÃO', wide: false },\n  { id: 'nano-banana', name: 'Nano Banana', tag: 'RÁPIDO', wide: false },\n  { id: 'flux-dev',/" app/app/generate/GenerateClient.tsx 2>/dev/null && echo "✓ GenerateClient.tsx atualizado" || echo "⚠ Atualize o seletor de motor manualmente se necessário"

# Troca o motor padrão no estado inicial do GenerateClient
sed -i "s/useState('flux-dev')/useState('nano-banana-pro')/" app/app/generate/GenerateClient.tsx 2>/dev/null && echo "✓ Motor padrão alterado para nano-banana-pro"

echo ""
echo "Agora rode: npm run dev"
echo "Teste com upload + gerar render — deve usar Nano Banana Pro"
