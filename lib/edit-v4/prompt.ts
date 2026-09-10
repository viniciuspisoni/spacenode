// lib/edit-v4/prompt.ts
//
// Engenharia de prompt do Editar V4. A UI fala português; o prompt é inglês
// técnico e o usuário nunca o vê.
//
// O V4 fala com o Seedream 5.0 Pro, que NÃO aceita máscara em pixels. Ele
// localiza a edição de dois jeitos, e o V4 usa os dois juntos:
//
//   1. `<bbox>x1 y1 x2 y2</bbox>` — coordenadas normalizadas 0–999 no espaço da
//      imagem enviada (origem no canto superior esquerdo). É a caixa envolvente
//      da seleção.
//   2. MARCAÇÃO DESENHADA — o contorno da seleção pintado sobre a própria
//      imagem enviada. Recurso oficial do Pro, e o que resolve o limite do item
//      1: a caixa envolvente de um sofá em diagonal cobre metade da sala, e o
//      modelo não tem como adivinhar a forma. O contorno tem.
//
// A garantia de preservação NÃO vem do prompt: vem do recompose server-side
// (lib/edit-v4/pipeline.ts). O prompt existe para que o que acontece DENTRO da
// seleção seja o pedido — e nada além dele.

import { BASE_EDIT_PROMPT } from '@/lib/edit-v3/buildEditPrompt'
import type {
  EditV4Action,
  EditV4Intensity,
  EditV4Preservation,
  EditV4Reference,
} from './types'

export { BASE_EDIT_PROMPT }

// ── Instrução por ação — COM seleção ─────────────────────────────────────────

function actionInstructionSelected(action: EditV4Action, requestEn: string): string {
  const request = requestEn.trim()
  switch (action) {
    case 'swap_material':
      return (
        `MATERIAL SWAP — Replace the material/finish of the selected surface as requested: "${request}". ` +
        'Apply the new material ONLY to that surface, following its real perspective, scale and texture ' +
        'direction. Inherit the existing scene lighting, shadows and reflections onto the new material. ' +
        'Do NOT apply the material to any other similar-looking surface elsewhere in the image.'
      )
    case 'remove':
      return (
        'REMOVAL — Remove the selected element(s) completely' +
        (request ? ` (${request})` : '') +
        '. Reconstruct the background behind the removed element coherently: continue floors, walls, ' +
        'ceilings, baseboards and material patterns exactly as they would appear, with consistent ' +
        'perspective and lighting. Leave no ghosting, residual shadows or artifacts of the removed element.'
      )
    case 'insert_element':
      return (
        `INSERTION — Insert the requested element at the selected position: "${request}". ` +
        'Match the scene perspective, scale relative to the architecture, light direction, shadows and ' +
        'materiality. The inserted element must look physically grounded (correct contact shadows) and ' +
        'architecturally plausible.'
      )
    case 'refine_area':
      return (
        'AREA REFINEMENT — Fix and refine the selected area' +
        (request ? `: "${request}"` : '') +
        '. Repair artifacts, broken textures, deformations, noise or strange details by reconstructing what ' +
        'should plausibly be there, consistent with the surrounding materials, geometry and lighting. This ' +
        'is a local repair, not a redesign.'
      )
    case 'replace_object':
      return (
        `OBJECT REPLACEMENT — The selection contains one existing object. Replace it with: "${request}". ` +
        'Delete the original object entirely — body, legs, base, cables, its cast and contact shadows, and ' +
        'any reflection of it — then place the new object in the SAME position, resting on the same floor ' +
        'or surface, at a plausible real-world size for that spot. The new object must follow the scene ' +
        'perspective, light direction and materiality, and cast its own correct contact shadow. Do not ' +
        'leave any part of the original object behind, and do not move the camera to accommodate the new one.'
      )
  }
}

// ── Instrução por ação — SEM seleção (o modelo localiza pelo texto) ──────────

function actionInstructionInstructed(action: EditV4Action, requestEn: string): string {
  const request = requestEn.trim()
  const locate =
    'From the written instruction, identify the ONE specific element it names (e.g. "the rug on the floor", ' +
    '"the floor lamp in the left corner") and locate that exact element in the scene by its description, ' +
    'position and context. Operate on that single target only.'
  switch (action) {
    case 'remove':
      return (
        `REMOVAL (no selection) — ${locate} Requested: "${request}". Delete that element ENTIRELY — its body, ` +
        'legs, base, cables and attachments — including its cast shadows, contact shadows, ambient occlusion ' +
        'and any reflection of it on floors, glass or mirrors. Reconstruct the background behind it exactly ' +
        'as it would look, continuing the existing materials and perspective.'
      )
    case 'swap_material':
      return (
        `MATERIAL SWAP (no selection) — ${locate} Requested: "${request}". Change the material/finish of that ` +
        'one surface only, following its real perspective, scale and texture direction, inheriting the ' +
        'existing lighting and shadows. Every other surface in the image keeps its current material, ' +
        'including surfaces made of the same material as the target.'
      )
    case 'refine_area':
      return (
        `AREA REFINEMENT (no selection) — ${locate} Requested: "${request}". Repair only that region: fix ` +
        'artifacts, broken textures, deformations or strange details by reconstructing what should ' +
        'plausibly be there. This is a local repair, not a redesign.'
      )
    // insert_element e replace_object exigem seleção (ver REQUIRES_MASK) — sem
    // âncora não existe "onde" nem "qual". Este ramo é inalcançável pela rota,
    // e o texto reflete isso em vez de inventar comportamento.
    case 'insert_element':
    case 'replace_object':
      return (
        `${locate} Requested: "${request}". Apply the change to that single element only, keeping every ` +
        'other pixel of the scene untouched.'
      )
  }
}

