// lib/edit-v3/pipeline.ts
//
// Pipeline server-side do Editar V3: busca segura → validação/normalização de
// máscara → prompt rígido → chamada ao motor Google (fallback FAL opcional) →
// RECOMPOSE (o output só entra DENTRO da seleção) → gates de pixels → upload.
//
// Princípio central: o modelo re-sintetiza a cena inteira, então a preservação
// fora da máscara é GARANTIDA pelo recompose server-side, não pelo modelo. Reusa
// os helpers battle-tested do v1 (lib/spaces/edit-crop.ts) que carregam 3 lições
// pagas com drift real: PNG lossless + alpha materializado antes do joinChannel
// + keepMetadata (ICC). edit-crop NÃO é alterado (import read-only).

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
import {
  editImageWithGoogle,
  GoogleEditError,
  type GoogleImageModel,
} from '@/lib/ai/google/editImage'
import { editImageWithFal, FalEditError } from '@/lib/ai/fal/editImage'
import { editImageWithSeedream, seedreamRegionTag } from '@/lib/ai/fal/seedreamEdit'
import { buildEditPrompt, buildSeedreamEditPrompt, buildStrictRetryPrompt } from './buildEditPrompt'
import { outputImageCostUsd } from './pricing'
import { assertSafeImageUrl, EditV3InputError } from './ssrf'
import { editV3SemanticGateEnabled } from './flags'
import { evaluateEditSemantics } from '@/lib/edit-v2/semantic-gate'
import type { EditIntentV2 } from '@/lib/edit-v2/types'
import { normalizeSourceImage } from '@/lib/storage/normalize-image'
import type {
  EditV3Action,
  EditV3Engine,
  EditV3Intensity,
  EditV3Provider,
  EditV3Model,
  EditV3Request,
  EditV3Resolution,
} from './types'

/** Falha terminal de geração (Google e — se ligado — FAL falharam). */
export class EditV3GenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditV3GenerationError'
  }
}

// Ações que se FUNDEM ao entorno (feather na recomposição). Remoção/refino usam
// borda DURA (preservação pixel-perfeita).
const BLEND_ACTIONS: ReadonlySet<EditV3Action> = new Set(['swap_material', 'insert_element'])
// Ações que ajudam com dilatação leve da máscara (objeto/artefato sem contorno exato).
const DILATE_ACTIONS: ReadonlySet<EditV3Action> = new Set(['remove', 'refine_area'])

// Mapeia a ação V3 pro vocabulário V2 (normalizer + gate semântico reusados).
export const INTENT_FOR_ACTION: Record<EditV3Action, EditIntentV2> = {
  remove:         'remove_element',
  swap_material:  'swap_material',
  insert_element: 'insert_element',
  refine_area:    'fix_image',
}

// Crop só quando a região (bbox da seleção + 25% de padding) é meaningfully
// menor que a imagem — acima disso o crop é a imagem inteira com custo extra.
const CROP_MAX_AREA_RATIO = 0.8

// Rejeições de pixel que valem UM retry com prompt estrito (drift/enquadramento).
// 'no_change' fica de fora: o prompt estrito reforça preservação — o oposto do
// que um no-op precisa.
const PIXEL_RETRYABLE: ReadonlySet<string> = new Set([
  'out_of_mask_drift',
  'framing_changed',
  'global_redesign',
])

// Limite do bucket de resultado (space-mestres) ~15 MB; alvo conservador.
const STORAGE_MAX_BYTES = 14 * 1024 * 1024

// Teto de cobertura: acima disto a seleção é praticamente a imagem toda — não é
// "editar só a área marcada", recomporia o frame inteiro e o gate de drift (zero
// pixels fora) não pegaria. Fecha também o bypass do sentinel 1×1 do v1/v2.
const MAX_MASK_COVERAGE = 0.985

/** Gates fora-da-máscara por preservação × tipo (com recompose o drift real ≈0;
 *  estes são backstops catastróficos, política "bloquear menos, avisar mais"). */
export function gateThresholds(opts: {
  action: EditV3Action
  preservation: EditV3Request['preservation']
}): { outOfMask: number; noChangeFloor: number } {
  const blend = BLEND_ACTIONS.has(opts.action)
  const outOfMask =
    opts.preservation === 'maximum' ? (blend ? 0.1 : 0.05) : blend ? 0.15 : 0.1
  return { outOfMask, noChangeFloor: 0.005 }
}

