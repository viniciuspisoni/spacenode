// lib/spaces/reference-prompt.ts
//
// Prompt builder ÚNICO do Spaces (fluxo Referência → Ação → Gerar). Substitui
// o preserve-prompt (uma imagem só, sempre a mestre) e o buildAnguloPrompt
// (dual-reference do eixo Ângulo), unificando os dois em torno da separação
// explícita de papéis:
//
//   Image #1 — referência GEOMÉTRICA (a escolhida pelo usuário). Autoridade
//              máxima de geometria, enquadramento, câmera e elementos.
//   Image #2 — referência de IDENTIDADE (Vista Mestre), presente apenas quando
//              a geométrica é um print cru. Fornece materiais/paleta/luz —
//              NUNCA geometria, câmera ou composição.
//   DNA/briefing — identidade em texto (sempre presentes quando extraídos).
//   USER INTENT — a ação escolhida + card/direção/instrução livre.
//
// Regras de produto codificadas aqui:
//   - A Vista Mestre não pode sobrescrever a geometria da referência atual.
//   - Nada é adicionado/removido/reposicionado sem pedido explícito (tapetes,
//     móveis, luminárias, aberturas, objetos).
//   - Em conflito coerência visual × fidelidade geométrica, vence a geometria
//     da referência (CONFLICT RULE explícita no prompt).
//
// Saída em inglês (modelos de imagem obedecem melhor). Blocos:
// ROLE · REFERENCES · GEOMETRY LOCK · IDENTITY · PROJECT FACTS · USER INTENT ·
// ELEMENT INTEGRITY · CONFLICT RULE · NEGATIVE · OUTPUT.

import type { BriefingArquitetonico } from '@/lib/prompts'
import type { GenerationAction, ProjectDNA, ReferenceKind } from './types'
import type { Resolution } from '@/lib/engines'

export interface GenerationPromptInput {
  action:           GenerationAction
  refKind:          ReferenceKind
  /** Há uma Image #2 (identidade) na chamada? (print cru + Vista Mestre) */
  hasIdentityImage: boolean
  /** Modificador da opção escolhida (card de luz/detalhe/direção), em inglês. */
  userIntent:       string
  /** Instrução livre do usuário (direção personalizada / pedido de material). */
  userInstruction?: string | null
  /** Nome que o usuário deu ao print (vira intenção de viewpoint). */
  referenceLabel?:  string | null
  briefing?:        BriefingArquitetonico | null
  dna?:             ProjectDNA | null
  quality:          Resolution
}

// ── A. ROLE ───────────────────────────────────────────────────
const ROLE_BLOCK =
  'ROLE: You are an architectural visualization specialist. Your job is to ' +
  'preserve real architectural projects, never to reinvent them. Every image ' +
  'you produce must read as another photograph of the SAME project — same ' +
  'design, same identity — never a new design "inspired" by it.'

// ── B. REFERENCES (papéis explícitos) ─────────────────────────
function referencesBlock(input: GenerationPromptInput): string {
  const { hasIdentityImage, refKind } = input

  const geomOrigin =
    refKind === 'print'
      ? 'a NEW view uploaded by the user (it may be a raw sketch, a SketchUp/3D screenshot, an unfinished render or a photo)'
      : refKind === 'vista'
        ? 'an image from this project chosen by the user'
        : "the project's master view chosen by the user"

  if (!hasIdentityImage) {
    return (
      'REFERENCE IMAGE (single):\n' +
      `Image #1 — GEOMETRIC AND VISUAL AUTHORITY. It is ${geomOrigin}. ` +
      'Its geometry, framing, camera, elements, materials and lighting logic ' +
      'define this project. Everything you generate derives from it.'
    )
  }

  return (
    'TWO REFERENCE IMAGES WITH STRICTLY SEPARATE ROLES:\n' +
    `Image #1 — GEOMETRIC REFERENCE (maximum priority). It is ${geomOrigin}. ` +
    'Preserve EXACTLY its geometry, framing, perspective, camera angle, ' +
    'composition, volumes, proportions and every visible element and opening ' +
    '(windows, doors, voids, recesses). Do NOT move, add, remove, redraw, ' +
    'simplify or reinterpret any element. The result must align ' +
    'element-by-element with Image #1.\n' +
    "Image #2 — VISUAL IDENTITY REFERENCE ONLY (the project's master view). " +
    'Use it solely as the source of materials, textures, color palette, finish ' +
    'quality, lighting language and mood. Do NOT borrow geometry, camera, ' +
    'composition, framing, layout or any object placement from Image #2. ' +
    'Do NOT reproduce the scene of Image #2.'
  )
}

