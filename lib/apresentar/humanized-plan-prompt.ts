// ── Planta Humanizada · construção do prompt ─────────────────────────────────
//
// Saiu de lib/apresentar/prompts.ts (que ficou com as Isométricas) porque
// cresceu: o prompt deixou de ser derivado só das seleções da UI e passa a ser
// montado a partir do BRIEF que o leitor de visão extraiu da planta
// (lib/apresentar/plan-reader).
//
// A diferença prática é a distância entre
//     "add appropriate furniture in every room"
// e
//     "Cozinha: L-shaped counter, cooktop, sink, fridge · Suíte: queen bed with
//      two nightstands, wardrobe · Varanda: deck, planters, two lounge chairs"
// — e é de onde vem a maior parte do ganho de qualidade do módulo.
//
// A outra mudança estrutural: quando os rótulos vão ser desenhados por nós (o
// caso normal), o prompt PROÍBE texto. Pedir tipografia ao modelo de imagem é
// o que obrigava a ferramenta a rodar no motor caro, e é onde nasciam os
// "Cozlnha" e "Banherio" que ninguém quer mostrar pro cliente.
//
// CLIENT-SAFE: só strings e tipos.

import type {
  HumanizedPlanStyle,
  HumanizedPlanLevel,
  HumanizedPlanOptions,
  PlanBrief,
  PlanRoomKind,
} from './config'

// ── Vocabulário ──────────────────────────────────────────────────────────────

const PROJECT_TYPE_HINT: Record<PlanBrief['projectType'], string> = {
  apartamento:  'residential apartment floor plan',
  casa:         'single-family house floor plan',
  comercial:    'commercial retail floor plan',
  corporativo:  'corporate office floor plan',
  paisagismo:   'landscape design plan with planting beds, paving, and outdoor zones',
}

const STYLE_DIRECTIVE: Record<HumanizedPlanStyle, string> = {
  clean_tecnico:
    'CLEAN TECHNICAL render style: precise line work, neutral palette (greys, soft beige, white), restrained furniture icons, no decorative excess. Premium technical drawing aesthetic.',
  imobiliario_premium:
    'PREMIUM REAL-ESTATE render style: rich materiality, warm wood tones, soft textiles, lush plants, photoreal furniture from above. Aspirational, magazine-quality presentation for sales material.',
  editorial_minimalista:
    'EDITORIAL MINIMALIST style: restricted palette (cream, charcoal, soft accent), generous negative space, minimal but elegant furniture. Architecture-magazine layout feel.',
  aquarelado:
    'WATERCOLOR style: soft watercolor washes, gentle organic edges on furniture and planting, light pencil outlines preserved, paper-texture background. Artistic and warm.',
  contemporaneo:
    'CONTEMPORARY style: balanced technical drawing with photoreal furniture, mid-warm palette, layered shadows, modern dwelling aesthetic. Sophisticated yet readable.',
}

const LEVEL_DIRECTIVE: Record<HumanizedPlanLevel, string> = {
  leve:
    'LIGHT humanization: keep the technical drawing dominant; add only essential furniture silhouettes and minimal floor tone. Walls and dimensions remain the visual focus.',
  equilibrado:
    'BALANCED humanization: clear furniture, subtle floor textures, light planting, soft shadows. Equal weight to technical clarity and presentation polish.',
  completo:
    'COMPLETE humanization: full furniture sets, decorative plants, rugs, textured flooring per room, soft directional shadows, accessory props. Final presentation quality.',
}

