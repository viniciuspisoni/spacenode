// lib/edit-v4/pipeline.ts
//
// Pipeline server-side do Editar V4:
//
//   busca segura → normaliza a origem → valida a seleção → recorta a região →
//   desenha o contorno → chama o motor → RECOMPÕE → afere → entrega
//
// A ideia central é a mesma do V3, e é o que faz esta ferramenta ser confiável:
// o modelo re-sintetiza a cena inteira, então a preservação fora da seleção NÃO
// é uma promessa do prompt — é aritmética de servidor. Só os pixels dentro da
// máscara branca entram no resultado (`recomposeMasked`), em PNG lossless, com
// o alpha binarizado e o perfil ICC preservado.
//
// O que o V4 muda:
//
//   - Um motor (Seedream 5.0 Pro), duas rotas em série. Sem Gemini no caminho
//     principal — o projeto Google está com billing desativado desde 07/09, e
//     um "fallback" que não responde é pior que não ter fallback.
//   - A saída é dimensionada PELO CROP (engine.ts), não por um preset. Resolve
//     de uma vez o desperdício do V3 (crop de 251×225 gerado em 2 MP, pago na
//     faixa cara e devolvido esticado).
//   - O contorno da seleção vai desenhado na imagem, além do `<bbox>`.
//   - SEM retry pago. No V3, reprovar no gate disparava uma segunda geração que
//     nós pagávamos e o usuário não — com máscara + recompose o drift externo é
//     ~0 por construção, então o retry quase só existia para o modo sem
//     seleção. Refazer continua grátis, só que a decisão passa a ser do usuário.

import {
  assertMaskMatchesImage,
  dilateMask,
  extractCrop,
  fetchImageBuffer,
  fullRegion,
  measureInMaskChange,
  measureOutOfMaskDrift,
  maskWhiteRatio,
  normalizeMaskToImage,
  planCrop,
  recomposeMasked,
  type CropRegion,
} from '@/lib/spaces/edit-crop'
import { seedreamRegionTag } from '@/lib/ai/fal/seedreamEdit'
import { normalizeSourceImage } from '@/lib/storage/normalize-image'
import { evaluateEditSemantics } from '@/lib/edit-v2/semantic-gate'
import type { EditIntentV2 } from '@/lib/edit-v2/types'
import { SEEDREAM_LOW_TIER_MAX_PIXELS } from '@/lib/ai/seedream-size'
import { EditV3InputError, assertSafeImageUrl } from '@/lib/edit-v3/ssrf'
import { drawSelectionOutline, outlineLeakRatio } from './outline'
import { outputSizeForCrop, runSeedreamEdit } from './engine'
import { buildEditV4Prompt } from './prompt'
import { DILATES_MASK, type EditV4Action, type EditV4Provider, type EditV4Request } from './types'

/** Erro de entrada do usuário (400). Reusa a classe do V3 para que a rota trate
 *  os dois iguais — o texto é o que chega na tela, e é sempre em português. */
export { EditV3InputError as EditV4InputError, assertSafeImageUrl }

// Crop só quando a região (bbox + 25% de folga) é MENOR que a imagem de forma
// significativa. Acima disso o "crop" seria o frame inteiro com custo extra.
const CROP_MAX_AREA_RATIO = 0.8

/** Teto de cobertura da seleção. Acima disto não é "editar a área marcada": é
 *  refazer a imagem, e o gate de drift (que mede fora da máscara) não teria o
 *  que medir. */
const MAX_MASK_COVERAGE = 0.985

/** Limite do bucket de resultado (~15 MB); alvo conservador. */
const STORAGE_MAX_BYTES = 14 * 1024 * 1024

/** Acima disto o magenta do contorno vazou para o resultado (ver outline.ts). */
const OUTLINE_LEAK_CEILING = 0.0015

/** Mapeia a ação do V4 para o vocabulário do gate semântico do V2. */
export const INTENT_FOR_ACTION: Record<EditV4Action, EditIntentV2> = {
  remove: 'remove_element',
  swap_material: 'swap_material',
  insert_element: 'insert_element',
  refine_area: 'fix_image',
  // Substituir é inserir algo que não estava lá; é o intent que mais se
  // aproxima no vocabulário do V2, que não tem "replace".
  replace_object: 'insert_element',
}

