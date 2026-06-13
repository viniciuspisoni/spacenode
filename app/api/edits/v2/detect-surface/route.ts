// POST /api/edits/v2/detect-surface — SELEÇÃO POR INTENÇÃO (Trocar material v2).
//
// A marcação do usuário é REGIÃO APROXIMADA, não máscara final. Pipeline:
//   1. interpreta imagem + região (overlay verde) + instrução (Gemini) → alvo
//      estruturado { target_phrase_en, element_type, location, exclusions };
//   2. evf-sam(target_phrase_en) → máscara semântica do elemento;
//   3. restringe à região expandida (não pega material parecido em outra parte);
//   4. se cobre mal a região → fallback SAM2 (box = bbox do traço);
//   5. subtrai exclusões (objetos sobre a superfície), se houver;
//   6. refina a borda (guided filter, edge-aware);
//   7. devolve a máscara P&B (o canvas tinge de verde sozinho) + interpretação.
//
// Custo da casa (~US$0,006–0,012/detecção): Gemini + 1–2 chamadas de
// segmentação. NÃO debita Nodes, NÃO cobra. Flag-gated, allowlist SSRF,
// best-effort (sempre devolve algo utilizável). /api/edits/segment e o v1
// ficam intocados — só reusa funções de lib compartilhadas.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callEvfSam, callSam2Segment } from '@/lib/spaces/engines'
import {
  fetchImageBuffer,
  maskWhiteRatio,
  normalizeMaskToImage,
  subtractObjectsFromSurface,
} from '@/lib/spaces/edit-crop'
import { uploadEditAsset } from '@/lib/spaces/edit-route-helpers'
import { editV2Enabled, normalizerEnabled } from '@/lib/edit-v2/flags'
import { assertSafeImageUrl, EditV2InputError } from '@/lib/edit-v2/pipeline'
import { refineSurfaceMaskV2 } from '@/lib/edit-v2/mask-refine'
import { interpretSelection } from '@/lib/edit-v2/interpret-selection'
import {
  expandedRegionMask,
  intersectMasks,
  overlapRatio,
  regionBoundingBoxNorm,
  regionCenterPx,
  regionOverlay,
} from '@/lib/edit-v2/mask-ops'

export const runtime = 'nodejs'
export const maxDuration = 120

const MIN_REGION_RATIO = 0.0002      // região praticamente vazia → 400
const POOR_COVERAGE = 0.15           // evf-sam cobriu mal a região → SAM2 fallback
const REGION_MARGIN = 0.12           // expansão da bbox do traço

interface Body {
  image_url?: unknown
  region_mask_url?: unknown
  instruction?: unknown
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
  const regionUrl = typeof body.region_mask_url === 'string' ? body.region_mask_url : ''
  const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 2000) : ''
  if (!imageUrl || !regionUrl) {
    return NextResponse.json({ error: 'image_url e region_mask_url são obrigatórios.' }, { status: 400 })
  }

  const admin = createAdminClient()
  try {
    assertSafeImageUrl(imageUrl)
    assertSafeImageUrl(regionUrl)
    const t0 = Date.now()

    const [imageBuffer, rawRegion] = await Promise.all([
      fetchImageBuffer(imageUrl),
      fetchImageBuffer(regionUrl),
    ])
    const region = await normalizeMaskToImage(rawRegion, imageBuffer)
    const regionRatio = await maskWhiteRatio(region)
    if (regionRatio < MIN_REGION_RATIO) {
      return NextResponse.json({ error: 'Circule a região que deseja alterar.' }, { status: 400 })
    }

    // 1. Interpretação (Gemini): imagem + overlay da região + instrução → alvo.
    const overlayBuf = await regionOverlay(imageBuffer, region)
    const overlayUrl = await uploadEditAsset(admin, userId, overlayBuf, 'crop-mask')
    const intent = await interpretSelection({
      imageUrl,
      regionOverlayUrl: overlayUrl,
      instructionPt: instruction,
      enabled: normalizerEnabled(), // mesma flag das camadas invisíveis
    })

    // 2–3. evf-sam(alvo) ∩ região expandida.
    const expanded = await expandedRegionMask(region, REGION_MARGIN)
    let candidate: Buffer
    let usedFallback = false
    try {
      const evf = await callEvfSam({ imageUrl, prompt: intent.targetPhraseEn })
      const evfMask = await normalizeMaskToImage(await fetchImageBuffer(evf.maskUrl), imageBuffer)
      candidate = await intersectMasks(evfMask, expanded)
    } catch {
      candidate = await intersectMasks(region, expanded) // degrada p/ o próprio traço
      usedFallback = true
    }

    // 4. Cobertura ruim → SAM2 (box do traço). Exclusivo com a subtração (custo).
    const cov = await overlapRatio(candidate, region)
    if (cov < POOR_COVERAGE) {
      try {
        const box = await regionBoundingBoxNorm(region)
        const center = await regionCenterPx(region)
        const sam = await callSam2Segment({
          imageUrl,
          points: center ? [{ x: center.x, y: center.y, label: 1 }] : [],
          box: box ?? undefined,
        })
        const samMask = await normalizeMaskToImage(await fetchImageBuffer(sam.maskUrl), imageBuffer)
        candidate = await intersectMasks(samMask, expanded)
        usedFallback = true
      } catch {
        candidate = await intersectMasks(region, expanded)
        usedFallback = true
      }
    } else if (intent.exclusions.length > 0) {
      // 5. Subtrai objetos sobre a superfície (1 chamada evf-sam adicional).
      try {
        const excl = await callEvfSam({ imageUrl, prompt: intent.exclusions.join(', ') })
        const exclMask = await normalizeMaskToImage(await fetchImageBuffer(excl.maskUrl), imageBuffer)
        candidate = (await subtractObjectsFromSurface(candidate, exclMask)).mask
      } catch {
        /* segue sem subtração */
      }
    }

    // 6. Refino edge-aware (local, grátis).
    const refined = await refineSurfaceMaskV2({ imageBuffer, maskBuffer: candidate })
    let finalMask = refined.mask
    let coverage = refined.coverage

    // Guard-rail final: máscara vazia → usa a região marcada como está.
    if (!coverage || coverage < MIN_REGION_RATIO) {
      finalMask = await intersectMasks(region, expanded)
      coverage = await maskWhiteRatio(finalMask)
      usedFallback = true
    }

    const surfaceMaskUrl = await uploadEditAsset(admin, userId, finalMask, 'crop-mask')
    console.log(
      `[edit-v2/detect-surface] user=${userId} em ${Date.now() - t0}ms · alvo="${intent.targetPhraseEn}" ` +
      `excl=${intent.exclusions.length} cov=${coverage.toFixed(4)} fallback=${usedFallback} ` +
      `gemini=${intent.durationMs}ms/$${intent.costUsdEstimated}`,
    )

    return NextResponse.json({
      surface_mask_url: surfaceMaskUrl,
      surface_coverage: coverage,
      used_fallback: usedFallback,
      interpretation: {
        element_type: intent.elementType,
        location: intent.location,
        surface: intent.surface,
      },
    })
  } catch (err) {
    if (err instanceof EditV2InputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[edit-v2/detect-surface] erro:', err)
    return NextResponse.json({ error: 'Não foi possível detectar a área.' }, { status: 500 })
  }
}