// Repertório por categoria de ambiente — sempre em VISTA SUPERIOR, que é o que
// o modelo erra sozinho (ele tende a desenhar mobiliário em perspectiva).
const KIND_PROGRAM: Record<PlanRoomKind, string> = {
  social:     'sofa and armchairs around a coffee table on a rug, TV console, side tables; dining table with chairs where the room is long',
  cozinha:    'L- or U-shaped counter along the walls, cooktop, sink, fridge, upper cabinets, island only if the room clearly fits one',
  dormitorio: 'bed centred on the longest wall with a nightstand each side, wardrobe against the opposite wall, bedside rug',
  banho:      'toilet, vanity with basin, shower tray or bathtub in the wet corner, small-format floor tiling',
  servico:    'washing machine, laundry tub, tall utility cabinet, drying rack',
  circulacao: 'keep clear: at most a runner rug or a slim console. Never block the passage',
  externo:    'decking or paving, planters and shrubs, outdoor seating, a small table',
  trabalho:   'desk with task chair, shelving along a wall, meeting table where the room is wide',
  comercial:  'display units and gondolas, service counter, waiting seating, clear customer circulation',
  outro:      'furniture appropriate to the room proportions, kept minimal',
}

// ── Blocos ───────────────────────────────────────────────────────────────────

/** Programa por ambiente. Sem brief (leitura degradada) devolve a instrução
 *  genérica antiga — o pipeline nunca fica sem prompt. */
function buildRoomProgram(brief: PlanBrief, options: HumanizedPlanOptions): string {
  if (!options.addFurniture) return ''
  if (brief.rooms.length === 0) {
    return 'FURNISH: add appropriate top-down furniture in every room, sized to the room.'
  }

  // Agrupa por categoria: 24 linhas soltas competem entre si e o modelo
  // começa a ignorar as últimas. Por categoria são no máximo 10 linhas.
  const byKind = new Map<PlanRoomKind, string[]>()
  for (const r of brief.rooms) {
    const list = byKind.get(r.kind) ?? []
    list.push(r.name)
    byKind.set(r.kind, list)
  }

  const lines = [...byKind.entries()].map(([kind, names]) =>
    `- ${names.join(', ')} → ${KIND_PROGRAM[kind]}.`
  )

  return [
    `FURNISH BY ROOM (${brief.rooms.length} rooms read from the drawing). All furniture STRICTLY TOP-DOWN, drawn to the plan's own scale, never in perspective:`,
    ...lines,
  ].join('\n')
}

/** Proibição de texto — o bloco que permite rodar no motor barato. */
const NO_TEXT_BLOCK =
  'NO TEXT ANYWHERE: do not write room names, labels, titles, legends, dimensions, area figures, ' +
  'north arrows, scale bars or any lettering. Not a single character. Any existing text in the ' +
  'source drawing must be left exactly as it is — never redrawn, never translated, never restyled. ' +
  'Typography is added afterwards by the application.'

/** Só quando a leitura falhou: sem posições, o rótulo volta pro modelo. */
const MODEL_LABELS_BLOCK =
  'Add clean Brazilian-Portuguese room labels (Sala, Cozinha, Suíte, Banheiro, Quarto, Área de ' +
  'Serviço, Varanda) in a refined sans-serif, centred inside each room, small and unobtrusive.'

const OPTION_FRAGMENTS: { key: keyof HumanizedPlanOptions; on: string }[] = [
  { key: 'addVegetation',      on: 'Add indoor plants and, where there is outdoor area, garden vegetation.' },
  { key: 'applyFloorTextures', on: 'Apply distinct top-down floor textures per room (wood, tile, rug, stone), aligned to the room walls.' },
  { key: 'addSoftShadows',     on: 'Add soft, consistent directional shadows under furniture and walls, all from the same light direction.' },
  { key: 'preserveLines',      on: 'PRESERVE the original technical line work for walls, doors, windows, and dimensions.' },
]

/** Escalada de retry — reforça "TRACE, não inspiração" sem mencionar que houve
 *  tentativa anterior (o modelo não a vê). */
function buildEscalation(attempt: number): string {
  if (attempt <= 1) return ''
  return (
    'ABSOLUTE STRUCTURAL PRIORITY: treat the original floor plan as a fixed template that you TRACE, never as ' +
    'inspiration. This pass is a pure re-styling of the EXACT same drawing — as if painting materials, furniture ' +
    'and shadows onto the existing plan. Reproduce the position, length and thickness of every wall, the position ' +
    'and swing of every door, every window and every room boundary with zero deviation. The output must overlay ' +
    'the original plan line-over-line. When in doubt between beauty and accuracy, always choose accuracy.'
  )
}

