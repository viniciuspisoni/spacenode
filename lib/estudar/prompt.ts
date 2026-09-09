// lib/estudar/prompt.ts
//
// Engenharia de prompt do módulo Estudar. A UI fala português; o prompt
// interno é inglês técnico (mesma convenção do Editar V3 — o usuário nunca vê
// nada disto; os valores do briefing entram entre aspas, crus, e as cláusulas
// garantem o contrato).
//
// CONTRATO DE PRODUTO (o norte do módulo):
//   - A fotografia real é a base obrigatória. Perspectiva, câmera, paredes,
//     aberturas (portas/janelas) e proporções são INVIOLÁVEIS por default.
//   - Estrutura só muda quando o usuário pede EXPLICITAMENTE (estudo de
//     reforma com mudanças estruturais descritas) — e só as listadas.
//   - Elementos marcados na máscara de preservação ficam exatamente como na
//     foto original.
//   - O que o estudo PODE mudar depende do tipo (layout, marcenaria, reforma,
//     decoração) e da variante (essencial, equilibrada, completa).
//
// A máscara de preservação segue a mecânica do Editar V3 (mapa P&B como
// imagem adicional + contrato textual de papéis — os Gemini não aceitam
// máscara em pixels), mas com POLARIDADE INVERTIDA e declarada no texto:
// aqui BRANCO = preservar (no Editar, branco = editar).
//
// CLIENT-SAFE: só strings — nada de sharp/fs/supabase.

import {
  formatMedida,
  type EstudoBriefing,
  type EstudoMedida,
  type EstudoTipo,
  type EstudoVariante,
} from './types'

// ── Papéis das imagens (ordem de image_urls: [foto] → [máscara?]) ─────────────

export function buildImageRolesBlock(hasPreserveMask: boolean): string {
  const roles = [
    'Image #1 is the PHOTOGRAPH of the real, existing room — the mandatory base of the study.',
  ]
  if (hasPreserveMask) {
    roles.push(
      'Image #2 is a black-and-white PRESERVATION MAP of the photograph: WHITE marks elements ' +
        'the client requires to keep — reproduce each white-marked element exactly as it appears ' +
        'in the photograph (same object, same position, same size, same material and color). ' +
        'BLACK areas are where the study may propose changes. It is a map, not a picture — ' +
        'never draw it or blend it into the result.',
    )
  }
  return roles.join(' ')
}

/** Rótulos por imagem (imageLabels do lib/ai/image-provider — binding explícito). */
export function buildImageLabels(hasPreserveMask: boolean): (string | null)[] {
  const labels: (string | null)[] = ['Image #1 — photograph of the existing room:']
  if (hasPreserveMask) labels.push('Image #2 — preservation map (white = must keep):')
  return labels
}

// ── Trava estrutural ──────────────────────────────────────────────────────────

function buildStructureLock(explicitStructuralChanges: string): string {
  const base =
    'STRUCTURE LOCK: preserve exactly the camera position, perspective, framing, horizon and ' +
    'vanishing points of the photograph; every wall, ceiling and floor plane; the count, size, ' +
    'shape and position of every door, window and opening; all built proportions and the room ' +
    'boundary. The output must overlay the photograph — every architectural edge and opening ' +
    'contour in the same position, at the same size, seen from the same camera. '
  if (!explicitStructuralChanges.trim()) {
    return base + 'No structural change of any kind was requested: make none. '
  }
  return (
    base +
    'EXPLICITLY REQUESTED STRUCTURAL CHANGES — the client asked for exactly these, and ONLY ' +
    `these, structural modifications: "${explicitStructuralChanges.trim()}". Apply them ` +
    'plausibly and keep every other structural element locked as above. '
  )
}

// ── Escala real (medida de referência opcional) ───────────────────────────────

export function buildScaleBlock(medida: EstudoMedida | null): string {
  if (!medida || !medida.descricao.trim() || !(medida.valor > 0)) return ''
  return (
    `REAL-WORLD SCALE REFERENCE: in this room, "${medida.descricao.trim()}" measures ` +
    `${formatMedida(medida)}. Use this as the scale anchor — every proposed element must have ` +
    'plausible real dimensions consistent with it (furniture that fits, circulation that works, ' +
    'cabinetry with buildable depths and heights). '
  )
}

// ── Escopo por tipo de estudo ─────────────────────────────────────────────────

const SCOPE_BY_TIPO: Record<EstudoTipo, string> = {
  layout:
    'STUDY SCOPE — LAYOUT: this is a furniture-layout study. You may rearrange, replace, add or ' +
    'remove loose furniture and movable elements to improve use and circulation. Keep the existing ' +
    'wall, floor and ceiling finishes unless the briefing explicitly asks otherwise. ',
  marcenaria:
    'STUDY SCOPE — CUSTOM MILLWORK: this is a cabinetry/millwork study. Propose built-in, ' +
    'custom-made carpentry (wardrobes, shelving, panels, benches, cabinetry) designed for the real ' +
    'dimensions of this room. Loose furniture and finishes change only where needed to integrate ' +
    'the millwork. Every proposed piece must be buildable: straight modules, plausible depths, ' +
    'doors and drawers that can open. ',
  reforma:
    'STUDY SCOPE — RENOVATION: this is a renovation study. You may renew finishes (floors, wall ' +
    'treatments, ceilings), swap fixtures and update furniture coherently. Structural elements ' +
    'follow the STRUCTURE LOCK above — only the explicitly listed structural changes, if any, ' +
    'are allowed. ',
  decoracao:
    'STUDY SCOPE — DECORATION: this is a decoration study. Work on the decorative layer: wall ' +
    'colors, textiles, rugs, curtains, lamps, art, plants and accessories. Keep the existing ' +
    'furniture pieces and their positions unless the briefing explicitly asks to replace ' +
    'something; never change finishes that read as construction work (flooring, tiling). ',
}

