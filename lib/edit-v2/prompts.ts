// lib/edit-v2/prompts.ts
//
// Engenharia de prompt do Editar v2. A UI fala português; o prompt interno é
// inglês técnico (melhor desempenho dos modelos de imagem). O usuário NUNCA vê
// nada disto — regra do norte: complexidade no backend, não na tela.
//
// Estrutura do prompt final:
//   [contrato de ordem das imagens] + [prompt base obrigatório] +
//   [instrução por tipo + pedido normalizado] + [cláusula de preservação] +
//   [cláusula de intensidade] + [cláusula de referência] + [cláusula de máscara]
//
// Regra de desempate nº 2 do fundador embutida no texto: na dúvida entre uma
// imagem mais bonita e preservar o projeto, preservar o projeto.

import type {
  EditIntentV2,
  EditReferenceV2,
  IntensityModeV2,
  NormalizedInstructionV2,
  PreservationModeV2,
} from './types'

/** Prompt base OBRIGATÓRIO (definido pelo fundador — não alterar sem aprovação). */
export const BASE_EDIT_PROMPT =
  'Edit the provided architectural image. Preserve the original camera angle, ' +
  'perspective, geometry, proportions, openings, layout, scale, lighting logic, ' +
  'and architectural intent. Modify only the requested area or element. Do not ' +
  'redesign the project. Do not change unrelated materials, furniture, walls, ' +
  'ceiling, floor, windows, doors, or composition. Keep the result photorealistic ' +
  'and architecturally plausible.'

// ---------------------------------------------------------------------------
// Instrução por tipo
// ---------------------------------------------------------------------------

function intentInstruction(intent: EditIntentV2, instructionEn: string, hasMask: boolean): string {
  const request = instructionEn.trim()
  switch (intent) {
    case 'swap_material':
      return (
        `MATERIAL SWAP — Replace the material/finish of the selected surface as requested: "${request}". ` +
        'Apply the new material ONLY to the selected surface, following its real perspective, ' +
        'scale and texture direction. Inherit the existing scene lighting, shadows and ' +
        'reflections on the new material. Do NOT apply the material to any other ' +
        'similar-looking surface elsewhere in the image.'
      )
    case 'remove_element':
      return (
        'REMOVAL — Remove the selected element(s) completely' +
        (request ? ` (${request})` : '') +
        '. Reconstruct the background behind the removed element coherently: continue ' +
        'floors, walls, ceilings, baseboards and material patterns exactly as they would ' +
        'appear, with consistent perspective and lighting. Leave no ghosting, shadows or ' +
        'artifacts of the removed element.'
      )
    case 'insert_element':
      return (
        `INSERTION — Insert the requested element into the selected area: "${request}". ` +
        'Match the scene perspective, scale relative to the architecture, light direction, ' +
        'shadows and materiality. The inserted element must look physically grounded ' +
        '(correct contact shadows) and architecturally plausible.'
      )
    case 'adjust_atmosphere':
      return (
        `ATMOSPHERE — Adjust the global atmosphere of the image as requested: "${request}". ` +
        'This may include light temperature, time of day, exposure, contrast, weather or ' +
        'post-production mood. Do NOT change architecture, layout, furniture, materials or ' +
        'any object — only light, color and atmosphere.'
      )
    case 'fix_image':
      return (
        'CORRECTION — Fix the visual defect in the selected area' +
        (request ? `: "${request}"` : '') +
        '. Repair artifacts, broken textures, deformations, noise or strange objects by ' +
        'reconstructing what should plausibly be there, consistent with the surrounding ' +
        'materials, geometry and lighting. This is a repair, not a redesign.'
      )
  }
  // exhaustiveness — nunca alcançado
  return request
}

// ---------------------------------------------------------------------------
// Cláusulas de controle (Preservação / Intensidade)
// ---------------------------------------------------------------------------

function preservationClause(mode: PreservationModeV2, strictGeometry: boolean): string {
  if (mode === 'maximum' || strictGeometry) {
    return (
      'PRESERVATION (MAXIMUM): Treat every pixel outside the requested change as ' +
      'untouchable. Keep structure, openings, frames, joinery and furniture exactly as ' +
      'in the original. If the request conflicts with preserving the project, preserve ' +
      'the project and apply the smallest faithful change.'
    )
  }
  return (
    'PRESERVATION (STANDARD): Keep the architectural design, camera and layout intact. ' +
    'Minor local adjustments around the edited area are acceptable only when strictly ' +
    'necessary for a seamless, photorealistic blend.'
  )
}

