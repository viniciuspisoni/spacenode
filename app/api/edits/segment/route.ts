// POST /api/edits/segment — Camada de SUPERFÍCIE (atrás de flag).
//
// QUATRO modos (todos devolvem máscara de superfície + preview verde; NÃO geram
// edição — só preparam a máscara). Gated por SURFACE_SEGMENTATION_ENABLED.
//
//   1. SEMÂNTICO  { image_url, semantic: 'floor'|'wall' }
//      Atalhos "Piso"/"Parede" do seletor por clique — evf-sam por texto
//      (já exclui objetos por cima: tapete, cama, móveis).
//   2. CLIQUE     { image_url, points: [{x,y}] }   (coords em px da imagem)
//      Clique direto na superfície — SAM2 com point prompt.
//   3. REFINO     { image_url, base_mask_url, points: [{x,y}], op: 'add'|'subtract' }
//      "+ adicionar área" / "− remover área" sobre a seleção atual: SAM2 segmenta
//      a região do clique e ela é UNIDA à base ou SUBTRAÍDA dela.
//   4. BLOB       { image_url, mask_url }  (legado — pincel)
//      O blob pintado vira seeds; tenta a superfície semântica que melhor cobre
//      o blob e cai pro SAM2 com fallback duro pro próprio blob.
//   5. TEXTO      { image_url, query }
//      Seleção por texto (varinha do V3): a instrução nomeia o alvo → Gemini
//      localiza (box, PT-nativo) → SAM2 dá os pixels na box → refino de borda →
//      completion limitada à box e às exclusões. Cadeia do caminho B validada
//      no laboratório v2 (2026-06-12).
//   +  WARM-UP    { warmup: true }
//      Acorda SAM2 + evf-sam com uma imagem-mínima (cold boot FAL ~10-40s →
//      próximo clique ~3s). Fire-and-forget do cliente; rate-limit próprio.

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { SURFACE_SEGMENTATION_ENABLED } from '@/lib/spaces/edit-router'
import { callSam2Segment, callEvfSam } from '@/lib/spaces/engines'
import {
  fetchImageBuffer,
  normalizeMaskToImage,
  samplePointsFromMask,
  refineSurfaceMask,
  blobCoverageByMask,
  closeErodeMask,
  unionMasks,
  subtractObjectsFromSurface,
  maskWhiteRatio,
} from '@/lib/spaces/edit-crop'
import { uploadEditAsset } from '@/lib/spaces/edit-route-helpers'
import { geminiSegmentTarget } from '@/lib/edit-v2/gemini-segment'
import { parseBoxNorm, boxToPixels, boxFillMask } from '@/lib/edit-v2/gemini-mask-raster'
import { completeSurfaceMask } from '@/lib/edit-v2/mask-ops'
import { refineSurfaceMaskV2 } from '@/lib/edit-v2/mask-refine'

fal.config({ credentials: process.env.FAL_KEY })
export const runtime = 'nodejs'
export const maxDuration = 120

interface Body {
  image_url?:     unknown
  mask_url?:      unknown
  semantic?:      unknown
  points?:        unknown
  base_mask_url?: unknown
  op?:            unknown
  /** Seleção por TEXTO: instrução PT que nomeia o alvo (modo 5). */
  query?:         unknown
  /** true → só acorda os modelos de segmentação e retorna (sem máscara). */
  warmup?:        unknown
  /** true → não gera o overlay de preview (cliente que desenha a máscara ele
   *  mesmo, ex. varinha do V3: economiza 1 composite sharp + 1 upload). */
  skip_preview?:  unknown
}

interface ClickPoint { x: number; y: number }

