// lib/spaces/reference-prompt.ts
//
// Prompt builder ÚNICO do Spaces (fluxo Referência → Ação → Gerar).
//
// Revisão 2026-07-22 (feedback de testes em prod: texturas repintadas e
// geometria escapando):
//   1. MISSÃO NA PRIMEIRA LINHA — modelos de edição de imagem pesam o início
//      do prompt; a instrução mais crítica de cada ação×referência abre o
//      texto (padrão validado no fix do eixo Ângulo de 2026-06-30, que abria
//      com "Image #1 is the ABSOLUTE GEOMETRIC AUTHORITY").
//   2. Bloco novo MATERIAL & TEXTURE FIDELITY — materiais são evidência
//      fotográfica, não sugestão: mesmo padrão de textura, veios, tramas,
//      juntas. Proíbe regenerar textura com padrão novo ou "idealizar".
//   3. DNA reformulado como INVENTÁRIO de verificação ("se a lista divergir
//      da imagem, a imagem vence") — a versão anterior dizia "apply as
//      finish/materials", linguagem de transformação que convidava a
//      repintar superfícies que já estavam corretas.
//   4. Travas de overlay ("output must overlay the reference") e negatives
//      contra "consertar" perspectiva/proporção.
//
// Revisão 2026-08-04 (refactor do modo Spaces — sintoma: geração a partir de
// print upado saindo como variação da Vista Mestre):
//   1. Binding ORDINAL das imagens — "Image #1" é apresentado como "the FIRST
//      attached image" (e #2 como SECOND). Os modelos de edição não recebem os
//      nomes "#1/#2" junto dos pixels; a posição é o único vínculo confiável.
//      (No caminho GCP as imagens agora chegam com rótulo de papel intercalado
//      — ver lib/ai/image-provider imageLabels — e o prompt reforça o mesmo
//      contrato pro caminho FAL.)
//   2. WRONG-BASE CHECK — a falha conhecida (ancorar na Vista Mestre em vez do
//      print) é declarada como modo de erro e proibida explicitamente.
//   3. Escalada de retry (attempt >= 2) + bloco do edge map — usados pelo gate
//      de fidelidade do Spaces (lib/spaces/fidelity.ts), espelhando o
//      render_only do Renderizar.
//
// Papéis (inalterados):
//   Image #1 — referência GEOMÉTRICA (a escolhida pelo usuário). Autoridade
//              máxima de geometria, enquadramento, câmera e elementos.
//   Image #2 — referência de IDENTIDADE (Vista Mestre), presente apenas quando
//              a geométrica é um print cru. Fornece materiais/paleta/luz —
//              NUNCA geometria, câmera ou composição.
//   DNA/briefing — identidade em texto; USER INTENT — a ação escolhida.
//
// Regras de produto codificadas aqui:
//   - A Vista Mestre não pode sobrescrever a geometria da referência atual.
//   - Nada é adicionado/removido/reposicionado sem pedido explícito.
//   - Em conflito coerência visual × fidelidade geométrica, vence a geometria.

import { buildMaterialSamplesBlock, type BriefingArquitetonico, type MaterialSampleRef } from '@/lib/prompts'
import { buildEdgeMapBlock } from '@/lib/ai/fidelity/render-only'
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
  /** 1-based; >= 2 liga o bloco de escalada do retry do gate de fidelidade. */
  attempt?:         number
  /** Índice 1-based do edge map em image_urls quando anexado no retry. */
  edgeMapImageIndex?: number | null
  /** Kit de materiais do Space: amostras anexadas em image_urls (campo →
   *  posição 1-based). Bloco compartilhado com o Renderizar (lib/prompts). */
  materialSamples?: { field: string; imageIndex: number }[]
}

// A câmera se move? Só na Nova Vista a partir de mestre/histórico.
function cameraMoves(input: GenerationPromptInput): boolean {
  return input.action === 'nova_vista' && input.refKind !== 'print'
}