function intensityClause(mode: IntensityModeV2): string {
  switch (mode) {
    case 'subtle':
      return 'INTENSITY: Subtle — apply a restrained, conservative version of the change.'
    case 'strong':
      return 'INTENSITY: Strong — apply a pronounced, clearly visible version of the change, without violating the preservation rules.'
    default:
      return 'INTENSITY: Standard — apply a balanced, natural version of the change.'
  }
}

// ---------------------------------------------------------------------------
// Contrato de ordem das imagens + cláusulas de máscara/referência
// ---------------------------------------------------------------------------

/** Declara explicitamente o papel de CADA imagem enviada, na ordem em que os
 *  providers as anexam (prompts e providers compartilham este contrato).
 *  Ordem: [principal] → [máscara?] → [referências...]. A principal NUNCA é uma
 *  referência — exigência central do fundador. */
export function imageRolesContract(opts: {
  hasMask: boolean
  references: EditReferenceV2[]
}): string {
  const roles: string[] = ['Image 1 is the MAIN architectural image to edit.']
  let n = 2
  if (opts.hasMask) {
    roles.push(
      `Image ${n} is a black-and-white SELECTION MAP of the main image: WHITE marks the ` +
      'only region you may change; BLACK must remain pixel-identical. It is a map, not a ' +
      'picture — never draw it or blend it into the result.',
    )
    n++
  }
  for (const ref of opts.references) {
    const desc =
      ref.kind === 'material'
        ? 'a MATERIAL REFERENCE: reproduce this material/texture/finish faithfully on the selected surface'
        : ref.kind === 'object'
          ? 'an OBJECT REFERENCE: insert/replace using this object as the visual model'
          : 'a PROJECT CONTEXT view of the same project: use it only for stylistic and material consistency'
    roles.push(
      `Image ${n} is ${desc}. It is ONLY a reference — never edit it, never copy its ` +
      'composition, camera or background into the main image.',
    )
    n++
  }
  return roles.join(' ')
}

// ---------------------------------------------------------------------------
// Composição final
// ---------------------------------------------------------------------------

export interface ComposePromptOpts {
  intent: EditIntentV2
  normalized: Pick<NormalizedInstructionV2, 'instructionEn' | 'requiresStrictGeometry'>
  preservationMode: PreservationModeV2
  intensityMode: IntensityModeV2
  hasMask: boolean
  references: EditReferenceV2[]
}

export function composeEditPromptV2(opts: ComposePromptOpts): string {
  const parts: string[] = []
  parts.push(imageRolesContract({ hasMask: opts.hasMask, references: opts.references }))
  parts.push(BASE_EDIT_PROMPT)
  parts.push(intentInstruction(opts.intent, opts.normalized.instructionEn, opts.hasMask))
  parts.push(preservationClause(opts.preservationMode, opts.normalized.requiresStrictGeometry))
  parts.push(intensityClause(opts.intensityMode))
  if (opts.hasMask) {
    parts.push(
      'Outside the white selection the output must be pixel-identical to the main image.',
    )
  }
  return parts.join('\n\n')
}

/** Prompt do retry automático após reprovação do gate — mais restritivo, com o
 *  motivo da reprovação em vocabulário fechado. Nunca custa Nodes ao usuário. */
export function buildStrictRetryPromptV2(basePrompt: string, reasons: string[]): string {
  const reasonText = reasons.length ? reasons.join('; ') : 'previous attempt failed automatic validation'
  return (
    `STRICT RETRY — the previous attempt was rejected by automatic validation (${reasonText}). ` +
    'Highest priority rules for this attempt: change ONLY what was requested, keep everything ' +
    'else pixel-identical, do not reinterpret or restyle any part of the project.\n\n' +
    basePrompt
  )
}

/** Fallback determinístico do normalizador (quando a camada LLM está desligada
 *  ou indisponível): repassa a instrução crua — as cláusulas de tipo/preservação
 *  do composer continuam garantindo o contrato arquitetônico. */
export function deterministicInstructionEn(instructionPt: string, intent: EditIntentV2): string {
  const trimmed = instructionPt.trim()
  if (trimmed) return trimmed
  // remove/fix podem vir sem texto — a instrução do tipo carrega o pedido.
  return intent === 'remove_element' || intent === 'fix_image' ? '' : trimmed
}
