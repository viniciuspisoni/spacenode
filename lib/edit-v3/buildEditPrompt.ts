// lib/edit-v3/buildEditPrompt.ts
//
// Engenharia de prompt do Editar V3. A UI fala português; o prompt interno é
// inglês técnico (melhor desempenho dos modelos de imagem). O usuário NUNCA vê
// nada disto. Os prompts são RÍGIDOS em arquitetura: geometria intocável, apenas
// o solicitado, somente a área selecionada, preservação de câmera/proporção/
// perspectiva/aberturas/iluminação/composição.
//
// Estrutura do prompt final:
//   [contrato de ordem das imagens] + [prompt base obrigatório] +
//   [instrução por ação] + [preservação] + [intensidade] + [trava da máscara]

import type {
  EditV3Action,
  EditV3Intensity,
  EditV3Preservation,
  EditV3Reference,
} from './types'

/** Prompt base OBRIGATÓRIO — os princípios do brief, sempre presentes. */
export const BASE_EDIT_PROMPT =
  'Edit the provided architectural image. Preserve the original camera angle, ' +
  'perspective, geometry, proportions, openings, layout, scale, lighting logic, ' +
  'and architectural intent. Modify only the requested area or element. Do not ' +
  'redesign the project. Do not change unrelated materials, furniture, walls, ' +
  'ceiling, floor, windows, doors, or composition. Keep the result photorealistic ' +
  'and architecturally plausible.'

// ── Instrução por ação ───────────────────────────────────────────────────────
function actionInstruction(action: EditV3Action, requestEn: string): string {
  const request = requestEn.trim()
  switch (action) {
    case 'swap_material':
      return (
        `MATERIAL SWAP — Replace the material/finish of the selected surface as requested: "${request}". ` +
        'Apply the new material ONLY to the selected surface, following its real perspective, ' +
        'scale and texture direction. Inherit the existing scene lighting, shadows and ' +
        'reflections onto the new material. Do NOT apply the material to any other ' +
        'similar-looking surface elsewhere in the image.'
      )
    case 'remove':
      return (
        'REMOVAL — Remove the selected element(s) completely' +
        (request ? ` (${request})` : '') +
        '. Reconstruct the background behind the removed element coherently: continue ' +
        'floors, walls, ceilings, baseboards and material patterns exactly as they would ' +
        'appear, with consistent perspective and lighting. Leave no ghosting, residual ' +
        'shadows or artifacts of the removed element.'
      )
    case 'insert_element':
      return (
        `INSERTION — Insert the requested element into the selected area: "${request}". ` +
        'Match the scene perspective, scale relative to the architecture, light direction, ' +
        'shadows and materiality. The inserted element must look physically grounded ' +
        '(correct contact shadows) and architecturally plausible.'
      )
    case 'refine_area':
      return (
        'AREA REFINEMENT — Fix and refine the selected area' +
        (request ? `: "${request}"` : '') +
        '. Repair artifacts, broken textures, deformations, noise or strange details by ' +
        'reconstructing what should plausibly be there, consistent with the surrounding ' +
        'materials, geometry and lighting. This is a local repair, not a redesign.'
      )
  }
}

// ── Cláusulas de controle ────────────────────────────────────────────────────
function preservationClause(mode: EditV3Preservation): string {
  if (mode === 'maximum') {
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

function intensityClause(mode: EditV3Intensity): string {
  switch (mode) {
    case 'subtle':
      return 'INTENSITY: Subtle — apply a restrained, conservative version of the change.'
    case 'strong':
      return 'INTENSITY: Strong — apply a pronounced, clearly visible version of the change, without violating the preservation rules.'
    default:
      return 'INTENSITY: Standard — apply a balanced, natural version of the change.'
  }
}

/** Declara o papel de CADA imagem na ordem em que o provider as anexa:
 *  [principal] → [máscara?] → [referências...]. A principal nunca é referência. */
export function imageRolesContract(opts: { hasMask: boolean; references: EditV3Reference[] }): string {
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
        : 'an OBJECT REFERENCE: insert/replace using this object as the visual model'
    roles.push(
      `Image ${n} is ${desc}. It is ONLY a reference — never edit it, never copy its ` +
      'composition, camera or background into the main image.',
    )
    n++
  }
  return roles.join(' ')
}

export interface BuildEditPromptOpts {
  action: EditV3Action
  /** Instrução do usuário já em inglês (ou crua — as cláusulas garantem o contrato). */
  instructionEn: string
  preservation: EditV3Preservation
  intensity: EditV3Intensity
  hasMask: boolean
  references: EditV3Reference[]
}

/** Monta o prompt final, rígido em arquitetura, por ação. */
export function buildEditPrompt(opts: BuildEditPromptOpts): string {
  const parts: string[] = [
    imageRolesContract({ hasMask: opts.hasMask, references: opts.references }),
    BASE_EDIT_PROMPT,
    actionInstruction(opts.action, opts.instructionEn),
    preservationClause(opts.preservation),
    intensityClause(opts.intensity),
  ]
  if (opts.hasMask) {
    parts.push('Outside the white selection the output must be pixel-identical to the main image.')
  }
  return parts.join('\n\n')
}

/** Retry mais restritivo após reprovação do gate (nunca cobra o usuário). */
export function buildStrictRetryPrompt(basePrompt: string, reasons: string[]): string {
  const reasonText = reasons.length ? reasons.join('; ') : 'previous attempt failed automatic validation'
  return (
    `STRICT RETRY — the previous attempt was rejected by automatic validation (${reasonText}). ` +
    'Highest priority rules for this attempt: change ONLY what was requested, keep everything ' +
    'else pixel-identical, do not reinterpret or restyle any part of the project.\n\n' +
    basePrompt
  )
}
