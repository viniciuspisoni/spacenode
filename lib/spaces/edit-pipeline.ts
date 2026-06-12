// Pipeline de execução de uma edição já roteada.
//
// Junta crop (quando shouldUseCrop) + chamada ao engine + recomposição na
// original + persistência no Supabase Storage + medição do drift fora da
// máscara (quality gate). O upload é injetado (`uploadResult`).
//
// Garantia de preservação: TODA edição com máscara (crop OU imagem inteira)
// passa por recomposeMasked — o output do provider só entra DENTRO da área
// branca; fora dela fica idêntico à original. Endpoints sem máscara (Flux Pro
// Kontext) editam a imagem inteira por instrução e não têm "fora da máscara".

import type { Quality } from './types'
import type { EditRoutingResult } from './edit-router'
import type { RetouchEngine, EngineDescriptor } from './engines'
import { callWithTimeoutRetry } from './engines'
import {
  fetchImageBuffer,
  planCrop,
  extractCrop,
  recomposeMasked,
  normalizeMaskToImage,
  fullRegion,
  measureOutOfMaskDrift,
  measureInMaskChange,
  dilateMask,
  assertMaskMatchesImage,
  padForInpaintAspect,
  unpadInpaintResult,
  resizeToSource,
  ASPECT_LIMITED_ENDPOINTS,
} from './edit-crop'

/** Limite do quality gate: acima disso a edição é rejeitada (drift fora da máscara). */
export const OUT_OF_MASK_GATE = 0.02
/** Gate p/ blend (material/replace/add): a edição é ANCORADA na máscara (inpaint
 *  flux-kontext-lora) + recompose, então o drift fora da máscara já é ~0. Mantemos
 *  uma folga pequena só p/ a banda do feather (borda suave). */
export const BLEND_OUT_OF_MASK_GATE = 0.08

export type UploadKind = 'result' | 'crop' | 'crop-mask'

export interface RunEditArgs {
  sourceUrl:    string
  maskUrl:      string | null
  prompt:       string
  quality:      Quality
  referenceUrl?: string
  /** Referências visuais (multi-imagem) passadas ao engine. */
  references?:  { url: string; role: string }[]
  routing:      EditRoutingResult
  /** Do endpoint-dispatch: o endpoint consome a máscara (inpaint/2-imagens)? */
  usesMask:     boolean
  /** material/replace/add: borda suave na recomposição (blend). */
  softEdges?:   boolean
  /** Semântica p/ Vertex Imagen (removal → INPAINT_REMOVAL). */
  intentHint?:  'removal' | 'insertion'
  /** Remoção: dilata levemente a máscara (cobre borda do objeto + sombra rente). */
  dilateForRemoval?: boolean
  engine:       RetouchEngine
  uploadResult: (buffer: Buffer, kind: UploadKind) => Promise<string>
}

export interface RunEditResult {
  resultUrl:      string
  usedCrop:       boolean
  cropMegapixels: number | null
  endpoint:       string
  /** Fração 0–1 de pixels fora da máscara que mudaram. null se não-aplicável (sem máscara). */
  outOfMaskDelta: number | null
  /** Fração 0–1 de pixels DENTRO da máscara que mudaram (detecção de no-op).
   *  null se não-aplicável (sem máscara). */
  inMaskDelta:    number | null
}