// ── 1. MISSION (primeira linha = a trava mais importante da ação) ──
function missionBlock(input: GenerationPromptInput): string {
  const { action, refKind, hasIdentityImage } = input
  const role =
    'You are an architectural visualization specialist who preserves real ' +
    'projects — never reinvents them.'

  if (action === 'nova_vista') {
    if (refKind === 'print') {
      return (
        "TASK: turn the user's uploaded view (Image #1) into a finished " +
        'photorealistic render of this project. Image #1 is the ABSOLUTE ' +
        'GEOMETRIC AUTHORITY of this generation — its geometry, camera, ' +
        'framing and every element are law and must survive exactly. ' +
        (hasIdentityImage
          ? 'Image #2 supplies the project identity (materials, finish, light ' +
            'character) ONLY — never geometry, never composition. '
          : '') +
        role
      )
    }
    return (
      'TASK: photograph the SAME finished architectural project from a NEW ' +
      'viewpoint. The design is built and immutable — same architecture, same ' +
      'materials and textures, same furniture and objects; ONLY the camera ' +
      'moves. ' + role
    )
  }

  if (action === 'luz') {
    return (
      (refKind === 'print' && hasIdentityImage
        ? "TASK: RELIGHT the user's view (Image #1) while making it a finished " +
          'photorealistic render of this project. Image #1 is the geometric ' +
          'authority — geometry, camera and framing survive exactly; Image #2 ' +
          'supplies the material identity. '
        : 'TASK: RELIGHT this photograph of a real architectural project. This ' +
          'is a minimal edit of the provided image — the output must be the ' +
          'SAME photograph, same camera, same geometry, same materials and the ' +
          'same textures, with ONLY the lighting, shadows, reflections and ' +
          'atmosphere changed. ') +
      role
    )
  }

  if (action === 'material') {
    return (
      'TASK: SURGICAL MATERIAL SWAP on this photograph of a real ' +
      'architectural project. Replace ONLY the surface(s) the user explicitly ' +
      'named; every other pixel-level characteristic of the image — geometry, ' +
      'camera, framing, all other materials and their textures, furniture, ' +
      'lighting — must remain IDENTICAL to the reference. ' + role
    )
  }

  // detalhe
  return (
    'TASK: produce a CLOSER CROP of this same photograph — the same shot, the ' +
    'same perspective and lens character, only a tighter framing on the ' +
    'requested region. Nothing in the scene may be redesigned, moved, ' +
    're-textured or reinterpreted; the crop magnifies what already exists. ' +
    role
  )
}

// ── 2. REFERENCES (papéis explícitos + conflict rule no caso dual) ──
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
      'Its geometry, framing, camera, elements, materials and textures define ' +
      'this project. Everything you generate derives from it; when in doubt, ' +
      'copy it.'
    )
  }

  return (
    'TWO REFERENCE IMAGES WITH STRICTLY SEPARATE ROLES (in attachment order):\n' +
    `Image #1 = the FIRST attached image — GEOMETRIC REFERENCE (maximum ` +
    `priority). It is ${geomOrigin}. ` +
    'Preserve EXACTLY its geometry, framing, perspective, camera angle, ' +
    'composition, volumes, proportions and every visible element and opening ' +
    '(windows, doors, voids, recesses). Do NOT move, add, remove, redraw, ' +
    'simplify or reinterpret any element. The result must align ' +
    'element-by-element with Image #1, edge over edge.\n' +
    "Image #2 = the SECOND attached image — VISUAL IDENTITY REFERENCE ONLY " +
    "(the project's reference image). Copy from it the physical materials, " +
    'textures, color palette, finish quality, lighting language and mood — ' +
    'faithfully, transferring each material onto the MATCHING surface of ' +
    'Image #1 (wall finish onto walls, floor onto floors, frames onto frames), ' +
    'without substituting materials. Do NOT borrow geometry, camera, ' +
    'composition, framing, layout or any object placement from Image #2. Do ' +
    "NOT reproduce Image #2's scene.\n" +
    'CONFLICT RULE: if the identity of Image #2 ever conflicts with the ' +
    'geometry of Image #1, GEOMETRY WINS — follow Image #1 and apply identity ' +
    'only where it does not alter geometry, framing or elements.\n' +
    'WRONG-BASE CHECK (known failure mode — forbidden): generating a variation ' +
    'of Image #2, or any output whose scene, camera, framing or layout ' +
    "resembles Image #2 instead of Image #1, is a FAILED generation. Image #2's " +
    'scene must never appear in the output — the output is Image #1, made real. ' +
    'Before finishing, verify the output overlays Image #1, not Image #2.'
  )
}