// ── Cláusulas de rigor ───────────────────────────────────────────────────────

function preservationClause(preservation: EditV4Preservation): string {
  return preservation === 'maximum'
    ? 'PRESERVATION: Maximum — outside the requested change nothing may move, shift, resample or be ' +
        'reinterpreted. Camera, framing, focal length, geometry, openings, layout, every other object, ' +
        'every other material and the global lighting stay exactly as they are.'
    : 'PRESERVATION: Standard — keep the architecture, camera and composition intact; small natural ' +
        'adjustments right at the boundary of the change are acceptable so the result integrates.'
}

function intensityClause(intensity: EditV4Intensity): string {
  switch (intensity) {
    case 'subtle':
      return 'INTENSITY: Subtle — apply the smallest change that satisfies the request.'
    case 'strong':
      return 'INTENSITY: Strong — apply the change decisively and unmistakably, still within the requested scope.'
    case 'standard':
      return 'INTENSITY: Standard — apply a balanced, natural version of the change.'
  }
}

/** Confinamento extra quando NÃO há seleção: o modelo é o único responsável. */
const NO_SELECTION_CLAUSE =
  'STRICT PRESERVATION (no selection) — Because there is no selection, you alone are responsible for ' +
  'confinement. Change ONLY the single element or surface named in the instruction; treat everything else ' +
  'as locked. Keep the camera position, angle, focal length and framing identical; keep all geometry, walls, ' +
  'ceiling, floor plane, openings, doors, windows, perspective and vanishing lines identical; keep the ' +
  'layout, every other object, all materials, all colors, and the global lighting and shadow logic ' +
  'identical. The output must be the same photograph as the input with only the requested change applied — ' +
  'same resolution, same crop, same aspect ratio, no zoom, no re-render of the room, no shift in white ' +
  'balance or exposure. If you cannot localize the change precisely, prefer changing too little over ' +
  'touching unrelated pixels. Do not reinterpret, restyle, beautify or "clean up" anything the instruction ' +
  'did not name.'

/**
 * Cláusula da MARCAÇÃO DESENHADA. Ela carrega a instrução mais importante do
 * prompt inteiro: o contorno é um marcador, não conteúdo. Sem esta frase o
 * modelo desenha a linha no resultado — e o recompose a entrega, porque a linha
 * cai dentro da seleção, que é justamente onde o recompose deixa passar.
 */
const OUTLINE_CLAUSE =
  'SELECTION OUTLINE — A thin magenta outline has been drawn on Image 1 to show exactly which shape you ' +
  'must edit. That outline is an ANNOTATION, not part of the scene: it does not exist in the real room. ' +
  'Edit the area it encloses, and render the result as if the outline had never been there — no magenta ' +
  'line, no colored fringe, no trace of it anywhere in the output.'

/** Papel de cada imagem, na ordem em que o adaptador as anexa:
 *  [principal] → [referências...]. O Seedream não recebe mapa de seleção. */
function imageRoles(opts: { regionTag: string | null; references: EditV4Reference[] }): string {
  const roles: string[] = []
  if (opts.regionTag) {
    roles.push(
      'Image 1 is the MAIN architectural image to edit. The only region you may change is the area of ' +
      `Image 1 at ${opts.regionTag}. Everything outside it must remain pixel-identical.`,
    )
  } else {
    roles.push(
      'Image 1 is the MAIN architectural image to edit. There is NO selection: locate the target yourself, ' +
      'purely from the written instruction, and treat the entire rest of the image as locked pixels.',
    )
  }
  let n = 2
  for (const ref of opts.references) {
    const desc =
      ref.kind === 'material'
        ? 'a MATERIAL REFERENCE: reproduce this material/texture/finish faithfully on the selected surface'
        : 'an OBJECT REFERENCE: use this object as the visual model for what to place in the scene'
    roles.push(
      `Image ${n} is ${desc}. It is ONLY a reference — never edit it, and never copy its composition, ` +
      'camera or background into the main image.',
    )
    n++
  }
  return roles.join(' ')
}

export interface BuildEditV4PromptOpts {
  action: EditV4Action
  /** Instrução já em inglês (ou crua — as cláusulas seguram o contrato). */
  instructionEn: string
  preservation: EditV4Preservation
  intensity: EditV4Intensity
  references: EditV4Reference[]
  /** `<bbox>…</bbox>` da seleção na imagem enviada; null = edição por instrução. */
  regionTag: string | null
  /** true = o contorno da seleção foi desenhado sobre a imagem enviada. */
  hasOutline: boolean
}

/** Monta o prompt final do V4. */
export function buildEditV4Prompt(opts: BuildEditV4PromptOpts): string {
  const selected = opts.regionTag !== null
  const parts: string[] = [
    imageRoles({ regionTag: opts.regionTag, references: opts.references }),
    BASE_EDIT_PROMPT,
    selected
      ? actionInstructionSelected(opts.action, opts.instructionEn)
      : actionInstructionInstructed(opts.action, opts.instructionEn),
    preservationClause(opts.preservation),
    intensityClause(opts.intensity),
  ]
  if (selected && opts.hasOutline) parts.push(OUTLINE_CLAUSE)
  parts.push(
    selected
      ? `Apply the change only inside the selected region of Image 1. Outside it the output must be ` +
        'pixel-identical to Image 1: same camera, same framing, same resolution, no zoom, no re-render.'
      : NO_SELECTION_CLAUSE,
  )
  return parts.join('\n\n')
}