function parsePoints(raw: unknown): ClickPoint[] {
  if (!Array.isArray(raw)) return []
  const out: ClickPoint[] = []
  for (const item of raw.slice(0, 12)) {
    const p = item as { x?: unknown; y?: unknown }
    if (typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out.push({ x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)) })
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  if (!SURFACE_SEGMENTATION_ENABLED) {
    return NextResponse.json({ error: 'Segmentação de superfície desabilitada' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Rate limit (AL-2): SAM2/evf-sam grátis (custo FAL por request).
  const rl = await rateLimit(createAdminClient(), `segment:${user.id}`, 60, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas requisições. Aguarde um momento.' }, { status: 429 })

  const body = await req.json().catch(() => null) as Body | null
  const imageUrl    = typeof body?.image_url === 'string' ? body.image_url : null
  const maskUrl     = typeof body?.mask_url === 'string'  ? body.mask_url  : null
  const semantic    = body?.semantic === 'floor' || body?.semantic === 'wall' ? body.semantic : null
  const baseMaskUrl = typeof body?.base_mask_url === 'string' ? body.base_mask_url : null
  const op          = body?.op === 'add' || body?.op === 'subtract' ? body.op : null
  const clickPoints = parsePoints(body?.points)
  const skipPreview = body?.skip_preview === true
  const query       = typeof body?.query === 'string' ? body.query.trim().slice(0, 300) : null

  // ── WARM-UP: acorda SAM2 + evf-sam com a imagem-mínima de /public (asset
  // estático, público em prod sem passar pelo proxy). Não devolve máscara;
  // erros dos modelos não importam (o boot do container é o objetivo; em dev a
  // FAL não alcança localhost → no-op silencioso). Rate-limit próprio.
  if (body?.warmup === true) {
    const rlWarm = await rateLimit(createAdminClient(), `segment-warmup:${user.id}`, 4, 60)
    if (!rlWarm.allowed) return NextResponse.json({ ok: false }, { status: 429 })
    const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') || req.nextUrl.origin
    const tiny = `${base}/segment-warmup.png`
    const results = await Promise.allSettled([
      callSam2Segment({ imageUrl: tiny, points: [{ x: 16, y: 16, label: 1 }] }),
      callEvfSam({ imageUrl: tiny, prompt: 'floor' }),
    ])
    const warmed = results.filter(r => r.status === 'fulfilled').length
    console.log(`[edits.segment] warmup: ${warmed}/2 modelos quentes`)
    return NextResponse.json({ ok: true, warmed })
  }

  if (!imageUrl || (!maskUrl && !semantic && clickPoints.length === 0 && !query)) {
    return NextResponse.json(
      { error: 'image_url + (mask_url | semantic | points | query) obrigatórios' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  try {
    const imgBuf = await fetchImageBuffer(imageUrl)

    let mask: Buffer
    let usedFallback = false
    let source = 'sam'
    let pointCount = clickPoints.length
    let targetLabel: string | null = null
    let targetLocation: string | null = null

    if (semantic) {
      // ── 1) SEMÂNTICO: "Piso" / "Parede" em um clique. ──
      const r = await callEvfSam({ imageUrl, prompt: semantic })
      const buf = await normalizeMaskToImage(await fetchImageBuffer(r.maskUrl), imgBuf)
      mask = await closeErodeMask(buf)
      source = `evf:${semantic}`
    } else if (baseMaskUrl && op && clickPoints.length > 0) {
      // ── 3) REFINO: adiciona/remove a região clicada da seleção atual. ──
      const base = await normalizeMaskToImage(await fetchImageBuffer(baseMaskUrl), imgBuf)
      const { maskUrl: samUrl } = await callSam2Segment({
        imageUrl,
        points: clickPoints.map(p => ({ x: p.x, y: p.y, label: 1 as const })),
      })
      const region = await normalizeMaskToImage(await fetchImageBuffer(samUrl), imgBuf)
      if (op === 'add') {
        mask = await unionMasks(base, await closeErodeMask(region))
      } else {
        // Dilata levemente a região antes de subtrair (mata halo na borda).
        mask = (await subtractObjectsFromSurface(base, region, 3)).mask
      }
      source = `refine:${op}`
    } else if (clickPoints.length > 0) {
      // ── 2) CLIQUE: seleção inicial direto na superfície. ──
      const { maskUrl: samUrl } = await callSam2Segment({
        imageUrl,
        points: clickPoints.map(p => ({ x: p.x, y: p.y, label: 1 as const })),
      })
      const region = await normalizeMaskToImage(await fetchImageBuffer(samUrl), imgBuf)
      mask = await closeErodeMask(region)
      source = 'sam:points'
    } else if (query) {
      // ── 5) TEXTO: instrução → box (Gemini, PT-nativo) → SAM2 na box →
      //    refino de borda → completion limitada à box − exclusões. ──
      const target = await geminiSegmentTarget({
        imageUrl,
        regionOverlayUrl: null,
        instructionPt: query,
        enabled: true,
      })
      const box = target.box2d ? parseBoxNorm(target.box2d) : null
      const meta = await sharp(imgBuf).metadata()
      const W = meta.width ?? 0
      const H = meta.height ?? 0
      const px = box && W && H ? boxToPixels(box, W, H) : null
      if (!target.used || !box || !px || target.confidence < 0.45) {
        return NextResponse.json(
          { error: 'Não deu para localizar o elemento pela descrição. Clique nele com a varinha.', code: 'target_not_found' },
          { status: 422 },
        )
      }
      // SAM2 na box (ponto central + box) ∥ exclusões (evf-sam, best-effort) —
      // paralelo pra não somar cold boots.
      const [sam, excl] = await Promise.all([
        callSam2Segment({
          imageUrl,
          points: [{ x: px.left + px.width / 2, y: px.top + px.height / 2, label: 1 as const }],
          box: { x_min: px.left, y_min: px.top, x_max: px.left + px.width, y_max: px.top + px.height },
        }),
        target.exclusions.length > 0
          ? callEvfSam({ imageUrl, prompt: target.exclusions.join(', ') }).catch(() => null)
          : Promise.resolve(null),
      ])
      const samMask = await normalizeMaskToImage(await fetchImageBuffer(sam.maskUrl), imgBuf)
      const exclMask = excl ? await normalizeMaskToImage(await fetchImageBuffer(excl.maskUrl), imgBuf) : null
      const refined = await refineSurfaceMaskV2({ imageBuffer: imgBuf, maskBuffer: samMask })
      const boxMask = await boxFillMask(box, W, H)
      const comp = await completeSurfaceMask(refined.mask, { boxMaskBuf: boxMask, exclusionBuf: exclMask })
      mask = comp.mask
      source = 'gemini-box-sam2'
      targetLabel = target.label || null
      targetLocation = target.location || null
    } else {
      // ── 4) BLOB (legado — pincel): seeds do blob + melhor superfície. ──
      const blobBuf = await normalizeMaskToImage(await fetchImageBuffer(maskUrl as string), imgBuf)
      const points = await samplePointsFromMask(blobBuf)
      if (points.length === 0) {
        return NextResponse.json({ error: 'Máscara vazia' }, { status: 400 })
      }
      pointCount = points.length

      // Tenta a SUPERFÍCIE SEMÂNTICA (evf-sam floor/wall) que melhor cobre o
      // blob pintado; cai pro SAM2 (point seeds) com fallback duro pro blob.
      const evf = (await Promise.all(['floor', 'wall'].map(async (s) => {
        try {
          const r = await callEvfSam({ imageUrl, prompt: s })
          const buf = await fetchImageBuffer(r.maskUrl)
          return { s, buf, cov: await blobCoverageByMask(buf, blobBuf) }
        } catch { return null }
      }))).filter((x): x is { s: string; buf: Buffer; cov: number } => !!x)
      const bestEvf = evf.sort((a, b) => b.cov - a.cov)[0]

      if (bestEvf && bestEvf.cov >= 0.5) {
        mask = await closeErodeMask(bestEvf.buf)
        source = `evf:${bestEvf.s}`
      } else {
        const { maskUrl: samUrl } = await callSam2Segment({
          imageUrl,
          points: points.map(p => ({ x: p.x, y: p.y, label: 1 as const })),
        })
        const samBuf = await fetchImageBuffer(samUrl)
        const refined = await refineSurfaceMask(samBuf, blobBuf)
        mask = refined.mask
        usedFallback = refined.usedFallback
      }
    }

    const surfaceRatio = await maskWhiteRatio(mask)
    const surfaceMaskUrl = await uploadEditAsset(admin, user.id, mask, 'crop-mask')

    // Overlay de preview: render com a superfície detectada tingida (verde Spacenode).
    const meta = await sharp(imgBuf).metadata()
    const W = meta.width ?? 0, H = meta.height ?? 0
    let previewUrl: string | null = skipPreview ? null : imageUrl
    if (W && H && !skipPreview) {
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
      surface_source:   source,
      point_count:      pointCount,
      ...(targetLabel ? { target_label: targetLabel, target_location: targetLocation } : {}),
    })
  } catch (e) {
    console.error('[edits.segment]', (e as Error).message)
    return NextResponse.json({ error: 'Erro na segmentação' }, { status: 500 })
  }
}