// ── 2b. RETRY ESCALATION (só attempt >= 2 — gate de fidelidade) ──
// A tentativa anterior divergiu da referência geométrica (score baixo — em
// geral troca de âncora ou drift de geometria). Reforça o modo "trace, not
// inspiration" sem expor a tentativa anterior (frame de prioridade absoluta,
// não de correção) — mesmo racional do render_only do Renderizar.
function escalationBlock(input: GenerationPromptInput): string {
  if ((input.attempt ?? 1) <= 1) return ''
  const dualNote = input.hasIdentityImage
    ? ' Image #2 contributes ONLY surface materials and light character — zero ' +
      'geometry, zero composition, zero scene content.'
    : ''
  return (
    'ABSOLUTE STRUCTURAL PRIORITY: treat Image #1 as a fixed template that you ' +
    'TRACE, never as inspiration. This pass is a pure re-texturing and ' +
    'relighting of the exact scene in Image #1 — as if projecting materials ' +
    'and light onto its existing geometry. Reproduce the position, size and ' +
    'outline of every wall, opening, piece of furniture and object of Image #1 ' +
    'with zero deviation. When in doubt between beauty and accuracy, always ' +
    'choose accuracy to Image #1.' + dualNote
  )
}

// ── 3. GEOMETRY LOCK ──────────────────────────────────────────
function geometryLockBlock(input: GenerationPromptInput): string {
  const { action } = input
  const moves      = cameraMoves(input)
  const closerCrop = action === 'detalhe'

  const items = [
    'geometry, volumetry, proportions and scale',
    'wall positions and floor plan logic',
    'ceilings and ceiling design (forros): height, plane and detailing',
    'openings (windows and doors): count, size, shape, position and rhythm',
    'window and door frames (esquadrias)',
    'facade rhythm and composition',
    'roof profile, slabs, columns, brises, railings',
    'terrain, boundaries and site implantation',
    !moves && !closerCrop ? 'camera position, viewing angle, perspective and framing' : null,
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
      'remains in frame must match Image #1 exactly, edge over edge.'
  }

  if (moves) {
    return head +
      'THE CAMERA MAY MOVE: produce a NEW viewpoint as requested, but of this ' +
      'SAME project — same architectural language, same volumetry, same ' +
      'opening logic, same materials. The output must read as another ' +
      'photograph of the same project, never another project.'
  }

  return head +
    'OVERLAY RULE: the output must overlay the reference — every edge, wall ' +
    'line, opening contour and object silhouette in the same position, at the ' +
    'same size, seen from the same camera.'
}

// ── 4. MATERIAL & TEXTURE FIDELITY (novo — resposta ao drift de textura) ──
function textureFidelityBlock(input: GenerationPromptInput): string {
  const { action, hasIdentityImage } = input

  const source = hasIdentityImage
    ? 'the reference images (Image #1 where finished, Image #2 for the project identity)'
    : 'the reference image'

  const scopeException =
    action === 'material'
      ? ' This applies to EVERY surface except the one(s) the user explicitly asked to change.'
      : ''

  const lightNote =
    action === 'luz'
      ? ' Lighting changes how surfaces are LIT — never what they are made of: ' +
        'albedo, texture pattern and material identity stay constant; only ' +
        'illumination, shadow direction, color temperature and reflections update.'
      : ''

  const cropNote =
    action === 'detalhe'
      ? ' When magnifying, reveal the texture that plausibly exists in the ' +
        'reference — do not invent a new pattern at close range.'
      : ''

  return (
    `MATERIAL & TEXTURE FIDELITY: the materials visible in ${source} are ` +
    'photographic evidence, not suggestions. Reproduce the exact same physical ' +
    'materials with the same texture pattern and scale, the same wood grain ' +
    'direction, the same stone/marble veining layout, the same fabric weave, ' +
    'the same tile/grout and joint alignment, the same finish (matte/gloss) ' +
    'and the same imperfections. Never substitute a material for a ' +
    'similar-looking one, never regenerate a texture with a new random ' +
    'pattern, never idealize or "clean up" real surfaces.' +
    scopeException + lightNote + cropNote
  )
}

// ── 5. IDENTITY (DNA como inventário de verificação, não repintura) ──
function identityBlock(input: GenerationPromptInput): string {
  const { dna, hasIdentityImage } = input
  if (!dna) return ''
  const mats = dna.materiais.map(m => `${m.nome} (${m.hex})`).join(', ')

  if (hasIdentityImage) {
    return (
      'PROJECT VISUAL IDENTITY (from Image #2 and the data below — use as ' +
      'materials/finish/mood applied onto the geometry of Image #1, never as ' +
      'geometry):\n' +
      `- Style: ${dna.estilo.nome}\n` +
      `- Materials: ${mats}\n` +
      `- Palette: ${dna.paleta.join(', ')}\n` +
      `- Context: ${dna.contexto.join(', ')}`
    )
  }

  return (
    'MATERIAL INVENTORY (verification checklist of what is ALREADY in the ' +
    'reference — NOT a repaint instruction; if this list disagrees with the ' +
    'image, the IMAGE wins):\n' +
    `- Style: ${dna.estilo.nome}\n` +
    `- Materials: ${mats}\n` +
    `- Palette: ${dna.paleta.join(', ')}\n` +
    `- Context: ${dna.contexto.join(', ')}`
  )
}

