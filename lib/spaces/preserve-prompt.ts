// lib/spaces/preserve-prompt.ts
//
// Prompt builder ESPECÍFICO do Spaces — escrito do zero para tratar a imagem
// upada como a AUTORIDADE do projeto. NÃO reaproveita o buildFidelityPrompt do
// Renderizar, que assume "entrada = maquete 3D/SketchUp a ser convertida em
// foto" e injeta "MATERIAL OVERRIDES (priority over reference)". No Spaces a
// entrada é uma foto/render real do projeto do cliente; reinterpretá-la é o
// bug. Aqui o prompt manda PRESERVAR e mudar apenas o atributo pedido.
//
// Saída em inglês (modelos de imagem obedecem melhor), composta por blocos
// explícitos: A ROLE · B SOURCE LOCK · C USER INTENT · D NEGATIVE · E OUTPUT.
//
// Ver lib/spaces/preservation.ts para os níveis e lib/prompts.ts para a stack
// (oposta) do Renderizar.

import type { BriefingArquitetonico } from '@/lib/prompts'
import type { ProjectDNA } from './types'
import { modeAllowsCloserCrop, type SpacesMode, type SpacesPreservationLevel } from './preservation'

export interface SpacesPromptInput {
  level:     SpacesPreservationLevel
  mode:      SpacesMode
  /** Instrução concreta da ação, em inglês (ex.: o promptModifier do eixo). */
  userIntent: string
  /** Fatos arquitetônicos da Vista Mestre (lock factual). Opcional. */
  briefing?: BriefingArquitetonico | null
  /** DNA visual — usado como REFERÊNCIA de materiais/paleta, nunca override. */
  dna?:      ProjectDNA | null
}

// ── A. ROLE / SYSTEM ──────────────────────────────────────────
const ROLE_BLOCK =
  'ROLE: You are an architectural visualization specialist. Your job is to ' +
  'preserve real architectural projects, never to reinvent them. The image ' +
  'provided by the user is the PRIMARY ARCHITECTURAL SOURCE and the single ' +
  'authority for this project — it is a real photograph or render of a real ' +
  'design, not a draft to be redesigned. The result must be a CONTROLLED ' +
  'VARIATION of the exact same project shown in that image. '

// ── B. SOURCE LOCK ────────────────────────────────────────────
//
// Lista do que é preservado rigorosamente. Câmera/enquadramento entram na
// lista apenas quando o nível NÃO permite nova vista. Materiais existentes
// são travados, exceto o material que o usuário pediu pra trocar (modo
// material).
function sourceLockBlock(level: SpacesPreservationLevel, mode: SpacesMode): string {
  // Detalhe é STRICT mas pode FECHAR o enquadramento (crop). Por isso a câmera
  // não entra na lista de travas — mas a cláusula abaixo deixa claro que é um
  // recorte da MESMA vista, não uma câmera nova.
  const closerCrop     = modeAllowsCloserCrop(mode)
  const preserveCamera = level === 'STRICT_SOURCE_LOCK' && !closerCrop

  const items = [
    'geometry', 'volumetry', 'proportions', 'scale', 'wall positions',
    'ceilings and ceiling design (forros): height, plane, coffers and detailing',
    'openings (windows and doors): their count, size, shape, position and rhythm',
    'window and door frames (esquadrias)',
    'facade rhythm and composition',
    'roof profile, roof slope, eaves and overhangs',
    'columns, slabs, brises/sunscreens, railings/guardrails',
    'boundary walls, terrain and site implantation (implantação)',
    preserveCamera ? 'camera position, viewing angle, perspective and framing' : null,
    'overall composition and immediate context (neighbours, adjacent buildings)',
    'main existing vegetation',
    mode === 'material'
      ? 'all existing materials and finishes EXCEPT the one surface the user explicitly asked to change'
      : 'all existing materials, finishes and colors',
  ].filter(Boolean)

  const head =
    'SOURCE LOCK: The user-provided image is the authority of the project. ' +
    'Preserve the following rigorously, pixel-faithful to the reference:\n- ' +
    items.join(';\n- ') + '.\n'

  // Detalhe: o recorte aproxima, mas continua sendo a MESMA vista do MESMO
  // projeto — nunca uma câmera nova nem um redesenho.
  if (closerCrop) {
    return head +
      'CLOSER CROP: The framing may move CLOSER to crop/zoom into a specific ' +
      'region of THIS SAME view — keeping the same perspective, the same lens ' +
      'character, the same architecture and the same materials. This is a tighter ' +
      'crop of the existing scene: never a new camera angle, never a new viewpoint, ' +
      'never a relayout. Everything that remains in frame must match the reference ' +
      'exactly. '
  }

  // Em ARCH/EXPLORATION a câmera pode mudar, mas tem que continuar sendo o
  // MESMO edifício — não outro projeto "inspirado" na referência.
  const newViewClause = !preserveCamera
    ? 'The camera may move to produce a NEW VIEW of this SAME building, but the ' +
      'architectural DNA above is fixed: same architectural language, same main ' +
      'volumetry, same facade rhythm, same opening logic and the same main ' +
      'materials. The output must read as another photograph of the same building, ' +
      'NOT another building inspired by it. '
    : ''

  return head + newViewClause
}

