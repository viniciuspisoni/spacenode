// lib/edit-v2/router.ts
//
// Roteador do Editar v2 — função PURA e determinística: tipo de edição +
// máscara + referência + qualidade decidem provider/modelo/preço/gates.
// Sem classifier por keywords (a fonte de roteamento errático do v1 morreu);
// a intenção vem da escolha explícita do usuário, e nuances vêm do normalizador.
//
// Matriz de roteamento (Econômica) — POR EVIDÊNCIA (mini-batch pago de
// 2026-06-12, 3 casos limpos; decisão do fundador na mesma data):
//   fix_image / remove_element  → Vertex Imagen (máscara real) quando ligado e
//                                 sem referência; senão Gemini Flash mascarado.
//                                 Vertex é imbatível em "reconstruir o que
//                                 deveria estar ali" (caso 2: reparo impecável).
//   swap_material (QUALQUER)    → Gemini Flash. O mini-batch provou o Vertex
//                                 fraco para TRANSFORMAR material (caso 3: só
//                                 esquentou o tom). Recompose garante o resto.
//   insert_element              → Gemini Flash (com ou sem referência — Vertex
//                                 insertion não foi validado p/ inserção real).
//   adjust_atmosphere           → Gemini Flash (instrução; máscara opcional).
// Alta precisão: SEMPRE gemini-3-pro-image (mascarado ou instrução).
// Caso especial documentado: REMOÇÃO DE OBJETO LUMINOSO/reflexivo — o brilho
// projetado fora da máscara força o modelo a "explicar" a luz reinventando um
// emissor (caso 1 do mini-batch). Tratamento: UX/normalizador orientam a
// selecionar objeto + brilho/reflexo inteiros (Fase 5).
//
// Fallback de retry: vertex → gemini-flash; gemini → gemini (prompt restritivo).
// FAL nunca aparece aqui — só como rota de emergência por flag, fora do router.

import type { EditV2Flags } from './flags'
import {
  expectedOverheadCostUsd,
  expectedProviderCostUsd,
  nodesFor,
  resolveOutputResolution,
} from './pricing'
import { composeEditPromptV2 } from './prompts'
import type {
  EditGateThresholdsV2,
  EditModelIdV2,
  EditProviderIdV2,
  EditReferenceV2,
  EditRouteInputV2,
  EditRouteResultV2,
  NormalizedInstructionV2,
} from './types'

// Limiar de no-op (mudança mínima dentro da seleção) — herdado do v1, validado
// em produção; abaixo disso o resultado é rejeitado como "nada mudou" e não cobra.
const NO_CHANGE_FLOOR = 0.01

// Drift máximo fora da seleção. Tipos de "blend" (material/inserção) precisam
// de folga para a banda do feather da recomposição; remoção/correção são duros.
// Preservação Padrão relaxa uma faixa — nunca além de 12%.
const GATE_STRICT = 0.02
const GATE_BLEND = 0.08
const GATE_STANDARD_STRICT = 0.08
const GATE_STANDARD_BLEND = 0.12

function gateThresholds(input: EditRouteInputV2): EditGateThresholdsV2 {
  const blend = input.editIntent === 'swap_material' || input.editIntent === 'insert_element'
  const maximum = input.preservationMode === 'maximum' || input.requiresStrictGeometry
  const outOfMask = maximum
    ? (blend ? GATE_BLEND : GATE_STRICT)
    : (blend ? GATE_STANDARD_BLEND : GATE_STANDARD_STRICT)
  return { outOfMask, noChangeFloor: NO_CHANGE_FLOOR }
}

interface ModelChoice {
  provider: EditProviderIdV2
  model: EditModelIdV2
  reason: string
}

/** Vertex exige máscara e (por decisão atual) roda sem referências — com
 *  referência, o Gemini multi-imagem é o caminho com suporte de verdade. */
function vertexEligible(input: EditRouteInputV2, flags: EditV2Flags): boolean {
  return flags.vertexImagen && input.hasMask && !input.hasReferenceImage
}

