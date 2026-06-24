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
  fetchImageBuffer,
  fullRegion,
  measureInMaskChange,
  measureOutOfMaskDrift,
  maskWhiteRatio,
  normalizeMaskToImage,
  recomposeMasked,
} from '@/lib/spaces/edit-crop'
import {
  editImageWithGoogle,
  GoogleEditError,
  type GoogleImageModel,
} from '@/lib/ai/google/editImage'
import { editImageWithFal, FalEditError } from '@/lib/ai/fal/editImage'
import { buildEditPrompt } from './buildEditPrompt'
import { assertSafeImageUrl, EditV3InputError } from './ssrf'
import type {
  EditV3Action,
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

export interface EditV3RunInput {
  request: EditV3Request
  /** Instrução já em inglês (ou crua — as cláusulas garantem o contrato). */
  instructionEn: string
  model: GoogleImageModel
  resolution: EditV3Resolution
  /** Permite fallback FAL quando o Google falha. */
  falFallback: boolean
  /** Re-hospeda buffers (máscara efetiva, resultado) no Storage do produto. */
  uploadAsset: (buffer: Buffer, kind: 'result' | 'crop-mask') => Promise<string>
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
  stages: { provider: { durationMs: number } }
  outputDims: { width: number; height: number } | null
}

/** Re-encoda o resultado (PNG lossless do recompose) para JPEG de alta qualidade
 *  abaixo do limite do bucket. Feito DEPOIS dos gates — não afeta drift. */
async function encodeResultForStorage(buf: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
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

  if (!request.maskUrl) {
    throw new EditV3InputError('Esta edição exige uma área selecionada.')
  }

  const sourceBuf = await fetchImageBuffer(request.sourceImageUrl)

  // 2. Máscara: valida proporção → normaliza às dims → dilata (remove/refino) →
  //    rejeita vazia → re-hospeda se mutada (o provider precisa da versão efetiva).
  const rawMask = await fetchImageBuffer(request.maskUrl)
  // V3 NUNCA usa o sentinel 1×1 ("editar imagem inteira" do v1/v2) — toda ação
  // exige seleção real. Rejeita máscara ilegível ou degenerada ANTES do assert
  // (que daria early-return pro sentinel) — fecha o bypass da preservação.
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
  let maskBuf = await normalizeMaskToImage(rawMask, sourceBuf)
  if (DILATE_ACTIONS.has(request.action)) {
    maskBuf = await dilateMask(maskBuf)
  }
  const maskCoverage = await maskWhiteRatio(maskBuf)
  if (maskCoverage <= 0) {
    throw new EditV3InputError('A seleção está vazia. Pinte a área que deseja editar.')
  }
  if (maskCoverage > MAX_MASK_COVERAGE) {
    throw new EditV3InputError('A seleção cobre quase toda a imagem. Selecione apenas a área que deseja alterar.')
  }
  let providerMaskUrl = request.maskUrl
  if (!maskBuf.equals(rawMask)) {
    providerMaskUrl = await input.uploadAsset(maskBuf, 'crop-mask')
  }

  // 3. Prompt rígido por ação
  const prompt = buildEditPrompt({
    action: request.action,
    instructionEn: input.instructionEn,
    preservation: request.preservation,
    intensity: request.intensity,
    hasMask: true,
    references: request.references,
  })

  // 4. Motor Google (fallback FAL opcional)
  const providerStart = Date.now()
  let provider: EditV3Provider
  let model: EditV3Model
  let requestId: string | null
  let imageRef: string
  let usedFallback = false
  try {
    const out = await editImageWithGoogle({
      imageUrl: request.sourceImageUrl,
      maskUrl: providerMaskUrl,
      references: request.references.map(r => ({ url: r.url })),
      prompt,
      model: input.model,
      resolution: input.resolution,
    })
    provider = 'google'
    model = out.model
    requestId = out.requestId
    imageRef = out.imageRef
  } catch (googleErr) {
    if (!(input.falFallback && googleErr instanceof GoogleEditError)) {
      throw googleErr
    }
    console.warn('[edit-v3] Google falhou, tentando fallback FAL:', (googleErr as Error).message)
    try {
      const out = await editImageWithFal({
        imageUrl: request.sourceImageUrl,
        maskUrl: providerMaskUrl,
        references: request.references.map(r => ({ url: r.url })),
        prompt,
      })
      provider = 'fal'
      model = out.model
      requestId = out.requestId
      imageRef = out.imageRef
      usedFallback = true
    } catch (falErr) {
      const fe = falErr instanceof FalEditError ? falErr.message : String(falErr)
      throw new EditV3GenerationError(`Google e fallback FAL falharam (${fe}).`)
    }
  }
  const providerStage = { durationMs: Date.now() - providerStart }

  const editedBuf = await fetchImageBuffer(imageRef)

  // 5. RECOMPOSE: o output só entra DENTRO da seleção (garantia do produto)
  const region = await fullRegion(sourceBuf)
  const softEdges = BLEND_ACTIONS.has(request.action)
  const resultBuf = await recomposeMasked({
    originalBuffer: sourceBuf,
    editedCropBuffer: editedBuf,
    maskBuffer: maskBuf,
    region,
    softEdges,
  })
  const [outOfMaskDelta, inMaskDelta] = await Promise.all([
    // Tolerância de borda na MEDIÇÃO (absorve a banda de dilatação/feather);
    // o recompose continua duro para remove/refino — só a régua ganha folga.
    measureOutOfMaskDrift({ originalBuffer: sourceBuf, resultBuffer: resultBuf, maskBuffer: maskBuf, softEdges: true }),
    measureInMaskChange({ originalBuffer: sourceBuf, resultBuffer: resultBuf, maskBuffer: maskBuf }),
  ])

  // 6. Gates de pixels (backstop): drift fora + no-op dentro
  const reasons: string[] = []
  const { outOfMask, noChangeFloor } = gateThresholds({ action: request.action, preservation: request.preservation })
  if (outOfMaskDelta > outOfMask) reasons.push('out_of_mask_drift')
  if (inMaskDelta < noChangeFloor) reasons.push('no_change')

  // 7. Upload do resultado (entrega comprimida; gates já mediram no lossless)
  const storageBuf = await encodeResultForStorage(resultBuf)
  const resultUrl = await input.uploadAsset(storageBuf, 'result')
  const outMeta = await sharp(storageBuf).metadata()

  return {
    resultUrl,
    rejected: reasons.length > 0,
    rejectReasons: reasons,
    provider,
    model,
    requestId,
    usedFallback,
    metrics: { outOfMaskDelta, inMaskDelta, maskCoverage },
    stages: { provider: providerStage },
    outputDims: outMeta.width && outMeta.height ? { width: outMeta.width, height: outMeta.height } : null,
  }
}