export class EditV4GenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditV4GenerationError'
  }
}

/** Limiares do gate FORA da seleção. Com recompose o drift real é ~0; estes são
 *  para-quedas contra catástrofe (política da casa: bloquear pouco, avisar
 *  muito). Borda macia precisa de folga porque o feather muda pixels de fora
 *  de propósito. */
export function gateThresholds(opts: {
  preservation: EditV4Request['preservation']
  edgeSoftness: EditV4Request['edgeSoftness']
}): { outOfMask: number; noChangeFloor: number } {
  const soft = opts.edgeSoftness === 'soft'
  const outOfMask =
    opts.preservation === 'maximum' ? (soft ? 0.1 : 0.05) : soft ? 0.15 : 0.1
  return { outOfMask, noChangeFloor: 0.005 }
}

/** Limiares do modo SEM seleção. Sem recompose não existe "fora da máscara":
 *  determinísticamente só dá para pegar catástrofe sem falso positivo — o modelo
 *  devolveu a entrada, ou trocou a imagem inteira. A preservação fina fica com o
 *  prompt rígido e com o gate semântico. */
function instructedGateThresholds(): { globalNoChangeFloor: number; blowupCeiling: number } {
  return { globalNoChangeFloor: 0.004, blowupCeiling: 0.92 }
}