/** Papel do mapa de bordas anexado nos retries. Sem menção a perspectiva —
 *  planta é ortográfica top-down. */
function buildEdgeMapBlock(imageIndex: number | null | undefined): string {
  if (!imageIndex) return ''
  return (
    `STRUCTURAL CONSTRAINT MAP: image #${imageIndex} is an automatically extracted edge/line map of the original ` +
    'floor plan. It is a CONSTRAINT, not content: every wall line, opening contour and room boundary of your ' +
    'output must align with this map exactly — same positions, same sizes, same top-down orthographic layout. ' +
    'Do NOT imitate its graphic style: the output is the humanized plan whose underlying structure matches these lines.'
  )
}

// ── API ──────────────────────────────────────────────────────────────────────

export interface HumanizedPlanPromptInput {
  brief:   PlanBrief
  style:   HumanizedPlanStyle
  level:   HumanizedPlanLevel
  options: HumanizedPlanOptions
  additionalInstructions?: string | null
  /** true = os rótulos serão compostos pela aplicação; o modelo não escreve. */
  labelsDrawnLocally: boolean
}

export interface HumanizedPlanPromptOpts {
  attempt?:           number
  edgeMapImageIndex?: number | null
}

export function buildHumanizedPlanPrompt(
  input: HumanizedPlanPromptInput,
  opts?: HumanizedPlanPromptOpts,
): string {
  const { brief, style, level, options, additionalInstructions, labelsDrawnLocally } = input
  const attempt    = opts?.attempt ?? 1
  const escalation = buildEscalation(attempt)
  const edgeBlock  = buildEdgeMapBlock(opts?.edgeMapImageIndex)
  const program    = buildRoomProgram(brief, options)

  // Só pede rótulo ao modelo quando NÃO vamos desenhar: leitura degradada com a
  // opção ligada. Nos demais casos, silêncio tipográfico absoluto.
  const wantsModelLabels = options.addRoomLabels && !labelsDrawnLocally
  const textBlock = wantsModelLabels ? MODEL_LABELS_BLOCK : NO_TEXT_BLOCK

  const optionLines = OPTION_FRAGMENTS
    .filter(({ key }) => options[key])
    .map(({ on }) => `- ${on}`)
    .join('\n')

  return [
    `Transform this technical ${PROJECT_TYPE_HINT[brief.projectType]} into a HUMANIZED PRESENTATION floor plan for client review.`,
    '',
    'STRUCTURAL FIDELITY (non-negotiable):',
    '- The original drawing is the ABSOLUTE GEOMETRIC AUTHORITY: the output must read as the SAME plan, humanized — never a different apartment/house.',
    '- DO NOT change walls, doors, windows, room shapes, or proportions.',
    '- DO NOT add or remove rooms. DO NOT alter the layout in any way.',
    '- Camera stays strict TOP-DOWN orthographic. No perspective, no isometric.',
    '- Preserve the original drawing scale and aspect ratio.',
    ...(escalation ? ['', escalation] : []),
    ...(edgeBlock  ? ['', edgeBlock]  : []),
    '',
    textBlock,
    '',
    `STYLE: ${STYLE_DIRECTIVE[style]}`,
    '',
    `LEVEL: ${LEVEL_DIRECTIVE[level]}`,
    ...(program ? ['', program] : []),
    ...(brief.hasOutdoor && options.addVegetation
      ? ['', 'The plan includes outdoor area: treat it as landscape (paving, planting beds, garden furniture), never as interior flooring.']
      : []),
    ...(optionLines ? ['', `OPTIONS:\n${optionLines}`] : []),
    ...(additionalInstructions?.trim()
      ? ['', `ADDITIONAL USER INSTRUCTIONS (complement the settings above, never override structural fidelity or the text rule):\n${additionalInstructions.trim()}`]
      : []),
    '',
    'Output: a single high-quality top-down humanized floor plan of THIS exact layout, ready for client presentation.',
  ].join('\n')
}
