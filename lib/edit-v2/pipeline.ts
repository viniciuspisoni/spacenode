// lib/edit-v2/pipeline.ts
//
// Pipeline server-side do Editar v2: busca segura → validação/normalização de
// máscara → chamada ao provider selecionado → recomposição (o output só entra
// DENTRO da seleção) → gates de pixels → gate semântico → upload do resultado.
//
// Princípios do norte aplicados aqui:
//   - preservar o projeto > imagem bonita: gate prefere REJEITAR (sem cobrar);
//   - complexidade no backend: nada disto aparece na UI;
//   - telemetria por etapa SEPARADA (normalizador/provider/gate) com duração e
//     custo, como exigido pelo fundador.
//
// FASE 2 (regras do fundador, 2026-06-12): SEM retry pago automático — se o
// gate reprovar, retorna rejected (cobrança é SIMULADA na rota; nada é
// debitado). O retryPolicy do router fica registrado para a Fase 4.
//
// Reaproveita os helpers battle-tested do v1 (lib/spaces/edit-crop.ts) que
// carregam 3 lições de bugs pagas com drift real: PNG lossless + alpha
// materializado antes do joinChannel + keepMetadata (ICC). v1 NÃO é alterado.

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
  resizeToSource,
} from '@/lib/spaces/edit-crop'
import type { EditV2Flags } from './flags'
import { evaluateEditSemantics } from './semantic-gate'
import { geminiImageEditV2, type GeminiImageModel } from './providers/gemini-image'
import { vertexImagenEditV2 } from './providers/vertex-imagen'
import {
  EditV2ProviderError,
  type EditIntentV2,
  type EditReferenceV2,
  type EditRouteResultV2,
  type ProviderEditOutputV2,
} from './types'

// ---------------------------------------------------------------------------
// Busca segura de imagens (allowlist de hosts — SSRF)
// ---------------------------------------------------------------------------

/** Hosts permitidos para fetch server-side de imagens do cliente: o Storage do
 *  próprio Supabase, o CDN da FAL (histórico legado) e data: (providers). */
export function assertSafeImageUrl(url: string): void {
  if (url.startsWith('data:image/')) return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new EditV2InputError('URL de imagem inválida.')
  }
  if (parsed.protocol !== 'https:') {
    throw new EditV2InputError('Apenas URLs https são aceitas.')
  }
  const host = parsed.hostname.toLowerCase()
  const supabaseHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.toLowerCase()
    } catch {
      return ''
    }
  })()
  const allowed =
    (supabaseHost && host === supabaseHost) ||
    host === 'fal.media' ||
    host.endsWith('.fal.media')
  if (!allowed) {
    throw new EditV2InputError('Origem de imagem não permitida.')
  }
}

export class EditV2InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditV2InputError'
  }
}

// ---------------------------------------------------------------------------
// Contrato do pipeline
// ---------------------------------------------------------------------------

export interface EditV2StageTelemetry {
  durationMs: number
  costUsdEstimated: number
}

export interface EditV2RunInput {
  imageUrl: string
  maskUrl?: string | null
  intent: EditIntentV2
  routing: EditRouteResultV2
  references: EditReferenceV2[]
  flags: EditV2Flags
  /** Instrução EN normalizada (para o gate semântico). */
  instructionEn: string
  /** Re-hospeda buffers intermediários/resultado (Storage público do produto). */
  uploadAsset: (buffer: Buffer, kind: 'result' | 'crop-mask') => Promise<string>
}

export interface EditV2RunResult {
  /** URL pública do resultado (sempre presente em sucesso; em rejeição é o
   *  preview da tentativa reprovada — a rota decide como expor). */
  resultUrl: string | null
  rejected: boolean
  rejectReasons: string[]
  metrics: {
    outOfMaskDelta: number | null
    inMaskDelta: number | null
    maskCoverage: number | null
  }
  stages: {
    provider: EditV2StageTelemetry & {
      provider: ProviderEditOutputV2['provider'] | null
      model: ProviderEditOutputV2['model'] | null
      requestId: string | null
    }
    semanticGate: EditV2StageTelemetry & { skipped: boolean }
  }
  outputDims: { width: number; height: number } | null
  recomposed: boolean
}

// Intenções de "conteúdo" — exigem mudança mínima dentro da seleção (no-op gate).
const CONTENT_INTENTS: ReadonlySet<EditIntentV2> = new Set([
  'swap_material',
  'remove_element',
  'insert_element',
  'fix_image',
])

// Blend (feather na recomposição) — material/inserção se fundem ao entorno;
// remoção/correção usam borda dura (preservação pixel-perfeita).
const BLEND_INTENTS: ReadonlySet<EditIntentV2> = new Set(['swap_material', 'insert_element'])

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