/** Gates do modo SEM máscara (instrução). Sem recompose não há "fora da máscara":
 *  determinísticamente só dá pra pegar CATÁSTROFE sem falso-positivo — no-op
 *  (modelo devolveu a entrada / recusou) e troca-total da imagem. A preservação
 *  FINA (redesign sutil) é apostada no prompt rígido + (Fase 1.5) no gate
 *  semântico VLM. Limiares conservadores: nunca rejeitar edição legítima. */
function noMaskGateThresholds(): { globalNoChangeFloor: number; blowupCeiling: number } {
  return { globalNoChangeFloor: 0.004, blowupCeiling: 0.92 }
}

/** Fração de pixels (0–1) que mudaram entre original e resultado na imagem TODA
 *  (régua global do modo sem máscara). Downscale 512² (fit:fill iguala dims) +
 *  delta por canal > 12. */
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
    if (Math.abs(a[i] - b[i]) > 12 || Math.abs(a[i + 1] - b[i + 1]) > 12 || Math.abs(a[i + 2] - b[i + 2]) > 12) changed++
  }
  return px > 0 ? changed / px : 0
}

/** Ajusta o output do provider às dims da origem SEM cortar nem distorcer (modo
 *  sem máscara). Se o aspecto bate (~4%, o caso comum: o Gemini ecoa o aspecto),
 *  usa fit:'fill' (sem corte/distorção). Se NÃO bate, o modelo mudou o
 *  enquadramento — letterbox (contain) só p/ preview e sinaliza aspectOk=false
 *  para o gate rejeitar (em vez de cortar conteúdo silenciosamente). */
async function fitToSource(editedBuf: Buffer, sourceBuf: Buffer): Promise<{ buf: Buffer; aspectOk: boolean }> {
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

export interface EditV3RunInput {
  request: EditV3Request
  /** Instrução já em inglês (ou crua — as cláusulas garantem o contrato). */
  instructionEn: string
  model: GoogleImageModel
  resolution: EditV3Resolution
  /** Permite fallback FAL quando o Google falha. */
  falFallback: boolean
  /** Motor principal (PROTÓTIPO): 'seedream' = Seedream 5.0 Pro Edit com a
   *  seleção como tag <bbox>; falha cai no Google. Default 'google'. */
  engine?: EditV3Engine
  /** Re-hospeda buffers (crop da origem, máscara efetiva, resultado) no
   *  Storage do produto. */
  uploadAsset: (buffer: Buffer, kind: 'result' | 'crop' | 'crop-mask') => Promise<string>
}

export interface EditV3RunResult {
  resultUrl: string | null
  rejected: boolean
  rejectReasons: string[]
  provider: EditV3Provider | null
  model: EditV3Model | null
  requestId: string | null
  usedFallback: boolean
  metrics: {
    outOfMaskDelta: number | null
    inMaskDelta: number | null
    maskCoverage: number | null
  }
  /** true = a 1ª tentativa reprovou no gate de pixels e a entrega veio do
   *  retry com prompt estrito. */
  retried: boolean
  /** true = o provider recebeu só o CROP da seleção (bbox+25%) — o budget de
   *  resolução do modelo é gasto na região editada, não no frame inteiro. */
  usedCrop: boolean
  /** Veredito do gate semântico (Gemini vision, best-effort). null = desligado
   *  ou indisponível. */
  semantic: { pass: boolean; reasons: string[]; skipped: boolean } | null
  stages: {
    provider: {
      durationMs: number
      promptTokens: number | null
      outputTokens: number | null
      totalTokens: number | null
      /** Custo USD real dos tokens de SAÍDA (Google); null no fallback FAL. */
      realCostUsd: number | null
    }
  }
  outputDims: { width: number; height: number } | null
}

/** Entrega o resultado como MASTER LOSSLESS (o PNG do recompose) enquanto
 *  couber no bucket — a cadeia de edições deixa de acumular uma geração JPEG
 *  por edição (cada re-encode q92 do frame inteiro degradava exatamente as
 *  áreas que o recompose garantiu intactas). JPEG de alta qualidade só como
 *  fallback de tamanho. Feito DEPOIS dos gates — não afeta drift. */
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
    const out = await sharp(buf).resize({ width }).jpeg({ quality: 82, mozjpeg: true }).keepMetadata().toBuffer()
    if (out.length <= STORAGE_MAX_BYTES) return out
  }
  return sharp(buf).resize({ width: Math.max(1, width) }).jpeg({ quality: 60, mozjpeg: true }).keepMetadata().toBuffer()
}