export async function runEdit(args: RunEditArgs): Promise<RunEditResult> {
  const {
    sourceUrl, maskUrl, prompt, quality, referenceUrl, references, routing,
    usesMask, softEdges, intentHint, dilateForRemoval, engine, uploadResult,
  } = args

  // callWithTimeoutRetry espera um EngineDescriptor (usa só .call e .endpoint).
  const descriptor: EngineDescriptor = {
    mode:        'material',
    endpoint:    routing.endpoint,
    call:        engine,
    description: routing.endpoint,
  }

  // ── Endpoints SEM máscara (Flux Pro Kontext, Gemini instruct) — edição por instrução ──
  // Não há "fora da máscara" a preservar. Buscamos o buffer fonte em paralelo com
  // a chamada ao provider para redimensionar o output às dimensões originais.
  if (!usesMask || !maskUrl) {
    const [out, srcBuf] = await Promise.all([
      callWithTimeoutRetry(descriptor, {
        imageUrl: sourceUrl,
        maskUrl:  maskUrl ?? sourceUrl,
        prompt,
        quality,
        referenceUrl,
        references,
        intentHint,
      }),
      fetchImageBuffer(sourceUrl),
    ])
    const rawBuf = await fetchImageBuffer(out.imageUrl)
    const buf = await resizeToSource(rawBuf, srcBuf)
    const resultUrl = await uploadResult(buf, 'result')
    return { resultUrl, usedCrop: false, cropMegapixels: null, endpoint: out.endpoint, outOfMaskDelta: null, inMaskDelta: null }
  }

  // ── Edições COM máscara: precisamos da imagem + máscara alinhada ──
  const [imgBuf, maskRaw] = await Promise.all([
    fetchImageBuffer(sourceUrl),
    fetchImageBuffer(maskUrl),
  ])
  // Proporção divergente = máscara de OUTRA imagem → erro claro antes de gastar
  // provider (a rota converte em resposta amigável e estorna).
  await assertMaskMatchesImage(maskRaw, imgBuf)
  let maskBuf = await normalizeMaskToImage(maskRaw, imgBuf)
  // Remoção: dilata levemente (borda do objeto + sombra rente entram na área
  // reconstruída; o recompose usa a máscara dilatada).
  if (dilateForRemoval) maskBuf = await dilateMask(maskBuf)

  // ── Caminho com CROP (endpoints de inpaint sensíveis a MP) ──
  if (routing.shouldUseCrop) {
    const plan = await planCrop({
      imageBuffer:   imgBuf,
      maskBuffer:    maskBuf,
      maxMegapixels: routing.maxCropMegapixels,
    })
    if (plan) {
      const [cropImg, cropMask] = await Promise.all([
        extractCrop(imgBuf, plan),
        extractCrop(maskBuf, plan),
      ])
      // flux-kontext-lora/inpaint estoura (422 "loras") em aspecto > 2:1 — comum
      // num crop de superfície larga (piso) de render largo. Pad pro limite e
      // desfaz no resultado; o padding fica FORA da máscara (preservado).
      const pad = ASPECT_LIMITED_ENDPOINTS.has(routing.endpoint)
        ? await padForInpaintAspect(cropImg, cropMask)
        : null
      const [cropImgUrl, cropMaskUrl] = await Promise.all([
        uploadResult(pad?.image ?? cropImg, 'crop'),
        uploadResult(pad?.mask ?? cropMask, 'crop-mask'),
      ])
      const out = await callWithTimeoutRetry(descriptor, {
        imageUrl: cropImgUrl,
        maskUrl:  cropMaskUrl,
        prompt,
        quality,
        referenceUrl,
        references,
        intentHint,
      })
      let editedCropBuf = await fetchImageBuffer(out.imageUrl)
      if (pad) editedCropBuf = await unpadInpaintResult(editedCropBuf, pad)
      const finalBuf = await recomposeMasked({
        originalBuffer:   imgBuf,
        editedCropBuffer: editedCropBuf,
        maskBuffer:       maskBuf,
        region:           plan.region,
        softEdges,
      })
      const [outOfMaskDelta, inMaskDelta] = await Promise.all([
        measureOutOfMaskDrift({
          originalBuffer: imgBuf, resultBuffer: finalBuf, maskBuffer: maskBuf, softEdges,
        }),
        measureInMaskChange({
          originalBuffer: imgBuf, resultBuffer: finalBuf, maskBuffer: maskBuf,
        }),
      ])
      const resultUrl = await uploadResult(finalBuf, 'result')
      return { resultUrl, usedCrop: true, cropMegapixels: plan.outMegapixels, endpoint: out.endpoint, outOfMaskDelta, inMaskDelta }
    }
    // Sem área branca → cai pro caminho de imagem inteira (com recompose).
  }

  // ── Caminho de IMAGEM INTEIRA com máscara (nano-banana/edit, gemini-3-pro) ──
  // Recompõe o output do provider sobre a original p/ preservar fora da máscara.
  //
  // Se a máscara foi normalizada (ex: sentinela 1×1 → full-size), re-hospeda o
  // buffer normalizado para que o provider (FAL) busque a versão correta.
  const engineMaskUrl = maskBuf !== maskRaw
    ? await uploadResult(maskBuf, 'crop-mask')
    : maskUrl
  const out = await callWithTimeoutRetry(descriptor, {
    imageUrl: sourceUrl,
    maskUrl:  engineMaskUrl,
    prompt,
    quality,
    referenceUrl,
    references,
    intentHint,
  })
  const providerBuf = await fetchImageBuffer(out.imageUrl)
  const region = await fullRegion(imgBuf)
  const finalBuf = await recomposeMasked({
    originalBuffer:   imgBuf,
    editedCropBuffer: providerBuf,
    maskBuffer:       maskBuf,
    region,
    softEdges,
  })
  const [outOfMaskDelta, inMaskDelta] = await Promise.all([
    measureOutOfMaskDrift({
      originalBuffer: imgBuf, resultBuffer: finalBuf, maskBuffer: maskBuf, softEdges,
    }),
    measureInMaskChange({
      originalBuffer: imgBuf, resultBuffer: finalBuf, maskBuffer: maskBuf,
    }),
  ])
  const resultUrl = await uploadResult(finalBuf, 'result')
  return { resultUrl, usedCrop: false, cropMegapixels: null, endpoint: out.endpoint, outOfMaskDelta, inMaskDelta }
}
