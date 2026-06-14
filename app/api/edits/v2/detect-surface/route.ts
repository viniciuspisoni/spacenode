// POST /api/edits/v2/detect-surface — SELEÇÃO POR INTENÇÃO (Trocar material v2).
//
// A marcação do usuário é REGIÃO APROXIMADA (âncora), não máscara final.
// Prioridade de motores (Gemini-first; evf-sam vira fallback):
//   1. GEMINI VISION: imagem + overlay da região + instrução → box_2d + mask
//      (PNG base64) + label/confidence/exclusões. Rasteriza a mask full-res.
//   2. Se só veio box (ou mask ruim) → SAM2 dentro da box.
//   3. Fallback evf-sam(target_phrase_en) — reusa a frase do MESMO Gemini.
//   4. Fallback final: a própria região marcada.
//   Em todos: ancora por COMPONENTE CONEXO à região + refino edge-aware.
//
// Custo da casa (~US$0,013–0,03/detecção, Gemini com máscara + thinking
// limitados). NÃO debita Nodes. Flag-gated, allowlist SSRF, best-effort.
// /api/edits/segment e o v1 ficam intocados — só reusa libs compartilhadas.

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
import { parseBoxNorm, rasterizeBoxMask, boxToPixels } from '@/lib/edit-v2/gemini-mask-raster'
import {
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
// Acima disto, a "superfície conectada" provavelmente engoliu a cena toda →
// recua para a região local, mais seguro.
const MAX_SURFACE_RATIO = 0.65

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
    let policy = ''
    let segMs = 0

    // 1. GEMINI MASK DIRETO: rasteriza a máscara na box e ancora por componente.
    if (seg.confidence >= MIN_CONFIDENCE && seg.maskBase64 && seg.box2d) {
      const box = parseBoxNorm(seg.box2d)
      if (box) {
        const gmask = await rasterizeBoxMask({ maskBase64: seg.maskBase64, box, width: W, height: H })
        if (gmask) {
          const cc = await keepComponentsOverlappingRegion(gmask, region)
          if (cc && cc.coverage >= MIN_REGION_RATIO && cc.coverage <= MAX_SURFACE_RATIO) {
            candidate = cc.mask
            policy = 'gemini-mask'
          } else if (cc && cc.coverage > MAX_SURFACE_RATIO) {
            candidate = await intersectMasks(gmask, expanded)
            policy = 'gemini-mask-too-big->local'
            usedFallback = true
          }
        }
      }
    }

    // 2. GEMINI BOX + SAM2 dentro da box (quando há box mas a mask não serviu).
    if (!candidate && seg.confidence >= MIN_CONFIDENCE && seg.box2d) {
      const box = parseBoxNorm(seg.box2d)
      const px = box ? boxToPixels(box, W, H) : null
      if (px) {
        try {
          const segStart = Date.now()
          const sam = await callSam2Segment({
            imageUrl,
            points: [{ x: px.left + px.width / 2, y: px.top + px.height / 2, label: 1 }],
            box: { x_min: px.left, y_min: px.top, x_max: px.left + px.width, y_max: px.top + px.height },
          })
          segMs = Date.now() - segStart
          const samMask = await normalizeMaskToImage(await fetchImageBuffer(sam.maskUrl), imageBuffer)
          const cc = await keepComponentsOverlappingRegion(samMask, region)
          candidate = cc?.mask ?? (await intersectMasks(samMask, expanded))
          policy = cc ? 'gemini-box-sam2' : 'gemini-box-sam2-local'
          usedFallback = true
        } catch {
          /* cai p/ evf */
        }
      }
    }

    // 3. FALLBACK evf-sam(alvo) — reusa a frase do MESMO Gemini (sem 2ª chamada
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

    // 6. Refino edge-aware (local, grátis).
    const refined = await refineSurfaceMaskV2({ imageBuffer, maskBuffer: candidate })
    let finalMask = refined.mask
    let coverage = refined.coverage

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
