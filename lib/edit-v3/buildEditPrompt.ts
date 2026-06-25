// lib/edit-v3/buildEditPrompt.ts
//
// Engenharia de prompt do Editar V3. A UI fala português; o prompt interno é
// inglês técnico. O usuário NUNCA vê nada disto. Prompts RÍGIDOS em arquitetura:
// geometria intocável, apenas o solicitado, preservação de câmera/proporção/
// perspectiva/aberturas/iluminação/composição.
//
// DOIS MODOS:
//   - COM máscara (hasMask=true): "edite só a seleção branca"; a preservação
//     fora é garantia de SERVIDOR (recompose). Precisão pixel-a-pixel.
//   - SEM máscara (hasMask=false): "identifique o alvo nomeado na instrução e
//     mexa só nele"; a preservação é SEMÂNTICA (o modelo re-sintetiza a cena).
//     Por isso o prompt no-mask é ainda mais rígido sobre confinar a mudança.

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

// ── Instrução por ação — COM máscara ─────────────────────────────────────────
function actionInstructionMasked(action: EditV3Action, requestEn: string): string {
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

// ── Instrução por ação — SEM máscara (o modelo localiza o alvo pelo texto) ────
function actionInstructionNoMask(action: EditV3Action, requestEn: string): string {
  const request = requestEn.trim()
  switch (action) {
    case 'remove':
      return (
        'REMOVAL (no mask) — From the written instruction, identify the one specific object it ' +
        'names (e.g. "the rug on the floor", "the floor lamp in the left corner") and locate that ' +
        'exact object in the scene by its description, position and context. Delete that object ' +
        'ENTIRELY — its body, legs, base, cables, attachments — including its cast shadows, contact ' +
        'shadows, ambient occlusion, and any reflection of it on floors, glass, mirrors or other ' +
        'surfaces. Then fully reconstruct the surface behind and beneath it as it truly continues: ' +
        'extend the floor, wall, baseboard, rug pattern, grout lines, wood grain, tile joints and ' +
        'skirting straight through the now-empty area, matching perspective vanishing lines, texture ' +
        'scale, grain direction, color and lighting of the immediately surrounding region so the patch ' +
        'is invisible. The space it occupied must read as ordinary empty floor/wall, never a blurred ' +
        'smudge, clone-stamp repeat, flat fill or hole. Remove ONLY the named object: do not move, ' +
        'resize, recolor, restyle or "tidy" any other furniture, decor or surface, and do not add ' +
        'anything new in its place. Leave zero ghosting, zero residual shadow, zero outline, zero halo.'
      )
    case 'swap_material':
      return (
        'MATERIAL SWAP (no mask) — From the written instruction, identify the one specific surface it ' +
        'names (e.g. "the floor", "the accent wall behind the bed", "the countertop") and locate the ' +
        `full extent of exactly that surface. Replace its material/finish as requested: "${request}". ` +
        'Apply the new material to the WHOLE of that one surface and nothing beyond its real edges, ' +
        'following its true perspective, plane orientation, tile/plank scale and texture direction, and ' +
        'stopping cleanly at its boundaries, openings and the objects resting on it. Inherit the existing ' +
        'scene lighting, shadows, reflections and ambient occlusion onto the new material. Do NOT apply ' +
        'the material to any other similar-looking surface, do NOT bleed it onto adjacent walls, ceilings, ' +
        'furniture or trim, and do NOT alter the geometry, edges or extent of the surface — only its finish.'
      )
    case 'refine_area':
      return (
        'AREA REFINEMENT (no mask) — From the written instruction, identify the specific region or ' +
        'element it refers to' +
        (request ? ` ("${request}")` : '') +
        ' and locate just that region. Repair only there: fix artifacts, broken or smeared textures, ' +
        'deformations, noise, seams or implausible details by reconstructing what should plausibly be ' +
        'present, consistent with the surrounding materials, geometry, perspective and lighting. This is ' +
        'a local repair, not a redesign and not a restyle: keep the same objects, layout, colors and ' +
        'finishes, and do not "improve", relight or recompose anything beyond the flawed region.'
      )
    case 'insert_element':
      return (
        `INSERTION (no mask) — From the written instruction, determine WHAT element to add and WHERE it ` +
        `belongs (e.g. "a round rug under the coffee table") and place it at that plausible location: "${request}". ` +
        'Insert ONLY the requested element, sized correctly relative to the room scale and resting naturally ' +
        'on/against the correct surface. Match the scene perspective, light direction, color temperature and ' +
        'materiality; give it correct contact shadows and ambient occlusion. It must sit BEHIND and AROUND ' +
        'existing objects with correct occlusion and must not overlap, hide, shift, resize or restyle anything ' +
        'already in the scene. Add nothing other than the one requested element.'
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

/** Confinamento extra quando NÃO há máscara — o modelo é o único responsável. */
const NO_MASK_PRESERVATION_CLAUSE =
  'STRICT PRESERVATION (no mask) — Because there is no selection map, you alone are responsible for ' +
  'confinement. Change ONLY the single element or surface named in the instruction; treat everything else ' +
  'as locked. Keep the camera position, angle, focal length and framing identical; keep all geometry, walls, ' +
  'ceiling, floor plane, openings, doors, windows, perspective and vanishing lines identical; keep the layout, ' +
  'every other object, all materials, all colors, and the global lighting and shadow logic identical. The ' +
  'output must be the same photograph as the input with only the requested change applied — same resolution, ' +
  'same crop, same aspect ratio, no zoom, no re-render of the room, no shift in white balance or exposure. If ' +
  'you cannot localize the change precisely, prefer changing too little over touching unrelated pixels. Do not ' +
  'reinterpret, restyle, beautify or "clean up" any part of the project that the instruction did not name.'

/** Declara o papel de CADA imagem na ordem em que o provider as anexa.
 *  COM máscara: [principal] → [máscara] → [referências...].
 *  SEM máscara: [principal] → [referências...] (o modelo localiza o alvo). */
export function imageRolesContract(opts: { hasMask: boolean; references: EditV3Reference[] }): string {
  const roles: string[] = []
  let n = 2
  if (opts.hasMask) {
    roles.push('Image 1 is the MAIN architectural image to edit.')
    roles.push(
      `Image ${n} is a black-and-white SELECTION MAP of the main image: WHITE marks the ` +
      'only region you may change; BLACK must remain pixel-identical. It is a map, not a ' +
      'picture — never draw it or blend it into the result.',
    )
    n++
  } else {
    roles.push(
      'Image 1 is the MAIN architectural image to edit. There is NO selection map. You must locate the edit ' +
      'target yourself, purely from the written instruction, by reading the scene. Identify the single element ' +
      'or surface that the instruction names and operate on that one target only; treat the entire rest of the ' +
      'image as locked, off-limits pixels.',
    )
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

/** Monta o prompt final, rígido em arquitetura, por ação e por modo (com/sem máscara). */
export function buildEditPrompt(opts: BuildEditPromptOpts): string {
  const parts: string[] = [
    imageRolesContract({ hasMask: opts.hasMask, references: opts.references }),
    BASE_EDIT_PROMPT,
    opts.hasMask
      ? actionInstructionMasked(opts.action, opts.instructionEn)
      : actionInstructionNoMask(opts.action, opts.instructionEn),
    preservationClause(opts.preservation),
    intensityClause(opts.intensity),
  ]
  if (opts.hasMask) {
    parts.push('Outside the white selection the output must be pixel-identical to the main image.')
  } else {
    parts.push(NO_MASK_PRESERVATION_CLAUSE)
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