function chooseEconomic(input: EditRouteInputV2, flags: EditV2Flags): ModelChoice {
  const gemini: ModelChoice = {
    provider: 'gemini-image',
    model: 'gemini-3.1-flash-image',
    reason: '',
  }
  const vertex: ModelChoice = {
    provider: 'vertex-imagen',
    model: 'imagen-3.0-capability-001',
    reason: '',
  }

  switch (input.editIntent) {
    case 'remove_element':
    case 'fix_image':
      if (vertexEligible(input, flags)) {
        return { ...vertex, reason: `${input.editIntent}: inpaint com máscara real (Vertex)` }
      }
      return { ...gemini, reason: `${input.editIntent}: Gemini mascarado (Vertex indisponível ou referência presente)` }

    case 'swap_material':
      // Evidência (mini-batch 2026-06-12, caso 3): Vertex insertion é conservador
      // demais para TRANSFORMAR material — nunca rotear material para Vertex.
      if (!input.hasMask) {
        return { ...gemini, reason: 'swap_material sem seleção: instrução na imagem inteira (Gemini)' }
      }
      if (input.hasReferenceImage) {
        return { ...gemini, reason: 'swap_material com referência de material: multi-imagem (Gemini)' }
      }
      return { ...gemini, reason: 'swap_material: re-síntese de material (Gemini) + recompose' }

    case 'insert_element':
      // Inserção real não validada no Vertex — Gemini por segurança (decisão 2026-06-12).
      return {
        ...gemini,
        reason: input.hasReferenceImage
          ? 'insert_element com referência de objeto: multi-imagem (Gemini)'
          : 'insert_element: inserção por re-síntese (Gemini) + recompose',
      }

    case 'adjust_atmosphere':
      return {
        ...gemini,
        reason: input.hasMask
          ? 'adjust_atmosphere com seleção: Gemini mascarado'
          : 'adjust_atmosphere: instrução global (Gemini)',
      }
  }
  return gemini
}

export interface RouteEditV2Opts {
  input: EditRouteInputV2
  normalized: NormalizedInstructionV2
  references: EditReferenceV2[]
  flags: EditV2Flags
}

export function routeEditV2(opts: RouteEditV2Opts): EditRouteResultV2 {
  const { input, normalized, references, flags } = opts

  const choice: ModelChoice =
    input.qualityMode === 'high_precision'
      ? {
          provider: 'gemini-image',
          model: 'gemini-3-pro-image',
          reason: 'alta precisão: motor superior (Gemini Pro)',
        }
      : chooseEconomic(input, flags)

  const resolvedResolution = resolveOutputResolution({
    outputResolution: input.outputResolution,
    imageMegapixels: input.imageMegapixels,
    qualityMode: input.qualityMode,
  })

  const nodesCost = nodesFor({
    editIntent: input.editIntent,
    qualityMode: input.qualityMode,
    hasReferenceImage: input.hasReferenceImage,
    resolvedResolution,
  })

  const normalizedPrompt = composeEditPromptV2({
    intent: input.editIntent,
    normalized,
    preservationMode: input.preservationMode,
    intensityMode: input.intensityMode,
    hasMask: input.hasMask,
    references,
  })

  // Fallback do retry: Vertex cai para o Gemini mascarado; Gemini repete no
  // mesmo modelo com prompt restritivo (buildStrictRetryPromptV2). FAL nunca.
  const fallbackToGemini = choice.provider === 'vertex-imagen'
  const result: EditRouteResultV2 = {
    selectedProvider: choice.provider,
    selectedModel: choice.model,
    normalizedPrompt,
    nodesCost,
    retryPolicy: {
      maxAutoRetries: 1,
      freeRetry: true,
      fallbackProvider: fallbackToGemini ? 'gemini-image' : null,
      fallbackModel: fallbackToGemini ? 'gemini-3.1-flash-image' : null,
    },
    loggingData: {
      reason: choice.reason,
      intent: input.editIntent,
      qualityMode: input.qualityMode,
      preservationMode: input.preservationMode,
      intensityMode: input.intensityMode,
      hasMask: input.hasMask,
      maskAreaRatio: input.maskAreaRatio ?? null,
      referenceKind: input.referenceKind ?? null,
      resolvedResolution,
      gateThresholds: gateThresholds(input),
      expectedProviderCostUsd: expectedProviderCostUsd(choice.model, resolvedResolution),
      expectedOverheadCostUsd: expectedOverheadCostUsd({
        normalizer: flags.normalizer,
        semanticGate: flags.semanticGate,
      }),
    },
  }
  return result
}

/** Validação de pré-condições de produto (a UI também valida; isto é a defesa
 *  do servidor). Retorna mensagem PT amigável ou null quando ok. */
export function validateEditRequestV2(input: EditRouteInputV2, instructionPt: string): string | null {
  const needsMask = input.editIntent === 'remove_element' ||
    input.editIntent === 'insert_element' ||
    input.editIntent === 'fix_image'
  if (needsMask && !input.hasMask) {
    return 'Selecione a área da imagem antes de gerar.'
  }
  const needsInstruction = input.editIntent === 'swap_material' ||
    input.editIntent === 'insert_element' ||
    input.editIntent === 'adjust_atmosphere'
  if (needsInstruction && !instructionPt.trim() && !input.hasReferenceImage) {
    return 'Descreva o que você quer nesta edição.'
  }
  if (input.hasMask && input.maskAreaRatio !== undefined && input.maskAreaRatio !== null && input.maskAreaRatio <= 0) {
    return 'A seleção está vazia. Pinte a área que deseja editar.'
  }
  return null
}