// ── Diretriz por variante ─────────────────────────────────────────────────────

const VARIANT_DIRECTIVE: Record<EstudoVariante, string> = {
  essencial:
    'PROPOSAL LEVEL — ESSENTIAL: the minimum-intervention proposal. Keep as much of what already ' +
    'exists in the photograph as possible; change only what is necessary to satisfy the mandatory ' +
    'items and the core needs. Prefer simple, low-cost, off-the-shelf solutions. The room must ' +
    'still read as the same room, clearly improved. ',
  equilibrada:
    'PROPOSAL LEVEL — BALANCED: the middle-ground proposal. Combine selective replacements with a ' +
    'few key new pieces; balance cost and impact. More transformation than the essential level, ' +
    'without redoing everything. ',
  completa:
    'PROPOSAL LEVEL — COMPLETE: the fullest transformation the study scope allows. Redesign every ' +
    'element the scope permits into a cohesive, resolved proposal — while still obeying the ' +
    'structure lock, the preservation map and the mandatory items. ',
}

// ── Briefing do cliente ───────────────────────────────────────────────────────

function briefingLine(label: string, value: string): string {
  const v = value.trim()
  return v ? `${label}: "${v}". ` : ''
}

export function buildBriefingBlock(briefing: EstudoBriefing): string {
  return (
    'CLIENT BRIEFING (verbatim, in Portuguese): ' +
    briefingLine('Room type', briefing.ambienteTipo) +
    briefingLine('How the room is used', briefing.ambienteUso) +
    briefingLine('Mandatory items — every proposal MUST include them', briefing.itensObrigatorios) +
    briefingLine('Desired style', briefing.estilo) +
    briefingLine('Preferred materials', briefing.materiais) +
    briefingLine('Specific needs', briefing.necessidades) +
    briefingLine(
      'Approximate budget — choose furniture and finishes plausible within it',
      briefing.orcamento,
    ) +
    briefingLine('Additional instructions', briefing.instrucoes)
  )
}

// ── Negativos + fecho fotográfico ─────────────────────────────────────────────

const ESTUDO_NEGATIVES =
  'STRICTLY AVOID: any different camera angle, perspective, framing, zoom or rotation; warped ' +
  'proportions; added, removed, resized or transformed walls, doors, windows or openings beyond ' +
  'the explicitly requested structural changes; any change to white-marked preserved elements; ' +
  'people or animals; text, labels, dimensions, watermarks or annotations; collage or ' +
  'split-screen; fantasy or impossibly-shaped additions.'

const ESTUDO_PHOTO_CLOSE =
  'Output a single photorealistic photograph of the SAME room seen from the SAME camera, with ' +
  'the proposal applied — real-world materials, coherent light with the original openings, ' +
  'correct contact shadows and reflections, sharp focus, same aspect ratio as the photograph.'

// ── Prompt do estudo (uma alternativa) ────────────────────────────────────────

export interface BuildEstudoPromptOpts {
  briefing: EstudoBriefing
  variante: EstudoVariante
  hasPreserveMask: boolean
  medida: EstudoMedida | null
}

export function buildEstudoPrompt(opts: BuildEstudoPromptOpts): string {
  const { briefing, variante } = opts
  // Mudança estrutural só é considerada em estudo de reforma — e só a descrita.
  const structural = briefing.estudoTipo === 'reforma' ? briefing.mudancasEstruturais : ''
  const parts = [
    'You are producing a PRELIMINARY INTERIOR STUDY for a real, existing room, over a real ' +
      'photograph. This is a professional visualization of a design proposal — not a fantasy ' +
      'render and not a redesign of the building.',
    buildImageRolesBlock(opts.hasPreserveMask),
    buildStructureLock(structural),
    buildScaleBlock(opts.medida),
    SCOPE_BY_TIPO[briefing.estudoTipo],
    VARIANT_DIRECTIVE[variante],
    buildBriefingBlock(briefing),
    ESTUDO_NEGATIVES,
    ESTUDO_PHOTO_CLOSE,
  ].filter(Boolean)
  return parts.join('\n\n')
}

// ── Prompt do refinamento localizado ──────────────────────────────────────────
//
// Mesma mecânica do Editar V3 com máscara: mapa P&B (aqui de volta à
// polaridade padrão — BRANCO = região a alterar) + instrução livre. A garantia
// fora da região é do contrato textual (sem recompose server-side no MVP).

export function buildRefinePrompt(instruction: string): string {
  return [
    'Image #1 is a design-proposal image of a room. Image #2 is a black-and-white SELECTION MAP ' +
      'of it: WHITE marks the ONLY region you may change; BLACK must remain identical to image #1. ' +
      'It is a map, not a picture — never draw it or blend it into the result.',
    `LOCALIZED REFINEMENT — apply exactly this change inside the white region: "${instruction.trim()}". ` +
      'Match the scene perspective, scale, light direction, shadows and materiality so the change ' +
      'blends seamlessly.',
    'Everything outside the white selection must remain identical to image #1: same camera, same ' +
      'geometry, same walls, openings and proportions, same furniture, same materials and colors, ' +
      'same lighting, same aspect ratio. If the request conflicts with preserving the rest of the ' +
      'image, apply the smallest faithful change. Output a single photorealistic image.',
  ].join('\n\n')
}

export function buildRefineImageLabels(): (string | null)[] {
  return [
    'Image #1 — proposal image to refine:',
    'Image #2 — selection map (white = only region to change):',
  ]
}
