// POST /api/edits/v2/detect-surface — SELEÇÃO POR INTENÇÃO (Trocar material v2).
//
// A marcação do usuário é REGIÃO APROXIMADA (âncora), não máscara final.
// CAMINHO B (Gemini box + SAM2 dentro da box):
//   1. GEMINI VISION (rápido, box-only): imagem + overlay da região + instrução
//      → box_2d + label/location/confidence/exclusões. Gemini resolve "O QUE".
//   2. box → pixels reais → SAM2 roda DENTRO da box. SAM resolve "quais pixels".
//   3. Componente conexo tocando a região (âncora) + exclusões + refino edge-aware.
//   4. Fallback evf-sam(target_phrase_en) se o Gemini falhar/baixa confiança.
//   5. Fallback final: a própria região marcada.
//   (Gemini mask direto fica como experimento futuro — gerar máscara é lento.)
//
// Custo da casa (~US$0,003–0,012/detecção: Gemini box + SAM2 ± exclusões).
// NÃO debita Nodes. Flag-gated, allowlist SSRF, best-effort. /api/edits/segment
// e o v1 ficam intocados — só reusa libs compartilhadas.

import { NextResponse } from 'next/server'
import sharp from 'sharp'
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
import { geminiSegmentTarget } from '@/lib/edit-v2/gemini-segment'
import { parseBoxNorm, boxToPixels, boxFillMask } from '@/lib/edit-v2/gemini-mask-raster'
import {
  completeSurfaceMask,
  expandedRegionMask,
  intersectMasks,
  keepComponentsOverlappingRegion,
  regionOverlay,
} from '@/lib/edit-v2/mask-ops'

export const runtime = 'nodejs'
export const maxDuration = 120