/** Fração de pixels que mudaram na imagem TODA (régua do modo sem seleção). */
async function measureGlobalChange(originalBuffer: Buffer, resultBuffer: Buffer): Promise<number> {
  const sharp = (await import('sharp')).default
  const W = 512
  const [a, b] = await Promise.all([
    sharp(originalBuffer).resize(W, W, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
    sharp(resultBuffer).resize(W, W, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
  ])
  const n = Math.min(a.length, b.length)
  const px = n / 3
  let changed = 0
  for (let i = 0; i + 2 < n; i += 3) {
    if (
      Math.abs(a[i] - b[i]) > 12 ||
      Math.abs(a[i + 1] - b[i + 1]) > 12 ||
      Math.abs(a[i + 2] - b[i + 2]) > 12
    ) {
      changed++
    }
  }
  return px > 0 ? changed / px : 0
}

/** Ajusta o resultado às dims da origem sem cortar nem distorcer (modo sem
 *  seleção). Aspecto batendo (~4%) → `fill`. Não batendo, o modelo mudou o
 *  enquadramento: letterbox só para preview e `aspectOk=false` para o gate
 *  rejeitar, em vez de cortar conteúdo em silêncio. */
async function fitToSource(
  editedBuf: Buffer,
  sourceBuf: Buffer,
): Promise<{ buf: Buffer; aspectOk: boolean }> {
  const sharp = (await import('sharp')).default
  const [e, s] = await Promise.all([sharp(editedBuf).metadata(), sharp(sourceBuf).metadata()])
  const sw = s.width ?? 1
  const sh = s.height ?? 1
  const aspE = (e.width ?? 1) / (e.height ?? 1)
  const aspS = sw / sh
  const aspectOk = Math.abs(aspE - aspS) / aspS <= 0.04
  const buf = await sharp(editedBuf)
    .resize(sw, sh, aspectOk ? { fit: 'fill' } : { fit: 'contain', background: { r: 10, g: 10, b: 10 } })
    .toBuffer()
  return { buf, aspectOk }
}

/** Entrega o master lossless enquanto couber no bucket. Uma cadeia de edições
 *  não pode acumular uma geração JPEG por passo: cada re-encode degradava
 *  exatamente as áreas que o recompose garantiu intactas. */
async function encodeResultForStorage(buf: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  if (buf.length <= STORAGE_MAX_BYTES) return buf
  for (const quality of [92, 86, 80, 72]) {
    const out = await sharp(buf).jpeg({ quality, mozjpeg: true }).keepMetadata().toBuffer()
    if (out.length <= STORAGE_MAX_BYTES) return out
  }
  const meta = await sharp(buf).metadata()
  let width = meta.width ?? 0
  for (let i = 0; i < 6 && width > 1; i++) {
    width = Math.round(width * 0.85)
    const out = await sharp(buf)
      .resize({ width })
      .jpeg({ quality: 82, mozjpeg: true })
      .keepMetadata()
      .toBuffer()
    if (out.length <= STORAGE_MAX_BYTES) return out
  }
  return sharp(buf)
    .resize({ width: Math.max(1, width) })
    .jpeg({ quality: 60, mozjpeg: true })
    .keepMetadata()
    .toBuffer()
}

export interface EditV4RunInput {
  request: EditV4Request
  /** Instrução já em inglês (ou crua — as cláusulas do prompt seguram). */
  instructionEn: string
  /** Rota primária do motor; a outra é o fallback por erro. */
  primaryRoute: EditV4Provider
  /** Desenha o contorno da seleção na imagem enviada. */
  drawOutline: boolean
  /** Roda o gate semântico (visão) depois de entregar. */
  semanticGate: boolean
  uploadAsset: (buffer: Buffer, kind: 'result' | 'crop' | 'crop-mask') => Promise<string>
}

export interface EditV4RunResult {
  resultUrl: string | null
  rejected: boolean
  rejectReasons: string[]
  provider: EditV4Provider | null
  model: 'seedream-5-pro-edit' | null
  requestId: string | null
  usedFallback: boolean
  usedCrop: boolean
  usedOutline: boolean
  metrics: {
    outOfMaskDelta: number | null
    inMaskDelta: number | null
    maskCoverage: number | null
    outlineLeak: number | null
  }
  semantic: { pass: boolean; reasons: string[]; skipped: boolean } | null
  cost: { usd: number; outputPixels: number; durationMs: number }
  outputDims: { width: number; height: number } | null
}

export async function runEditV4(input: EditV4RunInput): Promise<EditV4RunResult> {
  const { request } = input
  const sharp = (await import('sharp')).default

  // ── 1. Busca segura ────────────────────────────────────────────────────────
  assertSafeImageUrl(request.sourceImageUrl)
  if (request.maskUrl) assertSafeImageUrl(request.maskUrl)
  for (const ref of request.references) assertSafeImageUrl(ref.url)

  // Origem normalizada ANTES de tudo (rotação EXIF + ICC→sRGB, sem resize). O
  // recompose mistura pixels da origem com a saída sRGB do modelo: em origem
  // P3/Adobe RGB o trecho editado destoava em cor. Motor, recompose, gates e
  // entrega leem todos o MESMO buffer normalizado.
  const sourceRaw = await fetchImageBuffer(request.sourceImageUrl)
  const normalized = await normalizeSourceImage(sourceRaw, {
    maxLongSide: null,
    maxBytes: Number.MAX_SAFE_INTEGER,
  })
  const sourceBuf = normalized.buffer
  let normalizedSourceUrl = request.sourceImageUrl
  if (normalized.transforms.length > 0) {
    console.log('[edit-v4] origem normalizada:', normalized.transforms.join('+'))
    normalizedSourceUrl = await input.uploadAsset(sourceBuf, 'crop')
  }
  const hasMask = !!request.maskUrl

  // ── 2. Seleção ─────────────────────────────────────────────────────────────
  let maskBuf: Buffer | null = null
  let maskCoverage: number | null = null
  if (request.maskUrl) {
    const rawMask = await fetchImageBuffer(request.maskUrl)
    let rawMeta: import('sharp').Metadata
    try {
      rawMeta = await sharp(rawMask).metadata()
    } catch {
      throw new EditV3InputError('Seleção inválida. Refaça a seleção sobre a imagem atual.')
    }
    // Máscara degenerada (1×1) é o sentinel do editor v1 e serviria de bypass da
    // preservação: rejeitada antes de qualquer outra checagem.
    if ((rawMeta.width ?? 0) <= 1 || (rawMeta.height ?? 0) <= 1) {
      throw new EditV3InputError('Seleção inválida. Marque a área que deseja alterar.')
    }
    await assertMaskMatchesImage(rawMask, sourceBuf)
    maskBuf = await normalizeMaskToImage(rawMask, sourceBuf)
    if (DILATES_MASK[request.action]) {
      maskBuf = await dilateMask(maskBuf)
    }
    maskCoverage = await maskWhiteRatio(maskBuf)
    if (maskCoverage <= 0) {
      throw new EditV3InputError('A seleção está vazia. Marque a área que deseja editar.')
    }
    if (maskCoverage > MAX_MASK_COVERAGE) {
      throw new EditV3InputError(
        'A seleção cobre quase toda a imagem. Marque apenas a área que deseja alterar.',
      )
    }
  }

  // ── 3. Crop da região ──────────────────────────────────────────────────────
  // O motor recebe só a área editada (bbox + 25%) e gasta todo o orçamento de
  // pixels nela. `maxMegapixels` no teto da faixa barata: mandar mais que o
  // modelo devolve é banda desperdiçada.
  let providerImageUrl = normalizedSourceUrl
  let providerImageBuf = sourceBuf
  let cropRegion: CropRegion | null = null
  let providerMaskBuf: Buffer | null = maskBuf
  let providerDims: { width: number; height: number }
  {
    const srcMeta = await sharp(sourceBuf).metadata()
    providerDims = { width: srcMeta.width ?? 0, height: srcMeta.height ?? 0 }
  }
  if (maskBuf) {
    const srcArea = providerDims.width * providerDims.height
    const plan = await planCrop({
      imageBuffer: sourceBuf,
      maskBuffer: maskBuf,
      maxMegapixels: SEEDREAM_LOW_TIER_MAX_PIXELS / 1_000_000,
    })
    if (plan && srcArea > 0 && (plan.region.width * plan.region.height) / srcArea <= CROP_MAX_AREA_RATIO) {
      const [cropImg, cropMask] = await Promise.all([
        extractCrop(sourceBuf, plan),
        extractCrop(maskBuf, plan),
      ])
      cropRegion = plan.region
      providerImageBuf = cropImg
      providerMaskBuf = cropMask
      providerDims = { width: plan.outWidth, height: plan.outHeight }
    }
  }

  // ── 4. Contorno desenhado ──────────────────────────────────────────────────
  const useOutline = input.drawOutline && !!providerMaskBuf
  if (useOutline && providerMaskBuf) {
    providerImageBuf = await drawSelectionOutline(providerImageBuf, providerMaskBuf)
  }
  // Sobe a imagem que o motor vai ver — sempre, quando houve crop ou contorno
  // (o buffer local deixou de corresponder à URL da origem).
  if (cropRegion || useOutline) {
    providerImageUrl = await input.uploadAsset(providerImageBuf, 'crop')
  }

  // ── 5. Prompt ──────────────────────────────────────────────────────────────
  const regionTag = providerMaskBuf
    ? await seedreamRegionTag(providerMaskBuf, providerDims.width, providerDims.height)
    : null
  // Sem seleção o modelo é o único responsável pelo confinamento: preservação
  // máxima e intensidade no máximo "standard" (frame inteiro + intensidade
  // forte é a combinação que mais destrói projeto).
  const promptPreservation = hasMask ? request.preservation : 'maximum'
  const promptIntensity = !hasMask && request.intensity === 'strong' ? 'standard' : request.intensity
  const prompt = buildEditV4Prompt({
    action: request.action,
    instructionEn: input.instructionEn,
    preservation: promptPreservation,
    intensity: promptIntensity,
    references: request.references,
    regionTag,
    hasOutline: useOutline,
  })

  // ── 6. Motor ───────────────────────────────────────────────────────────────
  const outputSize = outputSizeForCrop(providerDims.width, providerDims.height)
  console.log(
    `[edit-v4] motor rota=${input.primaryRoute} acao=${request.action} crop=${cropRegion !== null} ` +
    `entrada=${providerDims.width}x${providerDims.height} saida=${outputSize.width}x${outputSize.height} ` +
    `regiao=${regionTag ?? 'nenhuma'} contorno=${useOutline}`,
  )
  const engineOut = await runSeedreamEdit(
    {
      imageUrl: providerImageUrl,
      imageWidth: providerDims.width,
      imageHeight: providerDims.height,
      references: request.references.map(r => ({ url: r.url })),
      prompt,
    },
    { primary: input.primaryRoute, outputSize },
  )
  const editedBuf = await fetchImageBuffer(engineOut.imageRef)

  // ── 7. Recompose + gates ───────────────────────────────────────────────────
  const reasons: string[] = []
  let resultBuf: Buffer
  let outOfMaskDelta: number | null = null
  let inMaskDelta: number | null = null

  if (maskBuf) {
    const region = cropRegion ?? (await fullRegion(sourceBuf))
    const softEdges = request.edgeSoftness === 'soft'
    resultBuf = await recomposeMasked({
      originalBuffer: sourceBuf,
      editedCropBuffer: editedBuf,
      maskBuffer: maskBuf,
      region,
      softEdges,
    })
    ;[outOfMaskDelta, inMaskDelta] = await Promise.all([
      // A régua acompanha a BORDA escolhida: borda macia precisa da folga do
      // feather; borda dura mede contra a máscara já dilatada, régua rígida e
      // sem falso positivo.
      measureOutOfMaskDrift({
        originalBuffer: sourceBuf,
        resultBuffer: resultBuf,
        maskBuffer: maskBuf,
        softEdges,
      }),
      measureInMaskChange({
        originalBuffer: sourceBuf,
        resultBuffer: resultBuf,
        maskBuffer: maskBuf,
      }),
    ])
    const { outOfMask, noChangeFloor } = gateThresholds({
      preservation: request.preservation,
      edgeSoftness: request.edgeSoftness,
    })
    if (outOfMaskDelta > outOfMask) reasons.push('out_of_mask_drift')
    if (inMaskDelta < noChangeFloor) reasons.push('no_change')
  } else {
    const fitted = await fitToSource(editedBuf, sourceBuf)
    resultBuf = fitted.buf
    if (!fitted.aspectOk) reasons.push('framing_changed')
    const globalChange = await measureGlobalChange(sourceBuf, resultBuf)
    inMaskDelta = globalChange
    const { globalNoChangeFloor, blowupCeiling } = instructedGateThresholds()
    if (globalChange < globalNoChangeFloor) reasons.push('no_change')
    if (globalChange > blowupCeiling) reasons.push('global_redesign')
  }

  // Vazamento do contorno: o modelo desenhou o marcador em vez de entendê-lo.
  // Cai dentro da seleção, então o recompose o entrega — só este gate o pega.
  let outlineLeak: number | null = null
  if (useOutline) {
    outlineLeak = await outlineLeakRatio(resultBuf)
    if (outlineLeak > OUTLINE_LEAK_CEILING) reasons.push('outline_leak')
  }

  // ── 8. Entrega ─────────────────────────────────────────────────────────────
  const storageBuf = await encodeResultForStorage(resultBuf)
  const resultUrl = await input.uploadAsset(storageBuf, 'result')
  const outMeta = await sharp(storageBuf).metadata()

  // ── 9. Gate semântico (best-effort) ────────────────────────────────────────
  // Com seleção é ADVISORY: o recompose já garantiu os pixels de fora, e o aviso
  // cobre o dentro (material errado, artefato). Sem seleção ele REJEITA — é a
  // única proteção fina do modo. Depende do Gemini; indisponível → `skipped`.
  let semantic: EditV4RunResult['semantic'] = null
  if (input.semanticGate && input.instructionEn.trim()) {
    const verdict = await evaluateEditSemantics({
      originalUrl: normalizedSourceUrl,
      editedUrl: resultUrl,
      referenceUrl: request.references[0]?.url ?? null,
      instructionEn: input.instructionEn,
      intent: INTENT_FOR_ACTION[request.action],
      enabled: true,
      timeoutMs: 20_000,
    })
    semantic = { pass: verdict.pass, reasons: verdict.reasons, skipped: verdict.skipped }
    if (!hasMask && !verdict.pass && !verdict.skipped) {
      for (const r of verdict.reasons) reasons.push(`semantic_${r}`)
    }
  }

  return {
    resultUrl,
    rejected: reasons.length > 0,
    rejectReasons: reasons,
    provider: engineOut.provider,
    model: engineOut.model,
    requestId: engineOut.requestId,
    usedFallback: engineOut.usedFallback,
    usedCrop: cropRegion !== null,
    usedOutline: useOutline,
    metrics: { outOfMaskDelta, inMaskDelta, maskCoverage, outlineLeak },
    semantic,
    cost: {
      usd: engineOut.costUsd,
      outputPixels: engineOut.outputWidth * engineOut.outputHeight,
      durationMs: engineOut.durationMs,
    },
    outputDims:
      outMeta.width && outMeta.height ? { width: outMeta.width, height: outMeta.height } : null,
  }
}