export async function runEditV3(input: EditV3RunInput): Promise<EditV3RunResult> {
  const { request } = input
  const sharp = (await import('sharp')).default

  // 1. Busca segura (principal + máscara + referências)
  assertSafeImageUrl(request.sourceImageUrl)
  if (request.maskUrl) assertSafeImageUrl(request.maskUrl)
  for (const ref of request.references) assertSafeImageUrl(ref.url)

  // Origem normalizada ANTES de tudo: rotação EXIF + ICC→sRGB, SEM resize (o
  // crop da seleção abaixo é quem limita o que vai ao modelo). Elimina o shift
  // de cor confinado à seleção: o recompose mistura pixels da origem com o
  // output sRGB sem tag do modelo — em origem P3/Adobe RGB o patch destoava.
  // Provider, recompose, gates e entrega leem o MESMO buffer normalizado.
  const sourceRaw = await fetchImageBuffer(request.sourceImageUrl)
  const normalizedSource = await normalizeSourceImage(sourceRaw, {
    maxLongSide: null,
    maxBytes: Number.MAX_SAFE_INTEGER,
  })
  const sourceBuf = normalizedSource.buffer
  if (normalizedSource.transforms.length > 0) {
    console.log('[edit-v3] source normalizado:', normalizedSource.transforms.join('+'))
  }
  // URL da origem que provider (caminho sem crop) e gate semântico enxergam —
  // precisa ser o MESMO pixel-space do recompose, senão máscara/vereditos
  // desalinham quando a normalização mexeu na imagem.
  let normalizedSourceUrl = request.sourceImageUrl
  if (normalizedSource.transforms.length > 0) {
    normalizedSourceUrl = await input.uploadAsset(sourceBuf, 'crop')
  }
  const hasMask = !!request.maskUrl

  // 2. Máscara (quando houver): valida proporção → normaliza às dims → dilata
  //    (remove/refino) → rejeita vazia/total → re-hospeda se mutada.
  let maskBuf: Buffer | null = null
  let providerMaskUrl: string | undefined
  let maskCoverage: number | null = null
  if (request.maskUrl) {
    const rawMask = await fetchImageBuffer(request.maskUrl)
    // V3 NUNCA usa o sentinel 1×1 — rejeita máscara ilegível/degenerada ANTES do
    // assert (que daria early-return pro sentinel) — fecha o bypass da preservação.
    let rawMaskMeta: import('sharp').Metadata
    try {
      rawMaskMeta = await sharp(rawMask).metadata()
    } catch {
      throw new EditV3InputError('Seleção inválida. Refaça a seleção sobre a imagem atual.')
    }
    if ((rawMaskMeta.width ?? 0) <= 1 || (rawMaskMeta.height ?? 0) <= 1) {
      throw new EditV3InputError('Seleção inválida. Pinte a área que deseja alterar.')
    }
    await assertMaskMatchesImage(rawMask, sourceBuf)
    maskBuf = await normalizeMaskToImage(rawMask, sourceBuf)
    if (DILATE_ACTIONS.has(request.action)) {
      maskBuf = await dilateMask(maskBuf)
    }
    maskCoverage = await maskWhiteRatio(maskBuf)
    if (maskCoverage <= 0) {
      throw new EditV3InputError('A seleção está vazia. Pinte a área que deseja editar.')
    }
    if (maskCoverage > MAX_MASK_COVERAGE) {
      throw new EditV3InputError('A seleção cobre quase toda a imagem. Selecione apenas a área que deseja alterar.')
    }
    providerMaskUrl = request.maskUrl
    if (!maskBuf.equals(rawMask)) {
      providerMaskUrl = await input.uploadAsset(maskBuf, 'crop-mask')
    }
  }

  // CROP da seleção (bbox + 25% de padding — regressão do v1 restaurada): o
  // provider recebe só a região editada e gasta o budget de resolução
  // (1K/2K/4K) nela, em vez de diluí-lo no frame inteiro e devolver um patch
  // esticado/borrado no recompose. Bônus estrutural: o featherSigma do
  // recompose deriva da REGIÃO → proporcional à seleção, não à imagem (o
  // vazamento de material de ~70 px em imagens grandes desaparece).
  let providerImageUrl = normalizedSourceUrl
  let cropRegion: CropRegion | null = null
  // Máscara e dimensões NO ESPAÇO da imagem enviada ao provider (crop ou origem)
  // — base da tag <bbox> do Seedream.
  let providerMaskBuf: Buffer | null = maskBuf
  let providerDims: { width: number; height: number } | null = null
  if (maskBuf) {
    const srcMeta = await sharp(sourceBuf).metadata()
    const srcArea = (srcMeta.width ?? 0) * (srcMeta.height ?? 0)
    const plan = await planCrop({ imageBuffer: sourceBuf, maskBuffer: maskBuf })
    if (plan && srcArea > 0 && (plan.region.width * plan.region.height) / srcArea <= CROP_MAX_AREA_RATIO) {
      const [cropImg, cropMask] = await Promise.all([
        extractCrop(sourceBuf, plan),
        extractCrop(maskBuf, plan),
      ])
      ;[providerImageUrl, providerMaskUrl] = await Promise.all([
        input.uploadAsset(cropImg, 'crop'),
        input.uploadAsset(cropMask, 'crop-mask'),
      ])
      cropRegion = plan.region
      providerMaskBuf = cropMask
      providerDims = { width: plan.outWidth, height: plan.outHeight }
    }
  }

  // 3. Prompt rígido por ação. SEM máscara: força preservação MÁXIMA + clampa
  //    intensidade forte (whole-frame + forte é o combo mais arriscado).
  const promptPreservation = hasMask ? request.preservation : 'maximum'
  const promptIntensity: EditV3Intensity =
    !hasMask && request.intensity === 'strong' ? 'standard' : request.intensity
  const prompt = buildEditPrompt({
    action: request.action,
    instructionEn: input.instructionEn,
    preservation: promptPreservation,
    intensity: promptIntensity,
    hasMask,
    references: request.references,
  })

  // Prompt do Seedream (PROTÓTIPO, EDIT_V3_ENGINE=seedream): a seleção vira a
  // caixa envolvente da máscara como tag <bbox> (0–999) no espaço da imagem
  // enviada. O recompose abaixo segue garantindo os pixels fora da máscara.
  const engine: EditV3Engine = input.engine ?? 'google'
  let seedreamPrompt: string | null = null
  if (engine === 'seedream') {
    if (!providerDims) {
      const m = await sharp(sourceBuf).metadata()
      providerDims = { width: m.width ?? 0, height: m.height ?? 0 }
    }
    const regionTag = providerMaskBuf
      ? await seedreamRegionTag(providerMaskBuf, providerDims.width, providerDims.height)
      : null
    seedreamPrompt = buildSeedreamEditPrompt({
      action: request.action,
      instructionEn: input.instructionEn,
      preservation: promptPreservation,
      intensity: promptIntensity,
      hasMask,
      references: request.references,
      regionTag,
    })
    console.log(`[edit-v3] engine=seedream region=${regionTag ?? 'none'} dims=${providerDims.width}x${providerDims.height} crop=${cropRegion !== null}`)
  }

  // 4. Motor (Google, fallback FAL opcional) — encapsulado pra permitir o
  //    retry estrito sem duplicar o tratamento de erro.
  interface ProviderOut {
    provider: EditV3Provider
    model: EditV3Model
    requestId: string | null
    usedFallback: boolean
    editedBuf: Buffer
    promptTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    /** Custo USD por imagem (providers cobrados por imagem, ex.: Seedream). */
    costUsd: number | null
  }
  const callProvider = async (activePrompt: string, activeSeedreamPrompt: string | null = null): Promise<ProviderOut> => {
    // Motor Seedream (PROTÓTIPO): tenta primeiro; falha cai no Google abaixo.
    let seedreamFailed = false
    if (engine === 'seedream' && activeSeedreamPrompt && providerDims) {
      try {
        const out = await editImageWithSeedream({
          imageUrl: providerImageUrl,
          imageWidth: providerDims.width,
          imageHeight: providerDims.height,
          references: request.references.map(r => ({ url: r.url })),
          prompt: activeSeedreamPrompt,
          resolution: input.resolution,
        })
        return {
          provider: 'fal',
          model: out.model,
          requestId: out.requestId,
          usedFallback: false,
          editedBuf: await fetchImageBuffer(out.imageRef),
          promptTokens: null,
          outputTokens: null,
          totalTokens: null,
          costUsd: out.costUsd,
        }
      } catch (seedErr) {
        seedreamFailed = true
        console.warn('[edit-v3] Seedream falhou, caindo no Google:', (seedErr as Error).message)
      }
    }
    try {
      const out = await editImageWithGoogle({
        imageUrl: providerImageUrl,
        maskUrl: providerMaskUrl,
        references: request.references.map(r => ({ url: r.url })),
        prompt: activePrompt,
        model: input.model,
        resolution: input.resolution,
      })
      return {
        provider: 'google',
        model: out.model,
        requestId: out.requestId,
        usedFallback: seedreamFailed,
        editedBuf: await fetchImageBuffer(out.imageRef),
        promptTokens: out.promptTokens,
        outputTokens: out.outputTokens,
        totalTokens: out.totalTokens,
        costUsd: null,
      }
    } catch (googleErr) {
      if (!(input.falFallback && googleErr instanceof GoogleEditError)) {
        throw googleErr
      }
      console.warn('[edit-v3] Google falhou, tentando fallback FAL:', (googleErr as Error).message)
      try {
        const out = await editImageWithFal({
          imageUrl: providerImageUrl,
          maskUrl: providerMaskUrl,
          references: request.references.map(r => ({ url: r.url })),
          prompt: activePrompt,
        })
        return {
          provider: 'fal',
          model: out.model,
          requestId: out.requestId,
          usedFallback: true,
          editedBuf: await fetchImageBuffer(out.imageRef),
          promptTokens: null,
          outputTokens: null,
          totalTokens: null,
          costUsd: null,
        }
      } catch (falErr) {
        const fe = falErr instanceof FalEditError ? falErr.message : String(falErr)
        throw new EditV3GenerationError(`Google e fallback FAL falharam (${fe}).`)
      }
    }
  }

  // 5. Composição + gates (dois caminhos), também encapsulados pro retry.
  interface Composed {
    resultBuf: Buffer
    outOfMaskDelta: number | null
    inMaskDelta: number | null
    reasons: string[]
  }
  const composeAndGate = async (editedBuf: Buffer): Promise<Composed> => {
    const reasons: string[] = []
    if (maskBuf) {
      // COM máscara: o output (patch do crop ou frame inteiro) só entra DENTRO
      // da seleção (garantia de servidor). region = crop quando houve.
      const region = cropRegion ?? await fullRegion(sourceBuf)
      const softEdges = BLEND_ACTIONS.has(request.action)
      const resultBuf = await recomposeMasked({
        originalBuffer: sourceBuf,
        editedCropBuffer: editedBuf,
        maskBuffer: maskBuf,
        region,
        softEdges,
      })
      const [outOfMaskDelta, inMaskDelta] = await Promise.all([
        // softEdges na MEDIÇÃO acompanha a AÇÃO (padrão v1): blend precisa da
        // folga do feather; remove/refino medem contra a máscara JÁ dilatada —
        // régua dura sem falso positivo, e o gate volta a enxergar a borda da
        // seleção (antes, softEdges fixo em true cegava ~100-200 px em volta).
        measureOutOfMaskDrift({ originalBuffer: sourceBuf, resultBuffer: resultBuf, maskBuffer: maskBuf, softEdges }),
        measureInMaskChange({ originalBuffer: sourceBuf, resultBuffer: resultBuf, maskBuffer: maskBuf }),
      ])
      const { outOfMask, noChangeFloor } = gateThresholds({ action: request.action, preservation: request.preservation })
      if (outOfMaskDelta > outOfMask) reasons.push('out_of_mask_drift')
      if (inMaskDelta < noChangeFloor) reasons.push('no_change')
      return { resultBuf, outOfMaskDelta, inMaskDelta, reasons }
    }
    // SEM máscara (instrução): sem recompose. fitToSource preserva dims/aspecto
    // da origem. Gates determinísticos pegam catástrofe; a preservação fina é o
    // gate semântico abaixo.
    const fitted = await fitToSource(editedBuf, sourceBuf)
    if (!fitted.aspectOk) reasons.push('framing_changed')
    const globalChange = await measureGlobalChange(sourceBuf, fitted.buf)
    const { globalNoChangeFloor, blowupCeiling } = noMaskGateThresholds()
    if (globalChange < globalNoChangeFloor) reasons.push('no_change')
    if (globalChange > blowupCeiling) reasons.push('global_redesign')
    return { resultBuf: fitted.buf, outOfMaskDelta: null, inMaskDelta: globalChange, reasons }
  }

  // Tentativa 1 → se reprovar por drift/enquadramento, UM retry com o prompt
  // estrito (buildStrictRetryPrompt — escrito no V3 e nunca chamado até aqui).
  // Nunca cobra: o retry é interno; se ainda reprovar, entrega a MELHOR
  // tentativa como rejeitada (refazer é grátis).
  const sumTok = (a: number | null, b: number | null) =>
    a == null && b == null ? null : (a ?? 0) + (b ?? 0)
  const providerStart = Date.now()
  const first = await callProvider(prompt, seedreamPrompt)
  const firstComp = await composeAndGate(first.editedBuf)
  let perImageCostUsd = first.costUsd ?? 0
  let chosenProv = first
  let chosenComp = firstComp
  let promptTokens = first.promptTokens
  let outputTokens = first.outputTokens
  let totalTokens = first.totalTokens
  let retried = false
  const retryReasons = firstComp.reasons.filter(r => PIXEL_RETRYABLE.has(r))
  if (retryReasons.length > 0) {
    try {
      const second = await callProvider(
        buildStrictRetryPrompt(prompt, retryReasons),
        seedreamPrompt ? buildStrictRetryPrompt(seedreamPrompt, retryReasons) : null,
      )
      const secondComp = await composeAndGate(second.editedBuf)
      perImageCostUsd += second.costUsd ?? 0
      // Tokens/custo somam as DUAS tentativas (gasto real do job).
      promptTokens = sumTok(first.promptTokens, second.promptTokens)
      outputTokens = sumTok(first.outputTokens, second.outputTokens)
      totalTokens  = sumTok(first.totalTokens, second.totalTokens)
      const secondBetter =
        secondComp.reasons.length < firstComp.reasons.length ||
        (secondComp.reasons.length === firstComp.reasons.length &&
          (secondComp.outOfMaskDelta ?? 0) <= (firstComp.outOfMaskDelta ?? 0))
      if (secondBetter) {
        chosenProv = second
        chosenComp = secondComp
      }
      retried = true
      console.log(`[edit-v3] retry estrito: reasons ${firstComp.reasons.join(',')} → ${secondComp.reasons.join(',') || 'ok'} (entregue: ${secondBetter ? '2ª' : '1ª'})`)
    } catch (retryErr) {
      console.warn('[edit-v3] retry estrito falhou (mantém 1ª tentativa):', (retryErr as Error).message)
    }
  }
  const { provider, model, requestId, usedFallback } = chosenProv
  const reasons = [...chosenComp.reasons]
  const { resultBuf, outOfMaskDelta, inMaskDelta } = chosenComp

  const realCostUsd =
    provider === 'google' && model !== 'nano-banana' && outputTokens != null
      ? outputImageCostUsd(model, outputTokens)
      : model === 'seedream-5-pro-edit'
        ? perImageCostUsd
        : null
  const providerStage = {
    durationMs: Date.now() - providerStart,
    promptTokens,
    outputTokens,
    totalTokens,
    realCostUsd,
  }

  // 6. Upload do resultado (master lossless quando couber no bucket; os gates
  //    já mediram no lossless de qualquer forma)
  const storageBuf = await encodeResultForStorage(resultBuf)
  const resultUrl = await input.uploadAsset(storageBuf, 'result')
  const outMeta = await sharp(storageBuf).metadata()

  // 7. Gate semântico (Gemini vision, best-effort — ver flags.ts). Compara a
  //    origem NORMALIZADA com o resultado final. SEM máscara os reasons entram
  //    na rejeição (única proteção fina do modo — fecha o buraco "restyle
  //    completo passa"); COM máscara vira warning (o recompose já garante os
  //    pixels). Sem instrução não roda: "change_applied" sem pedido é ruído.
  let semantic: EditV3RunResult['semantic'] = null
  if (editV3SemanticGateEnabled() && input.instructionEn.trim()) {
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
    provider,
    model,
    requestId,
    usedFallback,
    metrics: { outOfMaskDelta, inMaskDelta, maskCoverage },
    retried,
    usedCrop: cropRegion !== null,
    semantic,
    stages: { provider: providerStage },
    outputDims: outMeta.width && outMeta.height ? { width: outMeta.width, height: outMeta.height } : null,
  }
}