// Fatos da Vista Mestre como lock factual (não como licença de transformação).
function factsBlock(briefing?: BriefingArquitetonico | null): string {
  if (!briefing) return ''
  const locked = briefing.elementos_preservar.length > 0
    ? `\n- Locked elements: ${briefing.elementos_preservar.join('; ')}`
    : ''
  return (
    'PROJECT FACTS (describe the real project in the reference — must remain identical):\n' +
    `- Type: ${briefing.tipo_projeto}\n` +
    `- Geometry: ${briefing.geometria_principal} | ${briefing.volumes} | ${briefing.pavimentos} stories\n` +
    `- Openings: ${briefing.aberturas}\n` +
    `- Visible materials: ${briefing.materiais_aparentes}\n` +
    `- Surroundings: ${briefing.entorno}` +
    locked + '\n'
  )
}

// DNA como REFERÊNCIA (não override). Ajuda o modelo a manter a paleta/material
// corretos do projeto — diferente do Renderizar, que mandava "priority over
// reference".
function dnaReferenceBlock(dna?: ProjectDNA | null): string {
  if (!dna || dna.materiais.length === 0) return ''
  const mats = dna.materiais.map(m => m.nome).join(', ')
  return (
    'PROJECT MATERIAL REFERENCE (already present in the image — keep them as they ' +
    `are, do not repaint or restyle): ${mats}. `
  )
}

// ── C. USER INTENT ────────────────────────────────────────────
const MODE_INTENT: Record<SpacesMode, string> = {
  luz:      'Change ONLY the lighting: light direction, intensity, exposure, sky and overall atmosphere.',
  clima:    'Change ONLY the weather and atmosphere: sky, clouds, light quality and mood. Architecture stays identical.',
  material: 'Change ONLY the single material/surface the user specified. Every other surface keeps its current material.',
  detalhe:  'Create a closer architectural crop focused on the specified region, derived from the master image. Keep the exact same design language, materials, color palette, lighting logic, architectural style and proportions. Do not redesign, do not relayout, do not change any architecture — the result must look like another image from the SAME project presentation, not a different project.',
  cena:     'Adjust ONLY the requested context/surroundings/vegetation, with restraint, without redesigning the project.',
  camera:   'Produce a new viewpoint of this SAME building, keeping its architectural DNA intact.',
}

function userIntentBlock(mode: SpacesMode, userIntent: string): string {
  const intent = userIntent.trim()
  return (
    'USER INTENT: Apply ONLY the change the user selected. ' +
    MODE_INTENT[mode] +
    (intent ? ` Requested change: ${intent}. ` : ' ') +
    'Do not apply any change that was not explicitly requested. '
  )
}

// ── D. NEGATIVE CONSTRAINTS ───────────────────────────────────
//
// Constraints fortes. A trava de câmera é condicional ao modo: em luz/clima/
// material/detalhe a câmera NÃO pode mudar; em camera (nova vista) ela pode.
function negativeBlock(level: SpacesPreservationLevel, mode: SpacesMode): string {
  const closerCrop = modeAllowsCloserCrop(mode)
  // Detalhe pode fechar o enquadramento, então NÃO travamos a câmera nele — mas
  // proibimos inventar um ângulo/ponto-de-vista novo ou relayout.
  const lockCamera = level === 'STRICT_SOURCE_LOCK' && !closerCrop

  const base = [
    'do not redesign the architecture',
    'do not create a new facade',
    'do not change volumetry',
    'do not change proportions',
    'do not change the position, count or shape of any opening',
    mode === 'material'
      ? 'do not change window/door frames other than the requested material'
      : 'do not change window/door frames (esquadrias)',
    'do not change the roof profile or roof slope',
    'do not change the architectural style',
    'do not distort or warp the perspective',
    'do not turn the image into concept art',
    'do not add decorative elements that were not requested',
    'do not create surreal, neon, fantasy or generic-AI atmosphere',
    'do not remove structural elements',
    'do not change neighbours, boundary walls, terrain or site implantation unless explicitly requested',
    'do not invent dominant new landscaping',
    'do not turn a residential project into a commercial one, or vice-versa',
    'do not add people, cars, furniture or objects that were not requested',
  ]
  if (lockCamera) {
    base.push('do not change the camera, viewing angle, perspective or framing')
  }
  if (closerCrop) {
    base.push('do not invent a new camera angle, a new perspective or a new viewpoint — only crop closer into the existing view')
    base.push('do not relayout, rearrange or redesign the scene')
  }
  if (mode !== 'material') {
    base.push('do not recolor, repaint, restain or replace any existing finish or material')
  }

  return 'STRICTLY AVOID: ' + base.join(', ') + '. '
}

// ── E. OUTPUT STYLE ───────────────────────────────────────────
const OUTPUT_BLOCK =
  'OUTPUT: photorealistic image; plausible architecture; clean composition; ' +
  'legible materiality; natural light or the requested atmosphere; rigorous ' +
  'preservation of the original project; result suitable for a professional ' +
  'architecture presentation. No "redesign", no "creative reinterpretation", ' +
  'no "new concept", no "futuristic", no "fantasy", no "dramatic transformation".'

// ── Builder ───────────────────────────────────────────────────
export function buildSpacesPreservePrompt(input: SpacesPromptInput): string {
  const { level, mode, userIntent, briefing, dna } = input
  return [
    ROLE_BLOCK,
    sourceLockBlock(level, mode),
    factsBlock(briefing),
    dnaReferenceBlock(dna),
    userIntentBlock(mode, userIntent),
    negativeBlock(level, mode),
    OUTPUT_BLOCK,
  ].join('')
}