// ── 6. PROJECT FACTS (briefing como lock factual) ─────────────
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

// ── 7. USER INTENT (a mudança pedida — e SÓ ela) ──────────────
function userIntentBlock(input: GenerationPromptInput): string {
  const { action, refKind, userIntent, userInstruction, referenceLabel } = input
  const intent      = userIntent.trim()
  const instruction = (userInstruction ?? '').trim()
  const label       = (referenceLabel ?? '').trim()

  let core: string
  if (action === 'nova_vista') {
    if (refKind === 'print') {
      core =
        'Make Image #1 real: keep its exact geometry, camera and framing, and ' +
        'render it with the project identity.' +
        (label ? ` The user calls this view: "${label}".` : '')
    } else {
      core =
        'Requested direction for the new viewpoint: ' +
        (intent ? `${intent}. ` : '') +
        (instruction ? `User's own words (may be in Portuguese): "${instruction}". ` : '')
    }
  } else if (action === 'luz') {
    core = `Requested lighting: ${intent}.`
  } else if (action === 'material') {
    core =
      `User request (may be written in Portuguese): "${instruction}". ` +
      'Apply the new material(s) with realistic texture and correct ' +
      'perspective on the named surface(s) alone.'
  } else {
    core = `Crop target: ${intent}.`
  }

  return (
    'USER INTENT: ' + core + ' Apply ONLY this change. ' +
    'Do not apply any change that was not explicitly requested.'
  )
}

// ── 8. ELEMENT INTEGRITY ──────────────────────────────────────
function elementIntegrityBlock(input: GenerationPromptInput): string {
  const adjacentRoomException =
    cameraMoves(input)
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

// ── 9. NEGATIVE ───────────────────────────────────────────────
function negativeBlock(input: GenerationPromptInput): string {
  const { action, hasIdentityImage } = input
  const moves      = cameraMoves(input)
  const closerCrop = action === 'detalhe'

  const base = [
    'do not redesign the architecture',
    'do not change volumetry or proportions',
    'do not change the position, count or shape of any opening',
    'do not change window/door frames (esquadrias)' + (action === 'material' ? ' unless they are the requested surface' : ''),
    'do not change the roof profile',
    'do not change the architectural style',
    'do not straighten, re-proportion or "fix" the perspective of the reference',
    'do not distort or warp the perspective',
    'do not turn the image into concept art, illustration or cartoon',
    'do not create surreal, neon, fantasy or generic-AI atmosphere',
    'do not add people, cars, furniture, rugs, lamps or objects that were not requested',
    'do not remove or relocate existing elements',
  ]
  if (action !== 'material') {
    base.push('do not recolor, repaint or replace any existing finish or material')
  }
  base.push('do not alter the texture pattern, veining, grain, weave or joints of any surface that was not explicitly requested to change')
  if (!moves && !closerCrop) {
    base.push('do not change the camera, viewing angle, perspective or framing of Image #1')
    base.push('do not change the aspect or crop of the reference')
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

// ── 10. OUTPUT (fecho com o lembrete de cópia — primazia + recência) ──
function outputBlock(input: GenerationPromptInput): string {
  const closing = cameraMoves(input)
    ? 'The result must read as another photograph of the same finished project.'
    : 'When in doubt about any surface, edge or element, COPY THE REFERENCE exactly.'
  return (
    `OUTPUT: photorealistic architectural image, ${input.quality.toUpperCase()} quality; ` +
    'plausible light and shadows; legible materiality; clean composition; ' +
    'rigorous preservation of the reference; suitable for a professional ' +
    'architecture presentation. No "redesign", no "creative reinterpretation", ' +
    `no "new concept". ${closing}`
  )
}

// ── Builder ───────────────────────────────────────────────────
export function buildGenerationPrompt(input: GenerationPromptInput): string {
  return [
    missionBlock(input),
    referencesBlock(input),
    escalationBlock(input),
    geometryLockBlock(input),
    buildEdgeMapBlock(input.edgeMapImageIndex).trim(),
    textureFidelityBlock(input),
    buildMaterialSamplesBlock(input.materialSamples as MaterialSampleRef[] | undefined).trim(),
    identityBlock(input),
    factsBlock(input.briefing),
    userIntentBlock(input),
    elementIntegrityBlock(input),
    negativeBlock(input),
    outputBlock(input),
  ].filter(Boolean).join('\n\n')
}