// ── C. GEOMETRY LOCK ──────────────────────────────────────────
//
// O que fica travado em relação à Image #1, conforme a ação:
//   - luz/material: tudo, inclusive câmera.
//   - detalhe: tudo, mas o enquadramento pode FECHAR (crop da mesma vista).
//   - nova_vista + print: tudo da Image #1 (o print é a nova vista).
//   - nova_vista + mestre/histórico: a câmera se move; arquitetura travada.
function geometryLockBlock(input: GenerationPromptInput): string {
  const { action, refKind } = input
  const cameraMoves = action === 'nova_vista' && refKind !== 'print'
  const closerCrop  = action === 'detalhe'

  const items = [
    'geometry, volumetry, proportions and scale',
    'wall positions and floor plan logic',
    'ceilings and ceiling design (forros): height, plane and detailing',
    'openings (windows and doors): count, size, shape, position and rhythm',
    'window and door frames (esquadrias)',
    'facade rhythm and composition',
    'roof profile, slabs, columns, brises, railings',
    'terrain, boundaries and site implantation',
    !cameraMoves && !closerCrop ? 'camera position, viewing angle, perspective and framing' : null,
  ].filter(Boolean)

  const head =
    'GEOMETRY LOCK (relative to Image #1): preserve rigorously, ' +
    'faithful to the reference:\n- ' + items.join(';\n- ') + '.\n'

  if (closerCrop) {
    return head +
      'CLOSER CROP: the framing may move CLOSER to crop/zoom into a region of ' +
      'THIS SAME view — same perspective, same lens character, same ' +
      'architecture, same materials. It is a tighter crop of the existing ' +
      'scene: never a new camera angle, never a relayout. Everything that ' +
      'remains in frame must match Image #1 exactly.'
  }

  if (cameraMoves) {
    return head +
      'THE CAMERA MAY MOVE: produce a NEW viewpoint as requested, but of this ' +
      'SAME project — same architectural language, same volumetry, same ' +
      'opening logic, same materials. The output must read as another ' +
      'photograph of the same project, never another project.'
  }

  return head
}

// ── D. IDENTITY (DNA em texto) ────────────────────────────────
function identityBlock(input: GenerationPromptInput): string {
  const { dna, hasIdentityImage } = input
  if (!dna) return ''
  const mats = dna.materiais.map(m => `${m.nome} (${m.hex})`).join(', ')
  const from = hasIdentityImage ? 'Image #2 and the data below' : 'the reference and the data below'
  return (
    `PROJECT VISUAL IDENTITY (from ${from} — apply as finish/materials/mood ONLY, never as geometry):\n` +
    `- Style: ${dna.estilo.nome}\n` +
    `- Materials: ${mats}\n` +
    `- Palette: ${dna.paleta.join(', ')}\n` +
    `- Context: ${dna.contexto.join(', ')}`
  )
}

// ── E. PROJECT FACTS (briefing como lock factual) ─────────────
function factsBlock(briefing?: BriefingArquitetonico | null): string {
  if (!briefing) return ''
  const locked = briefing.elementos_preservar.length > 0
    ? `\n- Locked elements: ${briefing.elementos_preservar.join('; ')}`
    : ''
  return (
    'PROJECT FACTS (factual description of this project — must remain true):\n' +
    `- Type: ${briefing.tipo_projeto}\n` +
    `- Geometry: ${briefing.geometria_principal} | ${briefing.volumes} | ${briefing.pavimentos} stories\n` +
    `- Openings: ${briefing.aberturas}\n` +
    `- Visible materials: ${briefing.materiais_aparentes}\n` +
    `- Surroundings: ${briefing.entorno}` +
    locked
  )
}

// ── F. USER INTENT (por ação) ─────────────────────────────────
function userIntentBlock(input: GenerationPromptInput): string {
  const { action, refKind, userIntent, userInstruction, referenceLabel } = input
  const intent      = userIntent.trim()
  const instruction = (userInstruction ?? '').trim()
  const label       = (referenceLabel ?? '').trim()

  let core: string
  if (action === 'nova_vista') {
    if (refKind === 'print') {
      core =
        "Turn the user's uploaded view (Image #1) into a finished photorealistic " +
        'architectural render of this project. Image #1 IS the new view: keep its ' +
        'exact geometry, camera and framing, and apply the project identity ' +
        '(materials, finish, lighting language) on top of it.' +
        (label ? ` The user calls this view: "${label}".` : '')
    } else {
      core =
        'Produce a NEW viewpoint of this SAME project. Requested direction: ' +
        (intent ? `${intent}. ` : '') +
        (instruction ? `User's own words (may be in Portuguese): "${instruction}". ` : '') +
        'Keep the architectural DNA intact.'
    }
  } else if (action === 'luz') {
    core =
      'Change ONLY the lighting and atmosphere of the scene in Image #1: ' +
      `${intent}. Light direction, exposure, sky and shadows update coherently; ` +
      'architecture, camera, materials and every object stay exactly as they are.'
  } else if (action === 'material') {
    core =
      'Change ONLY the material/surface the user specified, exactly as asked. ' +
      `User request (may be written in Portuguese): "${instruction}". ` +
      'Apply the new material with realistic texture and correct perspective on ' +
      'that surface alone. Every other surface, object, opening, the camera and ' +
      'the lighting stay exactly as in Image #1.'
  } else {
    core =
      'Create a closer architectural crop of Image #1 focused on: ' +
      `${intent}. Same design language, materials, palette, lighting logic and ` +
      'proportions — the result must look like another image from the SAME ' +
      'project presentation.'
  }

  return (
    'USER INTENT: ' + core + ' Apply ONLY this change. ' +
    'Do not apply any change that was not explicitly requested.'
  )
}