const MIN_REGION_RATIO = 0.0002      // região praticamente vazia → 400
const REGION_MARGIN = 0.12           // expansão da bbox (só no fallback de segurança)
const MIN_CONFIDENCE = 0.45          // abaixo disto, descarta o Gemini → fallback

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

    const W = (await sharp(imageBuffer).metadata()).width ?? 0
    const H = (await sharp(imageBuffer).metadata()).height ?? 0

    // Overlay verde da região (entrada visual do Gemini).
    const overlayBuf = await regionOverlay(imageBuffer, region)
    const overlayUrl = await uploadEditAsset(admin, userId, overlayBuf, 'crop-mask')

    // GEMINI VISION (motor primário): box_2d + mask + label/confidence/exclusões.
    const seg = await geminiSegmentTarget({
      imageUrl,
      regionOverlayUrl: overlayUrl,
      instructionPt: instruction,
      enabled: normalizerEnabled(),
    })

    const expanded = await expandedRegionMask(region, REGION_MARGIN) // só p/ fallback
    let candidate: Buffer | null = null
    let usedFallback = false
    let finalizedPrimary = false // primário já refina + completa internamente
    let policy = ''
    let segMs = 0
    let holeBefore = 0
    let holeAfter = 0

    // 1. PRIMÁRIO (caminho B): GEMINI BOX → SAM2 DENTRO da box → SURFACE
    //    COMPLETION. Gemini diz O QUE/ONDE (box); SAM2 dá os pixels; a completion
    //    preenche faixas/ilhas internas (close + fill) limitada pela box e pelas
    //    exclusões. Exclusões em PARALELO com o SAM2 (não somam cold boots).
    if (seg.confidence >= MIN_CONFIDENCE && seg.box2d) {
      const box = parseBoxNorm(seg.box2d)
      const px = box ? boxToPixels(box, W, H) : null
      if (box && px) {
        try {
          const segStart = Date.now()
          const [sam, excl] = await Promise.all([
            callSam2Segment({
              imageUrl,
              points: [{ x: px.left + px.width / 2, y: px.top + px.height / 2, label: 1 }],
              box: { x_min: px.left, y_min: px.top, x_max: px.left + px.width, y_max: px.top + px.height },
            }),
            seg.exclusions.length > 0
              ? callEvfSam({ imageUrl, prompt: seg.exclusions.join(', ') }).catch(() => null)
              : Promise.resolve(null),
          ])
          segMs = Date.now() - segStart
          const samMask = await normalizeMaskToImage(await fetchImageBuffer(sam.maskUrl), imageBuffer)
          const exclMask = excl
            ? await normalizeMaskToImage(await fetchImageBuffer(excl.maskUrl), imageBuffer)
            : null
          const cc = await keepComponentsOverlappingRegion(samMask, region)
          const anchored = cc?.mask ?? (await intersectMasks(samMask, expanded))
          // refino de borda (precisão do contorno externo) ANTES de completar
          const refinedBase = await refineSurfaceMaskV2({ imageBuffer, maskBuffer: anchored })
          // surface completion: preenche interior limitado pela box + exclusões
          const boxMask = await boxFillMask(box, W, H)
          const comp = await completeSurfaceMask(refinedBase.mask, {
            boxMaskBuf: boxMask,
            exclusionBuf: exclMask,
          })
          candidate = comp.mask
          holeBefore = comp.holeRatioBefore
          holeAfter = comp.holeRatioAfter
          policy = cc ? 'gemini-box-sam2-complete' : 'gemini-box-sam2-local-complete'
          finalizedPrimary = true
        } catch {
          /* SAM2 falhou → cai p/ evf */
        }
      }
    }

    // 2. FALLBACK evf-sam(alvo) — reusa a frase do MESMO Gemini (sem 2ª chamada
    //    de visão). Exclusões em paralelo p/ não somar cold boots.
    if (!candidate) {
      let exclMask: Buffer | null = null
      try {
        const segStart = Date.now()
        const [evf, excl] = await Promise.all([
          callEvfSam({ imageUrl, prompt: seg.targetPhraseEn }),
          seg.exclusions.length > 0
            ? callEvfSam({ imageUrl, prompt: seg.exclusions.join(', ') }).catch(() => null)
            : Promise.resolve(null),
        ])
        segMs = Date.now() - segStart
        const evfMask = await normalizeMaskToImage(await fetchImageBuffer(evf.maskUrl), imageBuffer)
        if (excl) exclMask = await normalizeMaskToImage(await fetchImageBuffer(excl.maskUrl), imageBuffer)
        const cc = await keepComponentsOverlappingRegion(evfMask, region)
        candidate = cc?.mask ?? (await intersectMasks(evfMask, expanded))
        policy = cc ? 'evf-connected' : 'evf-local'
      } catch {
        candidate = await intersectMasks(region, expanded)
        policy = 'region-only'
      }
      usedFallback = true
      // Exclusões só no caminho evf (no caminho Gemini a própria máscara já as
      // exclui — o prompt instrui a segmentar a superfície, não os objetos).
      if (exclMask) candidate = (await subtractObjectsFromSurface(candidate, exclMask)).mask
    }

    // Refino edge-aware (só nos caminhos de fallback; o primário já refinou
    // ANTES da completion, p/ o guided filter não reabrir os seams preenchidos).
    let finalMask: Buffer
    let coverage: number
    if (finalizedPrimary && candidate) {
      finalMask = candidate
      coverage = await maskWhiteRatio(candidate)
    } else {
      const refined = await refineSurfaceMaskV2({ imageBuffer, maskBuffer: candidate as Buffer })
      finalMask = refined.mask
      coverage = refined.coverage
    }

    // Guard-rail final: máscara vazia → usa a região marcada como está.
    if (!coverage || coverage < MIN_REGION_RATIO) {
      finalMask = await intersectMasks(region, expanded)
      coverage = await maskWhiteRatio(finalMask)
      usedFallback = true
      policy = 'region-only'
    }

    const surfaceMaskUrl = await uploadEditAsset(admin, userId, finalMask, 'crop-mask')
    console.log(
      `[edit-v2/detect-surface] user=${userId} em ${Date.now() - t0}ms · alvo="${seg.targetPhraseEn}" ` +
      `policy=${policy} conf=${seg.confidence.toFixed(2)} excl=${seg.exclusions.length} cov=${coverage.toFixed(4)} ` +
      `holeRatio=${holeBefore.toFixed(3)}->${holeAfter.toFixed(3)} ` +
      `fallback=${usedFallback} gemini=${seg.durationMs}ms/$${seg.costUsdEstimated} segMs=${segMs}`,
    )

    return NextResponse.json({
      surface_mask_url: surfaceMaskUrl,
      surface_coverage: coverage,
      used_fallback: usedFallback,
      confidence: seg.confidence,
      interpretation: {
        element_type: seg.label,
        location: seg.location,
        surface: seg.description,
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
