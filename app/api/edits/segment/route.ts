// POST /api/edits/segment — Camada de SUPERFÍCIE (Fase 1, atrás de flag).
//
// Recebe a imagem-fonte + o blob pintado e usa o SAM2 (fal-ai/sam2/image) pra
// segmentar a SUPERFÍCIE inteira (piso/parede), refinando com fallback DURO pro
// blob quando o SAM falha. Devolve a máscara da superfície (pra usar como
// mask_url no generate, SE o usuário confirmar) + um overlay de preview. NÃO gera
// edição — só prepara a máscara. Gated por SURFACE_SEGMENTATION_ENABLED.

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SURFACE_SEGMENTATION_ENABLED } from '@/lib/spaces/edit-router'
import { callSam2Segment } from '@/lib/spaces/engines'
import {
  fetchImageBuffer,
  normalizeMaskToImage,
  samplePointsFromMask,
  refineSurfaceMask,
} from '@/lib/spaces/edit-crop'
import { uploadEditAsset } from '@/lib/spaces/edit-route-helpers'

fal.config({ credentials: process.env.FAL_KEY })
export const runtime = 'nodejs'

interface Body { image_url?: unknown; mask_url?: unknown }

export async function POST(req: NextRequest) {
  if (!SURFACE_SEGMENTATION_ENABLED) {
    return NextResponse.json({ error: 'Segmentação de superfície desabilitada' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as Body | null
  const imageUrl = typeof body?.image_url === 'string' ? body.image_url : null
  const maskUrl  = typeof body?.mask_url === 'string'  ? body.mask_url  : null
  if (!imageUrl || !maskUrl) {
    return NextResponse.json({ error: 'image_url e mask_url obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()
  try {
    const [imgBuf, blobRaw] = await Promise.all([fetchImageBuffer(imageUrl), fetchImageBuffer(maskUrl)])
    const blobBuf = await normalizeMaskToImage(blobRaw, imgBuf)

    const points = await samplePointsFromMask(blobBuf)
    if (points.length === 0) {
      return NextResponse.json({ error: 'Máscara vazia' }, { status: 400 })
    }

    const { maskUrl: samUrl } = await callSam2Segment({
      imageUrl,
      points: points.map(p => ({ x: p.x, y: p.y, label: 1 as const })),
    })
    const samBuf = await fetchImageBuffer(samUrl)
    const { mask, usedFallback, surfaceRatio } = await refineSurfaceMask(samBuf, blobBuf)

    const surfaceMaskUrl = await uploadEditAsset(admin, user.id, mask, 'crop-mask')

    // Overlay de preview: render com a superfície detectada tingida (verde Spacenode).
    const meta = await sharp(imgBuf).metadata()
    const W = meta.width ?? 0, H = meta.height ?? 0
    let previewUrl = imageUrl
    if (W && H) {
      const maskRaw = await sharp(mask).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer()
      const dim = Buffer.alloc(maskRaw.length)
      for (let i = 0; i < maskRaw.length; i++) dim[i] = Math.round(maskRaw[i] * 0.42)
      const tint = Buffer.alloc(W * H * 3)
      for (let i = 0; i < W * H; i++) { tint[i * 3] = 29; tint[i * 3 + 1] = 158; tint[i * 3 + 2] = 117 }
      const overlay = await sharp(tint, { raw: { width: W, height: H, channels: 3 } })
        .joinChannel(dim, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
      const previewBuf = await sharp(imgBuf).composite([{ input: overlay }]).jpeg({ quality: 80 }).toBuffer()
      previewUrl = await uploadEditAsset(admin, user.id, previewBuf, 'result')
    }

    return NextResponse.json({
      surface_mask_url: surfaceMaskUrl,
      preview_url:      previewUrl,
      surface_coverage: surfaceRatio,
      used_fallback:    usedFallback,
      point_count:      points.length,
    })
  } catch (e) {
    console.error('[edits.segment]', (e as Error).message)
    return NextResponse.json({ error: 'Erro na segmentação' }, { status: 500 })
  }
}