export async function runEditV2(input: EditV2RunInput): Promise<EditV2RunResult> {
  const { routing, intent, flags } = input
  const sharp = (await import('sharp')).default

  // 1. Busca segura da imagem principal (e da máscara, se houver)
  assertSafeImageUrl(input.imageUrl)
  if (input.maskUrl) assertSafeImageUrl(input.maskUrl)
  for (const ref of input.references) assertSafeImageUrl(ref.url)

  const sourceBuf = await fetchImageBuffer(input.imageUrl)

  let maskBuf: Buffer | null = null
  let maskCoverage: number | null = null
  let providerMaskUrl: string | null = input.maskUrl ?? null

  if (input.maskUrl) {
    const rawMask = await fetchImageBuffer(input.maskUrl)
    // Proporção divergente >3% = máscara de outra imagem → erro claro, sem custo.
    await assertMaskMatchesImage(rawMask, sourceBuf)
    maskBuf = await normalizeMaskToImage(rawMask, sourceBuf)
    // Ajuda automática (entrada permissiva): dilatação leve cobre borda/sombra
    // rente — o usuário não precisa pintar com precisão cirúrgica. Remoção E
    // correção (artefatos raramente têm contorno exato).
    if (intent === 'remove_element' || intent === 'fix_image') {
      maskBuf = await dilateMask(maskBuf)
    }
    maskCoverage = await maskWhiteRatio(maskBuf)
    if (maskCoverage <= 0) {
      throw new EditV2InputError('A seleção está vazia. Pinte a área que deseja editar.')
    }
    // Se a máscara foi alterada (normalizada/dilatada), o provider precisa da
    // versão efetiva — re-hospeda e usa a URL nova.
    if (!maskBuf.equals(rawMask)) {
      providerMaskUrl = await input.uploadAsset(maskBuf, 'crop-mask')
    }
  }

  // 2. Chamada ao provider selecionado pelo router (SEM retry pago na Fase 2)
  const providerStart = Date.now()
  let providerOut: ProviderEditOutputV2
  if (routing.selectedProvider === 'vertex-imagen') {
    if (!providerMaskUrl) {
      throw new EditV2InputError('Esta edição exige uma área selecionada.')
    }
    providerOut = await vertexImagenEditV2({
      imageUrl: input.imageUrl,
      maskUrl: providerMaskUrl,
      prompt: routing.normalizedPrompt,
      intent,
      references: input.references,
    })
  } else if (routing.selectedProvider === 'gemini-image') {
    providerOut = await geminiImageEditV2({
      imageUrl: input.imageUrl,
      maskUrl: providerMaskUrl,
      prompt: routing.normalizedPrompt,
      intent,
      references: input.references,
      resolution: routing.loggingData.resolvedResolution,
      model: routing.selectedModel as GeminiImageModel,
    })
  } else {
    // 'fal-fallback' nunca é rota primária; na Fase 2 nem como fallback.
    throw new EditV2ProviderError('fal-fallback', 'config', 'Provider de emergência desativado na Fase 2.')
  }
  const providerStage = {
    durationMs: Date.now() - providerStart,
    costUsdEstimated: providerOut.costUsdEstimated,
    provider: providerOut.provider,
    model: providerOut.model,
    requestId: providerOut.requestId ?? null,
  }

  const editedBuf = await fetchImageBuffer(providerOut.imageDataUrl)

  // 3. Recomposição + métricas de pixel
  let resultBuf: Buffer
  let outOfMaskDelta: number | null = null
  let inMaskDelta: number | null = null
  let recomposed = false

  if (maskBuf) {
    // O output do provider só entra DENTRO da seleção — garantia central do
    // produto, independente do modelo (provado necessário no smoke do Gemini).
    const region = await fullRegion(sourceBuf)
    const softEdges = BLEND_INTENTS.has(intent)
    resultBuf = await recomposeMasked({
      originalBuffer: sourceBuf,
      editedCropBuffer: editedBuf,
      maskBuffer: maskBuf,
      region,
      softEdges,
    })
    recomposed = true
    ;[outOfMaskDelta, inMaskDelta] = await Promise.all([
      measureOutOfMaskDrift({
        originalBuffer: sourceBuf,
        resultBuffer: resultBuf,
        maskBuffer: maskBuf,
        // Tolerância de borda na MEDIÇÃO para todos os tipos (política
        // 2026-06-12): o blur expande a zona "interna" do gate e absorve a
        // banda de dilatação/feather que nós mesmos criamos. A recomposição
        // continua dura para remove/fix — só a régua ganha folga na borda.
        softEdges: true,
      }),
      measureInMaskChange({
        originalBuffer: sourceBuf,
        resultBuffer: resultBuf,
        maskBuffer: maskBuf,
      }),
    ])
  } else {
    // Sem seleção (atmosfera/material global): preserva a resolução da origem;
    // a proteção aqui é prompt + gate semântico (não há "fora da máscara").
    resultBuf = await resizeToSource(editedBuf, sourceBuf)
  }

  // 4. Gates de pixels (decididos pelo router conforme Preservação)
  const reasons: string[] = []
  const { outOfMask, noChangeFloor } = routing.loggingData.gateThresholds
  if (outOfMaskDelta !== null && outOfMaskDelta > outOfMask) {
    reasons.push('out_of_mask_drift')
  }
  if (
    inMaskDelta !== null &&
    CONTENT_INTENTS.has(intent) &&
    inMaskDelta < noChangeFloor
  ) {
    reasons.push('no_change')
  }

  // 5. Upload do resultado (mesmo rejeitado — vira preview de depuração)
  const resultUrl = await input.uploadAsset(resultBuf, 'result')

  // 6. Gate semântico (best-effort; telemetria separada; sem retry na Fase 2)
  const gate = await evaluateEditSemantics({
    originalUrl: input.imageUrl,
    editedUrl: resultUrl,
    referenceUrl: input.references[0]?.url ?? null,
    instructionEn: input.instructionEn,
    intent,
    enabled: flags.semanticGate,
  })
  if (!gate.skipped && !gate.pass) reasons.push(...gate.reasons)

  const outMeta = await sharp(resultBuf).metadata()

  return {
    resultUrl,
    rejected: reasons.length > 0,
    rejectReasons: reasons,
    metrics: { outOfMaskDelta, inMaskDelta, maskCoverage },
    stages: {
      provider: providerStage,
      semanticGate: {
        durationMs: gate.durationMs,
        costUsdEstimated: gate.costUsdEstimated,
        skipped: gate.skipped,
      },
    },
    outputDims: outMeta.width && outMeta.height ? { width: outMeta.width, height: outMeta.height } : null,
    recomposed,
  }
}