// ── G. ELEMENT INTEGRITY ──────────────────────────────────────
//
// A regra "não mexe no que não foi pedido", nomeando o que o usuário reclama
// quando muda sozinho: tapetes, móveis, luminárias, aberturas, objetos.
function elementIntegrityBlock(input: GenerationPromptInput): string {
  const { action, refKind } = input
  const adjacentRoomException =
    action === 'nova_vista' && refKind !== 'print'
      ? ' If the requested view reveals areas not visible in Image #1, extend ' +
        'them with restraint and full coherence with the project identity — ' +
        'never inventing a different design.'
      : ''
  return (
    'ELEMENT INTEGRITY: every element visible in Image #1 that remains in ' +
    'frame keeps its position, count, size and type. Do NOT add, remove, ' +
    'replace or reposition rugs, furniture, light fixtures, appliances, ' +
    'artwork, decor objects, plants, openings or any other element unless the ' +
    'user explicitly asked for that specific change.' + adjacentRoomException
  )
}

// ── H. CONFLICT RULE ──────────────────────────────────────────
const CONFLICT_BLOCK =
  'CONFLICT RULE: if visual coherence with the project identity ever conflicts ' +
  'with geometric fidelity to Image #1, GEOMETRY WINS. Follow Image #1 and ' +
  'apply the identity only where it does not alter geometry, framing or elements.'

// ── I. NEGATIVE ───────────────────────────────────────────────
function negativeBlock(input: GenerationPromptInput): string {
  const { action, refKind, hasIdentityImage } = input
  const cameraMoves = action === 'nova_vista' && refKind !== 'print'
  const closerCrop  = action === 'detalhe'

  const base = [
    'do not redesign the architecture',
    'do not change volumetry or proportions',
    'do not change the position, count or shape of any opening',
    'do not change window/door frames (esquadrias)' + (action === 'material' ? ' unless they are the requested surface' : ''),
    'do not change the roof profile',
    'do not change the architectural style',
    'do not distort or warp the perspective',
    'do not turn the image into concept art, illustration or cartoon',
    'do not create surreal, neon, fantasy or generic-AI atmosphere',
    'do not add people, cars, furniture, rugs, lamps or objects that were not requested',
    'do not remove or relocate existing elements',
  ]
  if (action !== 'material') {
    base.push('do not recolor, repaint or replace any existing finish or material')
  }
  if (!cameraMoves && !closerCrop) {
    base.push('do not change the camera, viewing angle, perspective or framing of Image #1')
  }
  if (closerCrop) {
    base.push('do not invent a new camera angle or viewpoint — only crop closer into the existing view')
  }
  if (hasIdentityImage) {
    base.push("do not reproduce Image #2's viewpoint, layout, composition or scene")
    base.push('do not let Image #2 override any geometry of Image #1')
  }

  return 'STRICTLY AVOID: ' + base.join('; ') + '.'
}

// ── J. OUTPUT ─────────────────────────────────────────────────
function outputBlock(quality: Resolution): string {
  return (
    `OUTPUT: photorealistic architectural image, ${quality.toUpperCase()} quality; ` +
    'plausible light and shadows; legible materiality; clean composition; ' +
    'rigorous preservation of the reference; suitable for a professional ' +
    'architecture presentation. No "redesign", no "creative reinterpretation", ' +
    'no "new concept".'
  )
}

// ── Builder ───────────────────────────────────────────────────
export function buildGenerationPrompt(input: GenerationPromptInput): string {
  return [
    ROLE_BLOCK,
    referencesBlock(input),
    geometryLockBlock(input),
    identityBlock(input),
    factsBlock(input.briefing),
    userIntentBlock(input),
    elementIntegrityBlock(input),
    CONFLICT_BLOCK,
    negativeBlock(input),
    outputBlock(input.quality),
  ].filter(Boolean).join('\n\n')
}
